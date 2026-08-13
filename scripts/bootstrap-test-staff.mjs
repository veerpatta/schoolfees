/**
 * Creates (or resets) the five smoke-testing staff logins, one per role.
 *
 * Sibling of bootstrap-staff.mjs, same upsert shape, different accounts. It
 * exists so the RBAC permutations in docs/qa/smoke-test-data.md can be
 * re-created on demand instead of living only in one person's password
 * manager — a role-gated bug is invisible if you only ever test as admin.
 *
 * These are real logins against the production project, so:
 *   * every address is on the test-only `qa.vpps.local` domain, never a real
 *     mailbox, and they are easy to spot and disable in one query;
 *   * the passwords come from the environment, never from this file, and the
 *     doc points at a gitignored local file rather than carrying them.
 *
 * Usage (PowerShell):
 *   $env:TEST_STAFF_PASSWORD = "..."; node scripts/bootstrap-test-staff.mjs
 *
 * Add --disable to switch all five off without deleting them.
 */
import { createClient } from "@supabase/supabase-js";

const requiredEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TEST_STAFF_PASSWORD",
];

for (const name of requiredEnvVars) {
  if (!process.env[name]?.trim()) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const disableMode = process.argv.includes("--disable");
const password = process.env.TEST_STAFF_PASSWORD;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/**
 * One per role in lib/auth/roles.ts. The landing route each one should reach
 * after login comes from getDefaultProtectedHref() and is asserted in the
 * smoke doc, because a wrong default is a permission bug wearing a redirect.
 */
const testStaffSpecs = [
  { email: "qa.admin@qa.vpps.local", role: "admin", fullName: "QA Admin" },
  { email: "qa.accountant@qa.vpps.local", role: "accountant", fullName: "QA Accountant" },
  { email: "qa.teacher@qa.vpps.local", role: "teacher", fullName: "QA Teacher" },
  { email: "qa.collector@qa.vpps.local", role: "fee_collector", fullName: "QA Fee Collector" },
  { email: "qa.viewonly@qa.vpps.local", role: "view_only", fullName: "QA View Only" },
];

async function listAllUsers() {
  const users = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw error;
    }

    users.push(...data.users);

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
}

const normalizeEmail = (value) => value.trim().toLowerCase();

async function upsertTestStaff(spec, users) {
  const existingUser =
    users.find(
      (user) => normalizeEmail(user.email ?? "") === normalizeEmail(spec.email),
    ) ?? null;
  const isActive = !disableMode;

  const userMetadata = {
    ...(existingUser?.user_metadata ?? {}),
    full_name: spec.fullName,
  };
  const appMetadata = {
    ...(existingUser?.app_metadata ?? {}),
    staff_role: spec.role,
    is_active: isActive,
  };

  let user;
  let mode;

  if (existingUser) {
    const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
      email: spec.email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
      app_metadata: appMetadata,
    });

    if (error) {
      throw error;
    }

    user = data.user;
    mode = disableMode ? "disabled" : "updated";
  } else {
    if (disableMode) {
      return { email: spec.email, role: spec.role, mode: "absent" };
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: spec.email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
      app_metadata: appMetadata,
    });

    if (error) {
      throw error;
    }

    user = data.user;
    mode = "created";
  }

  const { error: profileError } = await supabase.from("users").upsert(
    {
      id: user.id,
      full_name: spec.fullName,
      role: spec.role,
      is_active: isActive,
      last_login_at: user.last_sign_in_at ?? null,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    throw profileError;
  }

  return { email: spec.email, role: spec.role, mode };
}

async function main() {
  const users = await listAllUsers();
  const results = [];

  for (const spec of testStaffSpecs) {
    results.push(await upsertTestStaff(spec, users));
  }

  console.table(results);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

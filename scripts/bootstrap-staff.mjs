import { createClient } from "@supabase/supabase-js";

const requiredEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BOOTSTRAP_MAIN_ADMIN_PASSWORD",
  "BOOTSTRAP_ACCOUNTS_PASSWORD",
  "BOOTSTRAP_STAFF_PASSWORD",
];

for (const name of requiredEnvVars) {
  if (!process.env[name]?.trim()) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const staffSpecs = [
  {
    email: "raj@vpps.co.in",
    password: process.env.BOOTSTRAP_MAIN_ADMIN_PASSWORD,
    role: "admin",
    fullName: "Main Admin",
  },
  {
    email: "accounts@vpps.co.in",
    password: process.env.BOOTSTRAP_ACCOUNTS_PASSWORD,
    role: "accountant",
    fullName: "Accounts",
  },
  {
    email: "staff@vpps.co.in",
    password: process.env.BOOTSTRAP_STAFF_PASSWORD,
    role: "read_only_staff",
    fullName: "Staff",
  },
];

async function listAllUsers() {
  const users = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

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

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

async function upsertStaffAccount(spec) {
  const users = await listAllUsers();
  const existingUser =
    users.find(
      (user) => normalizeEmail(user.email ?? "") === normalizeEmail(spec.email),
    ) ?? null;

  const userMetadata = {
    ...(existingUser?.user_metadata ?? {}),
    full_name: spec.fullName,
  };
  const appMetadata = {
    ...(existingUser?.app_metadata ?? {}),
    staff_role: spec.role,
    is_active: true,
  };

  let user;
  let mode;

  if (existingUser) {
    const { data, error } = await supabase.auth.admin.updateUserById(
      existingUser.id,
      {
        email: spec.email,
        password: spec.password,
        email_confirm: true,
        user_metadata: userMetadata,
        app_metadata: appMetadata,
      },
    );

    if (error) {
      throw error;
    }

    user = data.user;
    mode = "updated";
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: spec.email,
      password: spec.password,
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
      is_active: true,
      last_login_at: user.last_sign_in_at ?? null,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    throw profileError;
  }

  return {
    email: spec.email,
    role: spec.role,
    mode,
  };
}

async function main() {
  const results = [];

  for (const spec of staffSpecs) {
    results.push(await upsertStaffAccount(spec));
  }

  console.table(results);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

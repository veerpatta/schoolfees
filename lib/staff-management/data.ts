import "server-only";

import { randomBytes } from "crypto";

import { type User } from "@supabase/supabase-js";

import { resolveStaffRole, type StaffRole } from "@/lib/auth/roles";
import { getOptionalEnvVar } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type StaffFormActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  generatedPassword: string | null;
};

export const INITIAL_STAFF_FORM_ACTION_STATE: StaffFormActionState = {
  status: "idle",
  message: null,
  generatedPassword: null,
};

export type StaffAccountRecord = {
  id: string;
  email: string | null;
  fullName: string;
  role: StaffRole;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  emailConfirmedAt: string | null;
  authUserPresent: boolean;
};

type StaffProfileRow = {
  id: string;
  full_name: string;
  role: string | null;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type UpsertStaffAccountInput = {
  email: string;
  fullName: string;
  role: StaffRole;
  password?: string;
  notes?: string | null;
  isActive: boolean;
  updatePasswordIfExists: boolean;
};

type UpsertStaffAccountResult = {
  authUser: User;
  mode: "created" | "updated";
  generatedPassword: string | null;
};

type PublicUserPayload = {
  id: string;
  full_name: string;
  role: StaffRole;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  notes?: string | null;
};

export type BootstrapStaffSpec = {
  email: string;
  password: string;
  role: StaffRole;
  fullName: string;
  notes?: string | null;
};

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeEmail(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    throw new Error("Email is required.");
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(normalized)) {
    throw new Error("Email address is invalid.");
  }

  return normalized;
}

function normalizeFullName(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Full name is required.");
  }

  return normalized;
}

function normalizeNotes(value: string | null | undefined) {
  return normalizeText(value ?? null);
}

function parseActiveFlag(value: unknown, fallback = true) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return fallback;
}

function buildStaffAppMetadata(
  role: StaffRole,
  isActive: boolean,
  existingMetadata: Record<string, unknown> | undefined,
) {
  return {
    ...(existingMetadata ?? {}),
    staff_role: role,
    is_active: isActive,
  };
}

function getUserFullName(user: User | null | undefined) {
  if (!user) {
    return "School Staff";
  }

  return (
    normalizeText(user.user_metadata?.full_name) ??
    normalizeText(user.user_metadata?.name) ??
    normalizeText(user.email?.split("@")[0]) ??
    "School Staff"
  );
}

function getUserRole(user: User | null | undefined) {
  return resolveStaffRole(user?.app_metadata?.staff_role);
}

function getUserActiveState(user: User | null | undefined) {
  return parseActiveFlag(user?.app_metadata?.is_active, true);
}

function generateTemporaryPassword() {
  const entropy = randomBytes(12).toString("base64url");
  return `Tmp!${entropy.slice(0, 4)}aA1${entropy.slice(4, 10)}`;
}

export function validateStaffPassword(password: string) {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  if (!/[A-Z]/.test(password)) {
    throw new Error("Password must include at least one uppercase letter.");
  }

  if (!/[a-z]/.test(password)) {
    throw new Error("Password must include at least one lowercase letter.");
  }

  if (!/[0-9]/.test(password)) {
    throw new Error("Password must include at least one number.");
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new Error("Password must include at least one special character.");
  }
}

export function isStaffManagementConfigured() {
  return Boolean(getOptionalEnvVar("SUPABASE_SERVICE_ROLE_KEY"));
}

function assertStaffManagementConfigured() {
  if (!isStaffManagementConfigured()) {
    throw new Error(
      "Staff management requires SUPABASE_SERVICE_ROLE_KEY on the server.",
    );
  }
}

async function listAllAuthUsers() {
  const adminClient = createAdminClient();
  const users: User[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
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

async function findAuthUserByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const users = await listAllAuthUsers();

  return (
    users.find(
      (user) => normalizeText(user.email)?.toLowerCase() === normalizedEmail,
    ) ?? null
  );
}

async function getAuthUserById(userId: string) {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.getUserById(userId);

  if (error) {
    throw error;
  }

  return data.user;
}

async function countActiveAdmins() {
  const adminClient = createAdminClient();
  const { count, error } = await adminClient
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function upsertStaffProfile(
  payload: PublicUserPayload,
) {
  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("users")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    throw error;
  }
}

async function buildStaffProfilePayload(
  user: User,
  notes: string | null | undefined,
): Promise<PublicUserPayload> {
  const adminClient = createAdminClient();
  const normalizedNotes = normalizeNotes(notes);
  const { data: existingProfile } = await adminClient
    .from("users")
    .select("notes")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    full_name: getUserFullName(user),
    role: getUserRole(user),
    phone: normalizeText(user.phone),
    is_active: getUserActiveState(user),
    last_login_at: user.last_sign_in_at ?? null,
    notes:
      normalizedNotes ??
      ((existingProfile as { notes?: string | null } | null)?.notes ?? null),
  };
}

async function upsertStaffAuthAccount(
  input: UpsertStaffAccountInput,
): Promise<UpsertStaffAccountResult> {
  assertStaffManagementConfigured();

  const adminClient = createAdminClient();
  const email = normalizeEmail(input.email);
  const fullName = normalizeFullName(input.fullName);
  const notes = normalizeNotes(input.notes);
  const existingUser = await findAuthUserByEmail(email);
  const shouldGeneratePassword =
    !existingUser && !normalizeText(input.password);
  const password =
    input.password && normalizeText(input.password)
      ? input.password.trim()
      : shouldGeneratePassword
        ? generateTemporaryPassword()
        : undefined;

  if (password) {
    validateStaffPassword(password);
  }

  const userMetadata = {
    ...(existingUser?.user_metadata ?? {}),
    full_name: fullName,
  };
  const appMetadata = buildStaffAppMetadata(
    input.role,
    input.isActive,
    (existingUser?.app_metadata ?? {}) as Record<string, unknown>,
  );

  let authUser: User;
  let mode: "created" | "updated";

  if (existingUser) {
    const updatePayload: {
      email: string;
      user_metadata: Record<string, unknown>;
      app_metadata: Record<string, unknown>;
      password?: string;
      email_confirm?: boolean;
    } = {
      email,
      user_metadata: userMetadata,
      app_metadata: appMetadata,
      email_confirm: true,
    };

    if (input.updatePasswordIfExists && password) {
      updatePayload.password = password;
    }

    const { data, error } = await adminClient.auth.admin.updateUserById(
      existingUser.id,
      updatePayload,
    );

    if (error) {
      throw error;
    }

    authUser = data.user;
    mode = "updated";
  } else {
    if (!password) {
      throw new Error("An initial password is required for a new staff account.");
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
      app_metadata: appMetadata,
    });

    if (error) {
      throw error;
    }

    authUser = data.user;
    mode = "created";
  }

  const profilePayload = await buildStaffProfilePayload(authUser, notes);
  await upsertStaffProfile(profilePayload);

  return {
    authUser,
    mode,
    generatedPassword: shouldGeneratePassword ? password ?? null : null,
  };
}

export async function listStaffAccounts() {
  assertStaffManagementConfigured();

  const adminClient = createAdminClient();
  const [authUsers, profilesResult] = await Promise.all([
    listAllAuthUsers(),
    adminClient
      .from("users")
      .select(
        "id, full_name, role, phone, is_active, last_login_at, notes, created_at, updated_at",
      ),
  ]);

  if (profilesResult.error) {
    throw profilesResult.error;
  }

  const profileMap = new Map(
    (profilesResult.data ?? []).map((row) => [row.id, row as StaffProfileRow]),
  );
  const authMap = new Map(authUsers.map((user) => [user.id, user]));
  const ids = new Set<string>([
    ...Array.from(profileMap.keys()),
    ...Array.from(authMap.keys()),
  ]);

  return Array.from(ids)
    .map((id) => {
      const authUser = authMap.get(id) ?? null;
      const profile = profileMap.get(id) ?? null;

      return {
        id,
        email: authUser?.email ?? null,
        fullName: profile?.full_name ?? getUserFullName(authUser),
        role: resolveStaffRole(profile?.role ?? getUserRole(authUser)),
        phone: profile?.phone ?? normalizeText(authUser?.phone),
        isActive: profile?.is_active ?? getUserActiveState(authUser),
        lastLoginAt: profile?.last_login_at ?? authUser?.last_sign_in_at ?? null,
        notes: profile?.notes ?? null,
        createdAt: profile?.created_at ?? authUser?.created_at ?? null,
        updatedAt: profile?.updated_at ?? authUser?.updated_at ?? null,
        emailConfirmedAt: authUser?.email_confirmed_at ?? null,
        authUserPresent: Boolean(authUser),
      } satisfies StaffAccountRecord;
    })
    .sort((left, right) => {
      if (left.role !== right.role) {
        return left.role.localeCompare(right.role);
      }

      return left.fullName.localeCompare(right.fullName);
    });
}

export async function createStaffAccount(input: {
  email: string;
  fullName: string;
  role: StaffRole;
  password?: string;
  notes?: string | null;
}) {
  return await upsertStaffAuthAccount({
    email: input.email,
    fullName: input.fullName,
    role: input.role,
    password: input.password,
    notes: input.notes,
    isActive: true,
    updatePasswordIfExists: Boolean(normalizeText(input.password)),
  });
}

export async function updateStaffAccount(input: {
  actorUserId: string;
  userId: string;
  fullName: string;
  role: StaffRole;
  isActive: boolean;
  notes?: string | null;
}) {
  assertStaffManagementConfigured();

  const targetUser = await getAuthUserById(input.userId);
  const targetRole = getUserRole(targetUser);
  const targetIsActive = getUserActiveState(targetUser);
  const removesActiveAdmin =
    targetRole === "admin" &&
    targetIsActive &&
    (input.role !== "admin" || !input.isActive);

  if (
    input.actorUserId === input.userId &&
    (input.role !== "admin" || !input.isActive)
  ) {
    throw new Error(
      "You cannot remove your own admin access or deactivate your own account.",
    );
  }

  if (removesActiveAdmin && (await countActiveAdmins()) <= 1) {
    throw new Error("At least one active admin account must remain available.");
  }

  await upsertStaffAuthAccount({
    email: targetUser.email ?? "",
    fullName: input.fullName,
    role: input.role,
    notes: input.notes,
    isActive: input.isActive,
    updatePasswordIfExists: false,
  });
}

export async function resetStaffAccountPassword(input: {
  userId: string;
  password: string;
}) {
  assertStaffManagementConfigured();

  const password = input.password.trim();
  validateStaffPassword(password);

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(input.userId, {
    password,
  });

  if (error) {
    throw error;
  }
}

export async function provisionBootstrapStaff(specs: BootstrapStaffSpec[]) {
  assertStaffManagementConfigured();

  const results: Array<{
    email: string;
    role: StaffRole;
    mode: "created" | "updated";
  }> = [];

  for (const spec of specs) {
    const result = await upsertStaffAuthAccount({
      email: spec.email,
      fullName: spec.fullName,
      role: spec.role,
      password: spec.password,
      notes: spec.notes,
      isActive: true,
      updatePasswordIfExists: true,
    });

    results.push({
      email: result.authUser.email ?? spec.email,
      role: spec.role,
      mode: result.mode,
    });
  }

  return results;
}

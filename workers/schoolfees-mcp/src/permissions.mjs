/**
 * The office app's RBAC, mirrored for the Worker.
 *
 * The Worker cannot import `lib/auth/roles.ts` — it is TypeScript inside the
 * Next app and this bundle ships to Cloudflare on its own. So the matrix is
 * copied, and `tests/unit/mcp-permissions.test.ts` asserts the copy is
 * byte-equivalent to the original. If someone edits the app's roles and forgets
 * this file, the test fails; it cannot drift quietly.
 *
 * Why this exists at all: the OAuth lane already verifies who signed in, then
 * threw that away — every tool ran with the same service-role reach regardless
 * of who was asking. Now each tool declares the permission it needs, and tools a
 * caller cannot use are not listed to them. That is what makes it safe to widen
 * SCHOOLFEES_MCP_ALLOWED_ROLES past admin/accountant.
 */

export const STAFF_ROLES = ["admin", "accountant", "teacher", "fee_collector", "view_only"];

export const ROLE_PERMISSIONS = {
  admin: [
    "dashboard:view",
    "students:view",
    "students:write",
    "students:edit_basic",
    "students:edit_sr_no",
    "fees:view",
    "fees:write",
    "fees:repayment_plan",
    "payments:view",
    "payments:write",
    "payments:adjust",
    "payments:bulk",
    "payments:waive_late_fee",
    "finance:view",
    "finance:write",
    "finance:approve",
    "ledger:view",
    "receipts:view",
    "receipts:print",
    "defaulters:view",
    "contacts:write",
    "imports:view",
    "reports:view",
    "settings:view",
    "settings:write",
    "staff:manage",
  ],
  accountant: [
    "dashboard:view",
    "students:view",
    "fees:view",
    "payments:view",
    "payments:write",
    "payments:waive_late_fee",
    "finance:view",
    "ledger:view",
    "receipts:view",
    "receipts:print",
    "defaulters:view",
    "imports:view",
    "reports:view",
    "settings:view",
  ],
  teacher: [
    "dashboard:view",
    "students:view",
    "students:edit_basic",
    "fees:view",
    "payments:view",
    "finance:view",
    "ledger:view",
    "receipts:view",
    "defaulters:view",
    "imports:view",
    "reports:view",
    "settings:view",
  ],
  fee_collector: [
    "dashboard:view",
    "students:view",
    "fees:view",
    "payments:view",
    "finance:view",
    "ledger:view",
    "receipts:view",
    "defaulters:view",
    "contacts:write",
    "imports:view",
    "reports:view",
    "settings:view",
  ],
  view_only: ["dashboard:view", "students:view", "defaulters:view", "receipts:view"],
};

export const ROLE_LABELS = {
  admin: "Admin",
  accountant: "Accountant",
  teacher: "Teacher",
  fee_collector: "Fee Collector",
  view_only: "Viewer",
};

/** Same aliases the app accepts, so an older JWT still resolves. */
export function resolveStaffRole(value) {
  if (typeof value === "string" && STAFF_ROLES.includes(value)) return value;
  if (value === "defaulter_followup") return "fee_collector";
  if (value === "read_only_staff") return "view_only";
  return "view_only";
}

/**
 * The service lane is the school's own unattended automation — the morning
 * defaulter run. It has no person behind it, so it gets full read reach and is
 * labelled as such in every payload.
 */
export const SERVICE_IDENTITY = {
  kind: "service",
  role: "admin",
  label: "Schoolfees automation (service token)",
};

export function identityPermissions(identity) {
  if (!identity) return [];
  if (identity.kind === "service") return ROLE_PERMISSIONS.admin;
  return ROLE_PERMISSIONS[resolveStaffRole(identity.role)] || [];
}

/** A tool lists `requires: [...]`; holding any one of them is enough. */
export function identityCan(identity, required) {
  if (!required || required.length === 0) return true;
  const held = identityPermissions(identity);
  return required.some((permission) => held.includes(permission));
}

export function describeIdentity(identity) {
  if (!identity) return { kind: "anonymous", permissions: [] };
  if (identity.kind === "service") {
    return {
      kind: "service",
      label: SERVICE_IDENTITY.label,
      role: "admin",
      permissions: [...ROLE_PERMISSIONS.admin],
      note: "Unattended automation. Full read access, no person attached.",
    };
  }

  const role = resolveStaffRole(identity.role);
  return {
    kind: "staff",
    userId: identity.userId,
    email: identity.email,
    fullName: identity.fullName,
    role,
    roleLabel: ROLE_LABELS[role],
    permissions: [...(ROLE_PERMISSIONS[role] || [])],
  };
}

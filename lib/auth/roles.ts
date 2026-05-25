export const staffRoles = [
  "admin",
  "accountant",
  "teacher",
  "defaulter_followup",
  "view_only",
] as const;

export type StaffRole = (typeof staffRoles)[number];

export const staffPermissions = [
  "dashboard:view",
  "students:view",
  "students:write",
  "students:edit_basic",
  "students:edit_sr_no",
  "fees:view",
  "fees:write",
  "payments:view",
  "payments:write",
  "payments:adjust",
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
] as const;

export type StaffPermission = (typeof staffPermissions)[number];

export const roleLabels: Record<StaffRole, string> = {
  admin: "Admin",
  accountant: "Accountant",
  teacher: "Teacher",
  defaulter_followup: "Defaulter follow-up",
  view_only: "View-only staff",
};

export const roleDescriptions: Record<StaffRole, string> = {
  admin: "Manages staff access, school settings, and correction-safe workflows.",
  accountant:
    "Reviews fee setup, runs daily payment entry, day closing, refund requests, and follow-up reporting.",
  teacher:
    "Adds and edits basic student details (without SR number) and views their own class lists. No financial access.",
  defaulter_followup:
    "Works the defaulter follow-up list and logs parent contact attempts. Sees outstanding amounts only — not receipts or payment history.",
  view_only:
    "Can review dashboard, student, ledger, receipt, and defaulter information without making changes.",
};

const adminPermissions: readonly StaffPermission[] = [
  "dashboard:view",
  "students:view",
  "students:write",
  "students:edit_basic",
  "students:edit_sr_no",
  "fees:view",
  "fees:write",
  "payments:view",
  "payments:write",
  "payments:adjust",
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
];

const accountantPermissions: readonly StaffPermission[] = [
  "dashboard:view",
  "students:view",
  "fees:view",
  "payments:view",
  "payments:write",
  "payments:waive_late_fee",
  "finance:view",
  "finance:write",
  "ledger:view",
  "receipts:view",
  "receipts:print",
  "defaulters:view",
  "contacts:write",
  "reports:view",
];

const teacherPermissions: readonly StaffPermission[] = [
  "dashboard:view",
  "students:view",
  "students:edit_basic",
  "defaulters:view",
];

const defaulterFollowupPermissions: readonly StaffPermission[] = [
  "students:view",
  "defaulters:view",
  "contacts:write",
];

const viewOnlyPermissions: readonly StaffPermission[] = [
  "dashboard:view",
  "students:view",
  "fees:view",
  "payments:view",
  "ledger:view",
  "receipts:view",
  "defaulters:view",
  "imports:view",
  "reports:view",
];

export const rolePermissions: Record<StaffRole, readonly StaffPermission[]> = {
  admin: adminPermissions,
  accountant: accountantPermissions,
  teacher: teacherPermissions,
  defaulter_followup: defaulterFollowupPermissions,
  view_only: viewOnlyPermissions,
};

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && staffRoles.includes(value as StaffRole);
}

// Backward-compatible alias: the database used "read_only_staff" before the
// 5-role expansion. Keep it accepted as an alias to "view_only" for one
// release so any in-flight session metadata still resolves cleanly.
export function resolveStaffRole(value: unknown): StaffRole {
  if (isStaffRole(value)) {
    return value;
  }

  if (value === "read_only_staff") {
    return "view_only";
  }

  return "view_only";
}

export function isStaffPermission(value: unknown): value is StaffPermission {
  return typeof value === "string" && staffPermissions.includes(value as StaffPermission);
}

export function hasRolePermission(role: StaffRole, permission: StaffPermission) {
  return rolePermissions[role].includes(permission);
}

export function hasAnyRolePermission(role: StaffRole, permissions: readonly StaffPermission[]) {
  return permissions.some((permission) => hasRolePermission(role, permission));
}

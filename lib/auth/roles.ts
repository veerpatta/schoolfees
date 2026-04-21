export const staffRoles = [
  "admin",
  "accountant",
  "read_only_staff",
] as const;

export type StaffRole = (typeof staffRoles)[number];

export const staffPermissions = [
  "dashboard:view",
  "students:view",
  "students:write",
  "fees:view",
  "fees:write",
  "payments:view",
  "payments:write",
  "payments:adjust",
  "ledger:view",
  "receipts:view",
  "receipts:print",
  "defaulters:view",
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
  read_only_staff: "Read-only staff",
};

export const roleDescriptions: Record<StaffRole, string> = {
  admin: "Manages staff access, school settings, and correction-safe workflows.",
  accountant:
    "Runs daily fee setup, payment entry, receipts, and follow-up reporting.",
  read_only_staff:
    "Can review dashboard, student, ledger, receipt, and defaulter information without making changes.",
};

export const rolePermissions: Record<StaffRole, readonly StaffPermission[]> = {
  admin: [
    "dashboard:view",
    "students:view",
    "students:write",
    "fees:view",
    "fees:write",
    "payments:view",
    "payments:write",
    "payments:adjust",
    "ledger:view",
    "receipts:view",
    "receipts:print",
    "defaulters:view",
    "imports:view",
    "reports:view",
    "settings:view",
    "settings:write",
    "staff:manage",
  ],
  accountant: [
    "dashboard:view",
    "students:view",
    "payments:view",
    "payments:write",
    "ledger:view",
    "receipts:view",
    "receipts:print",
    "defaulters:view",
  ],
  read_only_staff: [
    "dashboard:view",
    "students:view",
    "fees:view",
    "payments:view",
    "ledger:view",
    "receipts:view",
    "defaulters:view",
    "imports:view",
    "reports:view",
  ],
};

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && staffRoles.includes(value as StaffRole);
}

export function resolveStaffRole(value: unknown): StaffRole {
  return isStaffRole(value) ? value : "read_only_staff";
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

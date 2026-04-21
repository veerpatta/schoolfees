export const staffRoles = [
  "admin",
  "accountant",
  "read_only_staff",
] as const;

export type StaffRole = (typeof staffRoles)[number];

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

export const rolePermissions: Record<StaffRole, readonly string[]> = {
  admin: [
    "dashboard:view",
    "students:write",
    "fees:write",
    "payments:write",
    "ledger:view",
    "receipts:manage",
    "defaulters:view",
    "settings:write",
    "staff:manage",
  ],
  accountant: [
    "dashboard:view",
    "students:view",
    "fees:write",
    "payments:write",
    "ledger:view",
    "receipts:print",
    "defaulters:view",
  ],
  read_only_staff: [
    "dashboard:view",
    "students:view",
    "fees:view",
    "ledger:view",
    "receipts:view",
    "defaulters:view",
  ],
};

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && staffRoles.includes(value as StaffRole);
}

export function resolveStaffRole(value: unknown): StaffRole {
  return isStaffRole(value) ? value : "admin";
}

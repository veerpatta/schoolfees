export const staffRoles = [
  "admin",
  "accountant",
  "teacher",
  "fee_collector",
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
  fee_collector: "Fee Collector",
  view_only: "Viewer",
};

export const roleDescriptions: Record<StaffRole, string> = {
  admin: "Full access to every workspace, including staff, settings, and corrections.",
  accountant:
    "Posts payments, waives late fees, and reprints receipts. Reads everything else; no edits outside the Payment Desk.",
  teacher:
    "Reads every workspace tab. Can edit basic student data (not the SR number). No financial writes.",
  fee_collector:
    "Defaults to the Defaulters list. Logs parent contact attempts and follow-ups. Reads every other tab; no financial writes.",
  view_only:
    "Read-only access for oversight: Dashboard, Students, Defaulters, and Receipts. Cannot post payments or edit any record.",
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

// Accountant: payment entry + late-fee waiver + receipt print. Everything
// else is view-only. Day-close/refund/correction stays admin-only.
const accountantPermissions: readonly StaffPermission[] = [
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
];

// Teacher: reads every tab; can edit basic student fields (never SR No).
// No financial writes.
const teacherPermissions: readonly StaffPermission[] = [
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
];

// Fee Collector: defaulters first; writes contact logs; reads everything.
// Replaces the older "defaulter_followup" role and absorbs its scope plus
// full-app read access.
const feeCollectorPermissions: readonly StaffPermission[] = [
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
];

// Viewer: practical read-only oversight. Dashboard for a daily snapshot,
// Students for lookups, Defaulters for the call list, Receipts for reprints.
// Tighter than the old read_only_staff scope, which exposed every :view.
const viewerPermissions: readonly StaffPermission[] = [
  "dashboard:view",
  "students:view",
  "defaulters:view",
  "receipts:view",
];

export const rolePermissions: Record<StaffRole, readonly StaffPermission[]> = {
  admin: adminPermissions,
  accountant: accountantPermissions,
  teacher: teacherPermissions,
  fee_collector: feeCollectorPermissions,
  view_only: viewerPermissions,
};

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && staffRoles.includes(value as StaffRole);
}

// Backward-compatible aliases. The role schema has moved twice:
//   - "read_only_staff" was the original name for view_only.
//   - "defaulter_followup" was the original name for fee_collector.
// We accept both so any in-flight session metadata or cached JWTs continue
// to resolve cleanly after the rename. Drop these once a release cycle has
// elapsed and all clients have rotated.
export function resolveStaffRole(value: unknown): StaffRole {
  if (isStaffRole(value)) {
    return value;
  }

  if (value === "defaulter_followup") {
    return "fee_collector";
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

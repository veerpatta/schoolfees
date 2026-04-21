export type StaffRole = "admin" | "accounts" | "clerk";

export const roleLabels: Record<StaffRole, string> = {
  admin: "Administrator",
  accounts: "Accounts staff",
  clerk: "Front desk clerk",
};

export const roleDescriptions: Record<StaffRole, string> = {
  admin: "Owns policy, user access, and any correction workflow.",
  accounts: "Maintains fee plans, collections, reconciliation, and reports.",
  clerk: "Records collections and reviews student dues without policy access.",
};

export const rolePermissions: Record<StaffRole, readonly string[]> = {
  admin: [
    "students:write",
    "imports:write",
    "fees:write",
    "collections:write",
    "reports:view",
    "settings:write",
    "staff:manage",
  ],
  accounts: [
    "students:read",
    "imports:validate",
    "fees:write",
    "collections:write",
    "reports:view",
    "receipts:print",
  ],
  clerk: [
    "students:read",
    "fees:read",
    "collections:write",
    "reports:view",
    "receipts:print",
  ],
};

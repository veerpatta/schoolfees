export type StaffRole = "admin" | "accounts" | "clerk";

export const rolePermissions: Record<StaffRole, string[]> = {
  admin: ["students:write", "fees:write", "collections:write", "reports:view"],
  accounts: ["students:read", "fees:write", "collections:write", "reports:view"],
  clerk: ["students:read", "fees:read", "collections:write", "reports:view"],
};

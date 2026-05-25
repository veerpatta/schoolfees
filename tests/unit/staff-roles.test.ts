import { describe, expect, it } from "vitest";

import {
  hasRolePermission,
  resolveStaffRole,
  rolePermissions,
  staffRoles,
  type StaffPermission,
} from "@/lib/auth/roles";

describe("staff RBAC matrix", () => {
  it("includes all 5 canonical roles", () => {
    expect(staffRoles).toEqual([
      "admin",
      "accountant",
      "teacher",
      "defaulter_followup",
      "view_only",
    ]);
  });

  it("treats read_only_staff as a backward-compat alias for view_only", () => {
    expect(resolveStaffRole("read_only_staff")).toBe("view_only");
  });

  it("defaults unknown role strings to view_only", () => {
    expect(resolveStaffRole(undefined)).toBe("view_only");
    expect(resolveStaffRole("clerk")).toBe("view_only");
  });

  it("grants admin every staff permission", () => {
    const adminPerms = rolePermissions.admin;
    expect(adminPerms).toContain("students:edit_sr_no");
    expect(adminPerms).toContain("staff:manage");
    expect(adminPerms).toContain("payments:waive_late_fee");
    expect(adminPerms).toContain("contacts:write");
  });

  it("gives accountants payment-write but no student write", () => {
    expect(hasRolePermission("accountant", "payments:write")).toBe(true);
    expect(hasRolePermission("accountant", "payments:waive_late_fee")).toBe(true);
    expect(hasRolePermission("accountant", "students:write")).toBe(false);
    expect(hasRolePermission("accountant", "students:edit_basic")).toBe(false);
    expect(hasRolePermission("accountant", "students:edit_sr_no")).toBe(false);
  });

  it("lets teachers edit basic student fields but never the SR No", () => {
    expect(hasRolePermission("teacher", "students:view")).toBe(true);
    expect(hasRolePermission("teacher", "students:edit_basic")).toBe(true);
    expect(hasRolePermission("teacher", "students:edit_sr_no")).toBe(false);
    expect(hasRolePermission("teacher", "students:write")).toBe(false);
    expect(hasRolePermission("teacher", "payments:view")).toBe(false);
    expect(hasRolePermission("teacher", "receipts:view")).toBe(false);
  });

  it("keeps defaulter_followup blind to finance records and the dashboard", () => {
    expect(hasRolePermission("defaulter_followup", "defaulters:view")).toBe(true);
    expect(hasRolePermission("defaulter_followup", "contacts:write")).toBe(true);
    expect(hasRolePermission("defaulter_followup", "students:view")).toBe(true);
    expect(hasRolePermission("defaulter_followup", "dashboard:view")).toBe(false);
    expect(hasRolePermission("defaulter_followup", "payments:view")).toBe(false);
    expect(hasRolePermission("defaulter_followup", "payments:write")).toBe(false);
    expect(hasRolePermission("defaulter_followup", "receipts:view")).toBe(false);
    expect(hasRolePermission("defaulter_followup", "finance:view")).toBe(false);
  });

  it("matches the previous read_only_staff permission set under view_only", () => {
    const expected: StaffPermission[] = [
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
    for (const permission of expected) {
      expect(hasRolePermission("view_only", permission)).toBe(true);
    }
    expect(hasRolePermission("view_only", "payments:write")).toBe(false);
    expect(hasRolePermission("view_only", "students:write")).toBe(false);
  });
});

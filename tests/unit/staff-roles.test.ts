import { describe, expect, it } from "vitest";

import {
  hasRolePermission,
  resolveStaffRole,
  rolePermissions,
  roleLabels,
  staffPermissions,
  staffRoles,
  type StaffPermission,
  type StaffRole,
} from "@/lib/auth/roles";

describe("staff RBAC matrix", () => {
  it("includes all 5 canonical roles", () => {
    expect(staffRoles).toEqual([
      "admin",
      "accountant",
      "teacher",
      "fee_collector",
      "view_only",
    ]);
  });

  it("treats defaulter_followup as a backward-compat alias for fee_collector", () => {
    expect(resolveStaffRole("defaulter_followup")).toBe("fee_collector");
  });

  it("treats read_only_staff as a backward-compat alias for view_only", () => {
    expect(resolveStaffRole("read_only_staff")).toBe("view_only");
  });

  it("defaults unknown role strings to view_only", () => {
    expect(resolveStaffRole(undefined)).toBe("view_only");
    expect(resolveStaffRole("clerk")).toBe("view_only");
  });

  it("uses Viewer / Fee Collector labels in the UI", () => {
    expect(roleLabels.view_only).toBe("Viewer");
    expect(roleLabels.fee_collector).toBe("Fee Collector");
  });

  it("grants admin every staff permission", () => {
    const adminPerms = rolePermissions.admin;
    for (const permission of staffPermissions) {
      expect(adminPerms, `admin missing ${permission}`).toContain(permission);
    }
  });

  it("limits accountant to payment-write + late-fee waiver + receipt-print and reads elsewhere", () => {
    expect(hasRolePermission("accountant", "payments:write")).toBe(true);
    expect(hasRolePermission("accountant", "payments:waive_late_fee")).toBe(true);
    expect(hasRolePermission("accountant", "receipts:print")).toBe(true);

    // The previous role definition included finance:write / contacts:write;
    // the new spec is "rest view-only, nothing editable". Day-close,
    // refunds and contact logging stay outside the accountant scope.
    expect(hasRolePermission("accountant", "finance:write")).toBe(false);
    expect(hasRolePermission("accountant", "contacts:write")).toBe(false);
    expect(hasRolePermission("accountant", "payments:adjust")).toBe(false);

    // No student / fee / settings writes.
    expect(hasRolePermission("accountant", "students:write")).toBe(false);
    expect(hasRolePermission("accountant", "students:edit_basic")).toBe(false);
    expect(hasRolePermission("accountant", "students:edit_sr_no")).toBe(false);
    expect(hasRolePermission("accountant", "fees:write")).toBe(false);
    expect(hasRolePermission("accountant", "settings:write")).toBe(false);

    // Reads everything that exists as a :view permission.
    for (const permission of [
      "dashboard:view",
      "students:view",
      "fees:view",
      "payments:view",
      "finance:view",
      "ledger:view",
      "receipts:view",
      "defaulters:view",
      "imports:view",
      "reports:view",
      "settings:view",
    ] satisfies StaffPermission[]) {
      expect(
        hasRolePermission("accountant", permission),
        `accountant missing ${permission}`,
      ).toBe(true);
    }
  });

  it("lets teachers edit basic student fields, never SR No, and read every tab", () => {
    expect(hasRolePermission("teacher", "students:edit_basic")).toBe(true);
    expect(hasRolePermission("teacher", "students:edit_sr_no")).toBe(false);
    expect(hasRolePermission("teacher", "students:write")).toBe(false);

    // No financial writes anywhere.
    expect(hasRolePermission("teacher", "payments:write")).toBe(false);
    expect(hasRolePermission("teacher", "fees:write")).toBe(false);
    expect(hasRolePermission("teacher", "finance:write")).toBe(false);
    expect(hasRolePermission("teacher", "contacts:write")).toBe(false);
    expect(hasRolePermission("teacher", "settings:write")).toBe(false);

    // Reads everything.
    for (const permission of [
      "dashboard:view",
      "students:view",
      "fees:view",
      "payments:view",
      "finance:view",
      "ledger:view",
      "receipts:view",
      "defaulters:view",
      "imports:view",
      "reports:view",
      "settings:view",
    ] satisfies StaffPermission[]) {
      expect(
        hasRolePermission("teacher", permission),
        `teacher missing ${permission}`,
      ).toBe(true);
    }
  });

  it("gives fee_collector contacts:write + every :view, never payment or fee writes", () => {
    expect(hasRolePermission("fee_collector", "defaulters:view")).toBe(true);
    expect(hasRolePermission("fee_collector", "contacts:write")).toBe(true);

    expect(hasRolePermission("fee_collector", "payments:write")).toBe(false);
    expect(hasRolePermission("fee_collector", "fees:write")).toBe(false);
    expect(hasRolePermission("fee_collector", "students:write")).toBe(false);
    expect(hasRolePermission("fee_collector", "students:edit_basic")).toBe(false);
    expect(hasRolePermission("fee_collector", "finance:write")).toBe(false);
    expect(hasRolePermission("fee_collector", "settings:write")).toBe(false);

    // Reads every tab in the workspace.
    for (const permission of [
      "dashboard:view",
      "students:view",
      "fees:view",
      "payments:view",
      "finance:view",
      "ledger:view",
      "receipts:view",
      "defaulters:view",
      "imports:view",
      "reports:view",
      "settings:view",
    ] satisfies StaffPermission[]) {
      expect(
        hasRolePermission("fee_collector", permission),
        `fee_collector missing ${permission}`,
      ).toBe(true);
    }
  });

  it("keeps Viewer scoped to Dashboard / Students / Defaulters / Receipts only", () => {
    const allowed: StaffPermission[] = [
      "dashboard:view",
      "students:view",
      "defaulters:view",
      "receipts:view",
    ];

    for (const permission of allowed) {
      expect(hasRolePermission("view_only", permission)).toBe(true);
    }

    // Everything outside that scope is denied — payments, fees, finance,
    // ledger, imports, reports, settings, and every :write.
    for (const permission of staffPermissions) {
      if (allowed.includes(permission)) continue;
      expect(
        hasRolePermission("view_only", permission),
        `view_only must not grant ${permission}`,
      ).toBe(false);
    }
  });

  it("never grants write or manage permissions outside admin", () => {
    const writePerms: StaffPermission[] = [
      "students:write",
      "students:edit_sr_no",
      "fees:write",
      "payments:adjust",
      "finance:write",
      "finance:approve",
      "settings:write",
      "staff:manage",
    ];

    for (const role of staffRoles) {
      if (role === "admin") continue;
      for (const permission of writePerms) {
        expect(
          hasRolePermission(role, permission),
          `${role} must not have ${permission}`,
        ).toBe(false);
      }
    }
  });
});

// Compile-time guarantee that the test imports stay aligned with the
// type exports they verify. (Vitest doesn't need this at runtime; it
// protects against rename drift.)
export type _StaffRoleProbe = StaffRole;
export type _StaffPermissionProbe = StaffPermission;

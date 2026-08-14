import { describe, expect, it } from "vitest";

import { rolePermissions, staffRoles } from "@/lib/auth/roles";
import {
  describeIdentity,
  identityCan,
  identityPermissions,
  resolveStaffRole,
  ROLE_PERMISSIONS,
  SERVICE_IDENTITY,
  STAFF_ROLES,
} from "../../workers/schoolfees-mcp/src/permissions.mjs";

/**
 * The Worker ships to Cloudflare on its own and cannot import
 * `lib/auth/roles.ts`, so it keeps a copy of the role matrix. A copy can drift,
 * and a drifted copy either hides a tool from someone entitled to it or hands
 * one to someone who is not. This test is the thing that stops that.
 */
describe("MCP permission matrix mirrors the office app", () => {
  it("has the same roles", () => {
    expect(STAFF_ROLES).toEqual([...staffRoles]);
  });

  it("grants each role exactly the permissions the app grants it", () => {
    for (const role of staffRoles) {
      expect(
        [...ROLE_PERMISSIONS[role]].sort(),
        `Worker permissions for "${role}" have drifted from lib/auth/roles.ts. Update workers/schoolfees-mcp/src/permissions.mjs to match.`,
      ).toEqual([...rolePermissions[role]].sort());
    }
  });

  it("resolves the legacy role names the app still accepts", () => {
    expect(resolveStaffRole("defaulter_followup")).toBe("fee_collector");
    expect(resolveStaffRole("read_only_staff")).toBe("view_only");
    // Anything unrecognised lands on the least privileged role, never the most.
    expect(resolveStaffRole("superuser")).toBe("view_only");
    expect(resolveStaffRole(undefined)).toBe("view_only");
  });
});

describe("identity gating", () => {
  it("gives unattended automation full read reach, labelled as automation", () => {
    expect(identityPermissions(SERVICE_IDENTITY)).toEqual(ROLE_PERMISSIONS.admin);
    expect(describeIdentity(SERVICE_IDENTITY)).toMatchObject({
      kind: "service",
      note: expect.stringContaining("no person attached"),
    });
  });

  it("gives an anonymous caller nothing", () => {
    expect(identityPermissions(null)).toEqual([]);
    expect(identityCan(null, ["students:view"])).toBe(false);
  });

  it("passes a tool when the caller holds any one of its permissions", () => {
    const viewer = { kind: "staff", role: "view_only", userId: "u" };

    expect(identityCan(viewer, ["students:view"])).toBe(true);
    expect(identityCan(viewer, ["fees:view", "settings:view"])).toBe(false);
    // A tool that requires nothing is open to anyone who got through the door.
    expect(identityCan(viewer, [])).toBe(true);
  });

  it("describes a staff member without leaking permissions they do not hold", () => {
    const collector = describeIdentity({
      kind: "staff",
      role: "fee_collector",
      userId: "u",
      email: "collector@vpps.co.in",
    });

    expect(collector).toMatchObject({ role: "fee_collector", roleLabel: "Fee Collector" });
    expect(collector.permissions).toContain("defaulters:view");
    expect(collector.permissions).not.toContain("staff:manage");
  });
});

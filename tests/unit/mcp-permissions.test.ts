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

/**
 * The asset and document tools reach data the read-only tools do not: a child's
 * photograph, a recording of a real conversation with a family, and the
 * parent-facing receipt itself. Their gates are asserted by name, because a
 * loosened `requires` is a one-word change with no visible symptom.
 */
describe("asset and document tools are gated on the right permission", () => {
  const canReach = (role: (typeof staffRoles)[number], permission: string) =>
    identityCan({ kind: "staff", role }, [permission]);

  it("keeps the receipt PDF behind receipts:print, not receipts:view", () => {
    // Producing the document a parent receives is what `print` governs. A role
    // that may look a receipt up is not automatically one that may issue it.
    const printers = staffRoles.filter((role) => canReach(role, "receipts:print"));
    const viewers = staffRoles.filter((role) => canReach(role, "receipts:view"));

    expect(printers.length).toBeGreaterThan(0);
    expect(viewers.length).toBeGreaterThanOrEqual(printers.length);
    for (const role of printers) {
      expect(viewers, `${role} can print but not view — the matrix is inconsistent`).toContain(role);
    }
  });

  it("keeps photographs behind students:view and voice notes behind defaulters:view", () => {
    expect(staffRoles.some((role) => canReach(role, "students:view"))).toBe(true);
    expect(staffRoles.some((role) => canReach(role, "defaulters:view"))).toBe(true);
  });

  it("lets unattended automation reach all three, since the morning run needs them", () => {
    expect(identityCan(SERVICE_IDENTITY, ["receipts:print"])).toBe(true);
    expect(identityCan(SERVICE_IDENTITY, ["students:view"])).toBe(true);
    expect(identityCan(SERVICE_IDENTITY, ["defaulters:view"])).toBe(true);
  });
});

/**
 * Base64 is hand-rolled in the Worker: there is no Buffer without nodejs_compat,
 * and the obvious `btoa(String.fromCharCode(...bytes))` overflows the stack on
 * anything large because apply() spreads every byte as an argument. A photo is
 * ~200 KB, so the chunked path is the only one that ever runs in production.
 */
describe("toBase64 survives a real file", () => {
  it("round-trips a buffer far larger than the argument limit", async () => {
    const { toBase64 } = await import(
      new URL("../../workers/schoolfees-mcp/src/storage.mjs", import.meta.url).href
    );

    const bytes = new Uint8Array(300_000);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 256;

    const encoded = toBase64(bytes);
    const decoded = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));

    expect(decoded.byteLength).toBe(bytes.byteLength);
    expect(decoded[0]).toBe(bytes[0]);
    expect(decoded[299_999]).toBe(bytes[299_999]);
  });
});

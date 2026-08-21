import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { rolePermissions, staffRoles } from "@/platform/auth/roles";
import { STUDENT_SEGMENTS } from "@/modules/students/domain/student-segments";
import { officeWorkbookViews } from "@/modules/transactions/domain/workbook";

/**
 * The deep harness keeps second copies on purpose. This is what stops them
 * rotting.
 *
 * A permission test that reads its expectations out of the code under test can
 * only prove the code agrees with itself. So `tests/deep/surface/permissions.ts`
 * and `tests/deep/mcp/registry.mjs` hold hand-written copies of the role matrix
 * and the tool table — and these assertions make a drift between copy and
 * original a two-second unit failure instead of a forty-minute Playwright run
 * that quietly tests the wrong thing. It is the same arrangement
 * `tests/unit/mcp-permissions.test.ts` already uses for the Worker's own copy.
 *
 * The enumerations are checked a second way for a second reason: a harness that
 * claims "exhaustive coverage of every segment" while looping over a stale list
 * of 27 when the app has 28 is worse than one that admits it covers a subset.
 */

const repoRoot = process.cwd();
const read = (relative: string) => readFileSync(path.join(repoRoot, relative), "utf8");

describe("deep harness: role matrix mirror", () => {
  it("matches lib/auth/roles.ts role for role", async () => {
    const { EXPECTED_ROLE_PERMISSIONS, STAFF_ROLES } = await import(
      "../deep/surface/permissions"
    );

    expect([...STAFF_ROLES].sort()).toEqual([...staffRoles].sort());

    for (const role of staffRoles) {
      const expected = [...EXPECTED_ROLE_PERMISSIONS[role]].sort();
      const actual = [...rolePermissions[role]].sort();
      expect(
        expected,
        `tests/deep/surface/permissions.ts disagrees with lib/auth/roles.ts for "${role}". ` +
          "One of them is wrong; decide which before trusting an RBAC run.",
      ).toEqual(actual);
    }
  });

  it("keeps the MCP registry's copy of the matrix in step too", async () => {
    const { ROLE_PERMISSIONS } = await import("../deep/mcp/registry.mjs");

    for (const role of staffRoles) {
      expect(
        [...ROLE_PERMISSIONS[role]].sort(),
        `tests/deep/mcp/registry.mjs disagrees with lib/auth/roles.ts for "${role}".`,
      ).toEqual([...rolePermissions[role]].sort());
    }
  });
});

describe("deep harness: surface enumerations", () => {
  it("covers every student segment the app defines", async () => {
    const { SEGMENT_IDS } = await import("../deep/surface/params");
    const appIds = STUDENT_SEGMENTS.map((segment) => segment.id);

    expect(
      [...SEGMENT_IDS].sort(),
      "The harness imports SEGMENT_IDS from source, so a mismatch means the " +
        "import broke rather than that a list went stale.",
    ).toEqual([...appIds].sort());
  });

  it("covers every transactions view the app defines", async () => {
    const { TRANSACTION_VIEW_VALUES } = await import("../deep/surface/params");
    expect([...TRANSACTION_VIEW_VALUES].sort()).toEqual([...officeWorkbookViews].sort());
  });

  it("lists the dashboard boards the analytics module actually declares", async () => {
    const { DASHBOARD_VIEW_VALUES } = await import("../deep/surface/params");

    // `src/modules/dashboard/data/analytics.ts` opens with `import "server-only"`, which
    // throws in any Node process outside the React Server build — so the
    // harness cannot import it and writes the five values out instead. This
    // reads them back out of the source so the copy cannot drift.
    const source = read("src/modules/dashboard/data/analytics.ts");
    const declared = source
      .match(/export const DASHBOARD_VIEWS = \[([\s\S]*?)\]/)?.[1]
      ?.match(/"([a-z]+)"/g)
      ?.map((value) => value.replace(/"/g, ""));

    expect(declared, "DASHBOARD_VIEWS is no longer a literal array").toBeTruthy();
    expect([...DASHBOARD_VIEW_VALUES].sort()).toEqual([...declared!].sort());
  });

  it("lists every export the exports page offers", async () => {
    const { EXPORT_TYPES } = await import("../deep/surface/params");

    const declared = [
      ...read("src/app/protected/exports/page.tsx").matchAll(/key: "([a-z-]+)"/g),
    ].map((match) => match[1]);

    expect(declared.length, "no export keys found — the page shape changed").toBeGreaterThan(0);
    expect(
      [...EXPORT_TYPES].sort(),
      "An export the page offers but the harness does not download is an " +
        "untested file that lands on somebody's desk.",
    ).toEqual([...new Set(declared)].sort());
  });

  it("globs at least as many protected pages as the old hand-list carried", async () => {
    const { STATIC_PROTECTED_PAGES, ALL_PROTECTED_PAGES } = await import(
      "../deep/surface/routes"
    );

    // The point of globbing is that this number moves on its own when the app
    // grows. The floor guards against the glob silently returning nothing.
    expect(ALL_PROTECTED_PAGES.length).toBeGreaterThanOrEqual(40);
    expect(STATIC_PROTECTED_PAGES).toContain("/protected/dashboard");
    expect(STATIC_PROTECTED_PAGES).toContain("/protected/payments");
    expect(STATIC_PROTECTED_PAGES.every((route) => !route.includes("["))).toBe(true);
  });
});

describe("deep harness: MCP tool registry", () => {
  /**
   * Tool names as the Worker declares them.
   *
   * `name: "..."` also matches the four scope names in `scope.mjs`-adjacent
   * literals, so `collectable` and friends are filtered out explicitly rather
   * than by a cleverer regex that would break the next time a tool module is
   * reformatted.
   */
  function declaredToolNames(): string[] {
    const dir = path.join(repoRoot, "workers/schoolfees-mcp/src/tools");
    const scopeNames = new Set(["on_roll", "collectable", "left_owing", "everyone"]);
    const names = new Set<string>();

    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".mjs")) continue;
      const source = readFileSync(path.join(dir, file), "utf8");
      for (const match of source.matchAll(/name:\s*"([a-z_]+)"/g)) {
        if (!scopeNames.has(match[1])) names.add(match[1]);
      }
    }
    return [...names];
  }

  it("has a fixture for every tool the Worker registers", async () => {
    const { TOOL_NAMES } = await import("../deep/mcp/registry.mjs");
    const declared = declaredToolNames();

    const missing = declared.filter((name) => !TOOL_NAMES.includes(name));
    const extra = TOOL_NAMES.filter((name: string) => !declared.includes(name));

    expect(
      missing,
      "A tool with no fixture is never called by the conformance suite. Add it " +
        "to tests/deep/mcp/registry.mjs rather than letting it go untested.",
    ).toEqual([]);
    expect(extra, "The registry names tools the Worker no longer has.").toEqual([]);
  });

  it("gates the receipt PDF behind receipts:print, which only two roles hold", async () => {
    const { TOOLS, expectedToolsFor } = await import("../deep/mcp/registry.mjs");

    expect(TOOLS.get_receipt_pdf.requires).toEqual(["receipts:print"]);
    expect(expectedToolsFor("admin")).toContain("get_receipt_pdf");
    expect(expectedToolsFor("accountant")).toContain("get_receipt_pdf");
    expect(expectedToolsFor("fee_collector")).not.toContain("get_receipt_pdf");
    expect(expectedToolsFor("view_only")).not.toContain("get_receipt_pdf");
  });

  it("treats requires as an OR, matching identityCan", async () => {
    const { expectedToolsFor } = await import("../deep/mcp/registry.mjs");

    // view_only holds defaulters:view, so every recovery tool is visible to a
    // viewer — including the ones that return parent phone numbers. That is the
    // current design; this pins it so a change is a decision, not a surprise.
    const viewer = expectedToolsFor("view_only");
    expect(viewer).toContain("prepare_followup_messages");
    expect(viewer).toContain("daily_recovery_digest");
    expect(viewer).not.toContain("get_fee_structure");
  });
});

describe("deep harness: documentation drift", () => {
  it("notices when docs/modules/mcp-server.md miscounts the tools", async () => {
    const { TOOL_NAMES } = await import("../deep/mcp/registry.mjs");
    const doc = read("docs/modules/mcp-server.md");
    const claimed = doc.match(/(\d+)\s+tools?\b/i)?.[1];

    expect(claimed, "The MCP doc no longer states a tool count").toBeTruthy();
    expect(
      Number(claimed),
      `docs/modules/mcp-server.md claims ${claimed} tools; the Worker registers ` +
        `${TOOL_NAMES.length}. A doc that undercounts is how get_receipt_pdf, ` +
        "get_student_photo and get_defaulter_voice_note went undocumented.",
    ).toBe(TOOL_NAMES.length);
  });
});

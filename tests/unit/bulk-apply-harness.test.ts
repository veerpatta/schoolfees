import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FORBIDDEN_TABLES, OPERATIONS } from "../../scripts/bulk-apply-operations.mjs";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

type Operation = {
  table: string;
  matchColumn: string;
  // The registry freezes its arrays, so this side has to admit they are readonly.
  writable: readonly string[];
  feeImpact: boolean;
  followUp?: string;
  virtualColumns?: Record<string, string>;
  prepare?: (input: {
    context: Record<string, unknown>;
    value: unknown;
    sessionLabel: string;
  }) => Promise<unknown>;
};

const operations = OPERATIONS as unknown as Record<string, Operation>;

describe("bulk-apply harness", () => {
  it("ships both files and documents them", () => {
    expect(existsSync(join(repoRoot, "scripts/bulk-apply.mjs"))).toBe(true);
    expect(existsSync(join(repoRoot, "scripts/bulk-apply-operations.mjs"))).toBe(true);
    expect(existsSync(join(repoRoot, "docs/workflows/agent-bulk-operations.md"))).toBe(true);
  });

  // The append-only trigger on payments/receipts raises for the service role too,
  // so this list is belt-and-braces — but it is the copy a reader will find first.
  it("never lets an operation name an append-only or generated table", () => {
    for (const table of ["payments", "receipts", "payment_adjustments", "installments"]) {
      expect(FORBIDDEN_TABLES).toContain(table);
    }

    for (const [name, operation] of Object.entries(operations)) {
      expect(FORBIDDEN_TABLES, `${name} writes a forbidden table`).not.toContain(operation.table);
    }
  });

  it("gives every operation an explicit writable allowlist and a match column", () => {
    expect(Object.keys(operations).length).toBeGreaterThan(0);

    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.table, name).toBeTruthy();
      expect(operation.matchColumn, name).toBeTruthy();
      expect(Array.isArray(operation.writable), name).toBe(true);
      expect(operation.writable.length, name).toBeGreaterThan(0);
      // A wildcard would defeat the entire point of the allowlist.
      expect(operation.writable, name).not.toContain("*");
      expect(operation.writable, name).not.toContain("id");
    }
  });

  it("makes every fee-impacting operation say what still has to be done", () => {
    for (const [name, operation] of Object.entries(operations)) {
      if (operation.feeImpact) {
        expect(operation.followUp, `${name} moves money but has no follow-up`).toBeTruthy();
      }
    }
  });

  // The incident this guards: an unscoped class lookup repointed 372 real
  // students into TEST-2026-27. The resolver must never see a class from
  // another session, so a name that exists elsewhere still has to fail here.
  it("resolves a class only within the session it was handed", async () => {
    const operation = operations["student-class"];
    const context = {
      classRows: [
        { id: "test-class-7", class_name: "Class 7", section: null, stream_name: null },
        { id: "test-nursery", class_name: "Nursery", section: null, stream_name: null },
      ],
    };

    await expect(
      operation.prepare!({ context, value: "Class 7", sessionLabel: "TEST-2026-27" }),
    ).resolves.toBe("test-class-7");

    // "Class 9" exists in the live session but is absent from this context,
    // which is what a session-scoped read looks like.
    await expect(
      operation.prepare!({ context, value: "Class 9", sessionLabel: "TEST-2026-27" }),
    ).rejects.toThrow(/No class "Class 9" in session TEST-2026-27/);
  });

  it("refuses an ambiguous class rather than guessing", async () => {
    const operation = operations["student-class"];
    const context = {
      classRows: [
        { id: "a", class_name: "Class 7", section: null, stream_name: null },
        { id: "b", class_name: "Class 7", section: null, stream_name: null },
      ],
    };

    await expect(
      operation.prepare!({ context, value: "Class 7", sessionLabel: "TEST-2026-27" }),
    ).rejects.toThrow(/ambiguous/);
  });

  it("refuses to assign an inactive transport route", async () => {
    const operation = operations["student-transport"];
    const context = {
      routeRows: [
        { id: "r1", route_code: "R1", route_name: "Town", is_active: false },
        { id: "r2", route_code: "R2", route_name: "Village", is_active: true },
      ],
    };

    await expect(
      operation.prepare!({ context, value: "R2", sessionLabel: "TEST-2026-27" }),
    ).resolves.toBe("r2");

    await expect(
      operation.prepare!({ context, value: "R1", sessionLabel: "TEST-2026-27" }),
    ).rejects.toThrow(/inactive/);

    // Clearing a route is a legitimate change, not a lookup failure.
    await expect(
      operation.prepare!({ context, value: null, sessionLabel: "TEST-2026-27" }),
    ).resolves.toBe(null);
  });

  it("keeps the live-session guard, the dry-run default and the audit write in the runner", () => {
    const script = readRepoFile("scripts/bulk-apply.mjs");

    // Dry run is the default: writes happen only behind an explicit --apply.
    expect(script).toContain('const apply = process.argv.includes("--apply")');
    // The live session needs a second, separate opt-in.
    expect(script).toContain('const LIVE_SESSION_LABEL = "2026-27"');
    expect(script).toContain("sessionLabel === LIVE_SESSION_LABEL && !live");
    // recordActivity() no-ops without a userId, so the trail is written here.
    expect(script).toContain('.from("audit_logs").insert(');
    expect(script).toContain("_bulk_apply");
    // A repair that cannot verify itself is not a repair.
    expect(script).toContain("Re-read after applying");
  });

  it("is indexed where an agent will look for it", () => {
    expect(readRepoFile("scripts/README.md")).toContain("bulk-apply.mjs");
    expect(readRepoFile("AGENTS.md")).toContain("agent-bulk-operations.md");
    expect(readRepoFile("CLAUDE.md")).toContain("agent-bulk-operations.md");
  });
});

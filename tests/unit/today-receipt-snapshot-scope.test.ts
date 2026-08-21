import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/lib/workbook/data.ts"), "utf8");

/**
 * Regression: /protected/transactions returned "SOMETHING FAILED" for every
 * user, with `Unable to load today receipt snapshot: TypeError: fetch failed`.
 *
 * `getTodayReceiptSnapshot` scoped by session by loading every active student
 * id (`loadTransactionStudentIds`, capped at 5000) and passing them to
 * `.in("student_id", ...)`. At ~460 students that is ~17KB of UUIDs in the
 * query string, which fetch refuses to send — so the failure scaled in with
 * the roster rather than showing up in testing.
 *
 * The fix scopes server-side through an inner join, the same shape
 * `getShellPulse` uses against this table. Embedding students under RECEIPTS
 * is supported; it is the payments→students embed that has no FK to travel.
 */
describe("today receipt snapshot scoping", () => {
  /**
   * Comments are stripped before asserting: the fix's own comment explains the
   * bug by naming `.in("student_id", ...)`, and a naive substring check
   * matched that prose and failed against correct code.
   */
  function snapshotFn() {
    const start = source.indexOf("export async function getTodayReceiptSnapshot");
    expect(start, "getTodayReceiptSnapshot is missing").toBeGreaterThan(-1);
    const next = source.indexOf("\nexport ", start + 1);
    const body = source.slice(start, next === -1 ? undefined : next);
    return body
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
  }

  it("scopes by join, never by a student-id list in the query string", () => {
    const fn = snapshotFn();

    expect(fn).toContain('student_ref:students!inner(class_ref:classes!inner(session_label))');
    expect(fn).toContain('.eq("student_ref.class_ref.session_label"');

    // The specific thing that broke: an unbounded id list in the URL.
    expect(fn).not.toContain('.in("student_id"');
    expect(fn).not.toContain("loadTransactionStudentIds");
  });

  it("folds both the scoped and unscoped paths through one summariser", () => {
    // Two hand-rolled loops would let the mode totals drift apart.
    const fn = snapshotFn();
    expect(fn.match(/sumReceiptSnapshot\(/g) ?? []).toHaveLength(2);
    expect(source).toContain("function sumReceiptSnapshot(");
  });
});

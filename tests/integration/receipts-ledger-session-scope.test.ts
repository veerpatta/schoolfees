import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();

vi.mock("@/platform/supabase/server", () => ({
  createClient,
}));

vi.mock("server-only", () => ({}));

// Records every `.eq(table, column, value)` applied to any query in the run, so we can
// assert that receipts/ledger data loaders scope to the viewed session by the
// INSTALLMENT-FROZEN session (payment → installments.class → session_label) rather than
// the student's current class. The table is captured too, since the frozen-session path
// reuses the `class_ref.session_label` column name on a different table (installments).
let eqCalls: Array<{ table: string; column: string; value: unknown }> = [];

function createRecordingClient() {
  return {
    from(table: string) {
      const result =
        table === "receipts"
          ? { data: [], error: null, count: 0 }
          : { data: [], error: null };

      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          eqCalls.push({ table, column, value });
          return query;
        }),
        in: vi.fn(() => query),
        or: vi.fn(() => query),
        order: vi.fn(() => query),
        range: vi.fn(() => query),
        limit: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        then: (resolve: (value: unknown) => void) => resolve(result),
      };

      return query;
    },
  };
}

describe("receipts + ledger session scope", () => {
  beforeEach(() => {
    vi.resetModules();
    eqCalls = [];
    createClient.mockResolvedValue(createRecordingClient());
  });

  it("scopes the receipts list to the installment-frozen session, not current class", async () => {
    const { getReceiptsPage } = await import("@/modules/receipts/data/queries");

    await getReceiptsPage("", { page: 1, pageSize: 30 }, "TEST-2026-27");

    // ONE query on receipts, scoped by joining through the payment's frozen
    // installment. This used to be two steps — resolve every scoped receipt id,
    // then `.in("id", …)` — which put the whole id list in the request URL and
    // grew with the roster. See the note in lib/receipts/data.ts.
    expect(eqCalls).toContainEqual({
      table: "receipts",
      column: "payments.installment_ref.class_ref.session_label",
      value: "TEST-2026-27",
    });
    // The old current-class join (receipt → student → current class) must be gone.
    expect(
      eqCalls.some((call) => call.column === "student_ref.class_ref.session_label"),
    ).toBe(false);
  });

  it("scopes the ledger student picker to the installment-frozen session", async () => {
    const { getLedgerPageData } = await import("@/modules/reports/data/ledger-queries");

    await getLedgerPageData({
      searchQuery: "",
      studentId: null,
      entryFilter: "all",
      entryQuery: "",
      sessionLabel: "TEST-2026-27",
    });

    // Scoped by joining students through their frozen installment, in one
    // query. The previous shape loaded every scoped student id and passed them
    // to `.in("id", …)`; on the live session that was 481 uuids and a
    // ~17,800-character URL, and the page died with "TypeError: fetch failed".
    expect(eqCalls).toContainEqual({
      table: "students",
      column: "installments.class_ref.session_label",
      value: "TEST-2026-27",
    });
    // ...never by filtering the students table on its current class session.
    expect(
      eqCalls.some(
        (call) => call.table === "students" && call.column === "class_ref.session_label",
      ),
    ).toBe(false);
  });

  it("builds no id-list filter whose length tracks the roster", () => {
    // The rule this file now exists to protect. Three separate outages have
    // come from serialising a uuid list into a PostgREST filter: e97f283
    // (receipt-id batch), d0d43b9 (today's snapshot), and the Ledger page.
    const sources = [
      readFileSync(join(process.cwd(), "src/modules/receipts/data/queries.ts"), "utf8"),
      readFileSync(join(process.cwd(), "src/modules/reports/data/ledger-queries.ts"), "utf8"),
    ];

    for (const source of sources) {
      expect(source).not.toContain("loadSessionScopedStudentIds");
      expect(source).not.toMatch(/\.in\(\s*["']id["']\s*,\s*session\w*Ids/);
    }
  });

  it("leaves the ledger student picker unscoped when no session is supplied", async () => {
    const { getLedgerPageData } = await import("@/modules/reports/data/ledger-queries");

    await getLedgerPageData({
      searchQuery: "",
      studentId: null,
      entryFilter: "all",
      entryQuery: "",
    });

    expect(eqCalls.some((call) => call.column === "class_ref.session_label")).toBe(false);
  });
});

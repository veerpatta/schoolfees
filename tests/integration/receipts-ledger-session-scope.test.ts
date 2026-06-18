import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
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
    const { getReceiptsPage } = await import("@/lib/receipts/data");

    await getReceiptsPage("", { page: 1, pageSize: 30 }, "TEST-2026-27");

    // Step 1 resolves session-scoped receipt ids by the installment frozen on each payment.
    expect(eqCalls).toContainEqual({
      table: "payments",
      column: "installment_ref.class_ref.session_label",
      value: "TEST-2026-27",
    });
    // The old current-class join (receipt → student → current class) must be gone.
    expect(
      eqCalls.some((call) => call.column === "student_ref.class_ref.session_label"),
    ).toBe(false);
  });

  it("scopes the ledger student picker to the installment-frozen session", async () => {
    const { getLedgerPageData } = await import("@/lib/ledger/data");

    await getLedgerPageData({
      searchQuery: "",
      studentId: null,
      entryFilter: "all",
      entryQuery: "",
      sessionLabel: "TEST-2026-27",
    });

    // Picker scope is derived from installments frozen to the session...
    expect(eqCalls).toContainEqual({
      table: "installments",
      column: "class_ref.session_label",
      value: "TEST-2026-27",
    });
    // ...never by filtering the students table on its current class session.
    expect(
      eqCalls.some(
        (call) => call.table === "students" && call.column === "class_ref.session_label",
      ),
    ).toBe(false);
  });

  it("leaves the ledger student picker unscoped when no session is supplied", async () => {
    const { getLedgerPageData } = await import("@/lib/ledger/data");

    await getLedgerPageData({
      searchQuery: "",
      studentId: null,
      entryFilter: "all",
      entryQuery: "",
    });

    expect(eqCalls.some((call) => call.column === "class_ref.session_label")).toBe(false);
  });
});

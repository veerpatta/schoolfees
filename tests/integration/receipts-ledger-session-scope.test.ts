import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("server-only", () => ({}));

// Records every `.eq(column, value)` applied to any query in the run, so we can assert
// that receipts/ledger data loaders scope to the viewed session.
let eqCalls: Array<{ column: string; value: unknown }> = [];

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
          eqCalls.push({ column, value });
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

  it("scopes the receipts list to the viewed session", async () => {
    const { getReceiptsPage } = await import("@/lib/receipts/data");

    await getReceiptsPage("", { page: 1, pageSize: 30 }, "TEST-2026-27");

    expect(eqCalls).toContainEqual({
      column: "student_ref.class_ref.session_label",
      value: "TEST-2026-27",
    });
  });

  it("scopes the ledger student picker to the viewed session", async () => {
    const { getLedgerPageData } = await import("@/lib/ledger/data");

    await getLedgerPageData({
      searchQuery: "",
      studentId: null,
      entryFilter: "all",
      entryQuery: "",
      sessionLabel: "TEST-2026-27",
    });

    expect(eqCalls).toContainEqual({
      column: "class_ref.session_label",
      value: "TEST-2026-27",
    });
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

import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();

vi.mock("@/platform/supabase/server", () => ({
  createClient,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/modules/students/data/queries", () => ({
  getStudentFormOptions: vi.fn(async () => ({ classOptions: [], routeOptions: [] })),
}));

vi.mock("@/modules/receipts/data/reversals", () => ({
  getReceiptReversalTotals: vi.fn(async () => new Map<string, number>()),
  isReceiptReversed: () => false,
}));

const SESSION = "TEST-2026-27";

// Comfortably past the 100-id batch size so the chunking path is exercised, and
// past the point where a single PostgREST `id=in.(...)` URL would 400.
const RECEIPT_COUNT = 450;

function receiptId(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

/**
 * Receipts are seeded newest-id-last so the DB-order and merged-order differ:
 * payment_date descends as the index ascends, meaning batch 1 holds the NEWEST
 * rows and the final batch the oldest. A naive concat would already be sorted;
 * the reversed seeding below makes an unsorted merge visibly wrong.
 */
function seedReceipts() {
  return Array.from({ length: RECEIPT_COUNT }, (_, index) => ({
    id: receiptId(index),
    receipt_number: `SVP-${index}`,
    // index 0 is the OLDEST; the last index is the newest.
    payment_date: `2026-04-${String((index % 28) + 1).padStart(2, "0")}`,
    created_at: `2026-04-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
    payment_mode: "cash",
    total_amount: 100 + index,
    reference_number: null,
    received_by: null,
    student_id: `student-${index}`,
    student_ref: {
      id: `student-${index}`,
      full_name: `TEST Student ${index}`,
      admission_no: `TEST-${index}`,
      father_name: null,
      primary_phone: null,
      transport_route_id: null,
      class_ref: {
        id: "class-1",
        session_label: SESSION,
        class_name: "Class 1",
        section: "A",
        stream_name: null,
      },
      route_ref: null,
    },
  }));
}

type Captured = { inBatches: string[][]; limits: number[] };

function createWorkbookClient(receipts: ReturnType<typeof seedReceipts>, captured: Captured) {
  const receiptsById = new Map(receipts.map((row) => [row.id, row]));

  return {
    from(table: string) {
      let idFilter: string[] | null = null;
      let rowLimit: number | null = null;

      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        gt: () => builder,
        gte: () => builder,
        lte: () => builder,
        or: () => builder,
        order: () => builder,
        range: () => builder,
        in: (column: string, values: string[]) => {
          if (table === "receipts" && column === "id") {
            captured.inBatches.push([...values]);
            idFilter = values;
          }
          return builder;
        },
        limit: (value: number) => {
          if (table === "receipts") {
            captured.limits.push(value);
            rowLimit = value;
          }
          return builder;
        },
        then: (resolve: (value: unknown) => void) => {
          if (table === "payments") {
            // What loadSessionScopedReceiptIds reads.
            resolve({ data: receipts.map((row) => ({ receipt_id: row.id })), error: null });
            return;
          }

          if (table === "receipts") {
            const rows = (idFilter ?? receipts.map((row) => row.id))
              .map((id) => receiptsById.get(id))
              .filter(Boolean);
            // Mirror the DB `ORDER BY payment_date DESC, created_at DESC` within
            // the batch, then apply the batch's own limit.
            const ordered = [...rows].sort((a, b) => {
              const dateDiff = b!.payment_date.localeCompare(a!.payment_date);
              return dateDiff !== 0 ? dateDiff : b!.created_at.localeCompare(a!.created_at);
            });
            resolve({
              data: rowLimit === null ? ordered : ordered.slice(0, rowLimit),
              error: null,
            });
            return;
          }

          resolve({ data: [], error: null });
        },
      };

      return builder;
    },
  };
}

function createFailingWorkbookClient(receipts: ReturnType<typeof seedReceipts>) {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        gt: () => builder,
        gte: () => builder,
        lte: () => builder,
        or: () => builder,
        order: () => builder,
        range: () => builder,
        in: () => builder,
        limit: () => builder,
        then: (resolve: (value: unknown) => void) => {
          if (table === "payments") {
            resolve({ data: receipts.map((row) => ({ receipt_id: row.id })), error: null });
            return;
          }
          if (table === "receipts") {
            resolve({ data: null, error: { message: "Bad Request" } });
            return;
          }
          resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  };
}

describe("getWorkbookTransactions session receipt-id chunking", () => {
  let captured: Captured;

  beforeEach(() => {
    vi.resetModules();
    captured = { inBatches: [], limits: [] };
  });

  it("splits the session receipt-id filter into batches of at most 100", async () => {
    createClient.mockResolvedValue(createWorkbookClient(seedReceipts(), captured));

    const { getWorkbookTransactions } = await import("@/modules/fees/data/queries");
    await getWorkbookTransactions({ sessionLabel: SESSION, limit: null, skipFinancials: true });

    expect(captured.inBatches.length).toBe(Math.ceil(RECEIPT_COUNT / 100));
    for (const batch of captured.inBatches) {
      expect(batch.length).toBeLessThanOrEqual(100);
    }
    // Every id is covered exactly once — batches are disjoint, nothing dropped.
    const flattened = captured.inBatches.flat();
    expect(new Set(flattened).size).toBe(RECEIPT_COUNT);
  });

  it("merges every batch and keeps the newest-first order across batch boundaries", async () => {
    createClient.mockResolvedValue(createWorkbookClient(seedReceipts(), captured));

    const { getWorkbookTransactions } = await import("@/modules/fees/data/queries");
    const rows = await getWorkbookTransactions({
      sessionLabel: SESSION,
      limit: null,
      skipFinancials: true,
    });

    expect(rows).toHaveLength(RECEIPT_COUNT);
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index - 1].paymentDate >= rows[index].paymentDate).toBe(true);
    }
  });

  it("applies limit/offset to the merged rows, not to each batch", async () => {
    createClient.mockResolvedValue(createWorkbookClient(seedReceipts(), captured));

    const { getWorkbookTransactions } = await import("@/modules/fees/data/queries");
    const all = await getWorkbookTransactions({
      sessionLabel: SESSION,
      limit: null,
      skipFinancials: true,
    });
    const page2 = await getWorkbookTransactions({
      sessionLabel: SESSION,
      limit: 10,
      offset: 10,
      skipFinancials: true,
    });

    expect(page2).toHaveLength(10);
    expect(page2.map((row) => row.receiptId)).toEqual(
      all.slice(10, 20).map((row) => row.receiptId),
    );
    // Each batch must fetch offset+limit rows so the merged window is complete.
    expect(captured.limits.filter((value) => value === 20).length).toBeGreaterThan(1);
  });

  it("throws when a batch fails instead of returning partial rows", async () => {
    createClient.mockResolvedValue(createFailingWorkbookClient(seedReceipts()));

    const { getWorkbookTransactions } = await import("@/modules/fees/data/queries");

    await expect(
      getWorkbookTransactions({ sessionLabel: SESSION, limit: null, skipFinancials: true }),
    ).rejects.toThrow(/Unable to load workbook transactions: Bad Request/);
  });
});

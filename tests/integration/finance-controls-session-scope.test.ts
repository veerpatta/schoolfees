import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("server-only", () => ({}));

const NEW_SESSION = "TEST-2026-27";
const OLD_SESSION = "TEST-2025-26";
const PAYMENT_DATE = "2026-04-21";

// A receipt collected from a student who has since been PROMOTED: their current
// class belongs to the new session, but the payment settled an installment frozen
// in the old session. Money/history views must follow the frozen installment
// session, resolved here through `loadSessionScopedReceiptIds` (payments →
// installments → classes), not the student's current class.
function promotedStudentReceipt() {
  return {
    id: "r1",
    receipt_number: "SVP-TEST-1",
    payment_date: PAYMENT_DATE,
    payment_mode: "cash",
    total_amount: 5000,
    reference_number: null,
    notes: null,
    received_by: "Desk A",
    created_at: `${PAYMENT_DATE}T05:00:00.000Z`,
    created_by: null,
    student_ref: {
      id: "s1",
      full_name: "TEST Promoted Student",
      admission_no: "TEST-001",
      // Current class is the NEW session (student was promoted).
      class_ref: {
        session_label: NEW_SESSION,
        class_name: "Class 2",
        section: "A",
        stream_name: null,
      },
    },
  };
}

// Mirrors how Postgres would answer `loadSessionScopedReceiptIds`: r1's payment
// is frozen to the OLD session, so only the old-session scope returns it.
function sessionScopedPaymentRows(sessionLabel: string | null) {
  return sessionLabel === OLD_SESSION ? [{ receipt_id: "r1" }] : [];
}

function createFinanceClient(receiptRows: unknown[]) {
  const staticTableData: Record<string, { data: unknown[]; error: null }> = {
    receipts: { data: receiptRows, error: null },
    refund_requests: { data: [], error: null },
    payment_adjustments: { data: [], error: null },
  };

  return {
    from(table: string) {
      let capturedSession: string | null = null;

      const builder = {
        select: () => builder,
        eq: (column: string, value: string) => {
          if (table === "payments" && column === "installment_ref.class_ref.session_label") {
            capturedSession = value;
          }
          return builder;
        },
        neq: () => builder,
        gte: () => builder,
        lt: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: (value: unknown) => void) => {
          if (table === "payments") {
            resolve({ data: sessionScopedPaymentRows(capturedSession), error: null });
            return;
          }
          resolve(staticTableData[table] ?? { data: [], error: null });
        },
      };

      return builder;
    },
  };
}

describe("finance controls session scope (promoted student)", () => {
  beforeEach(() => {
    vi.resetModules();
    createClient.mockResolvedValue(createFinanceClient([promotedStudentReceipt()]));
  });

  it("keeps the receipt under the session its installment was frozen in", async () => {
    const { getFinanceControlsPageData } = await import("@/lib/finance-controls/data");

    const data = await getFinanceControlsPageData(PAYMENT_DATE, OLD_SESSION);

    expect(data.summary.receiptCount).toBe(1);
    expect(data.summary.receiptTotal).toBe(5000);
    expect(data.dayBookRows).toHaveLength(1);
    expect(data.dayBookRows[0]?.receiptNumber).toBe("SVP-TEST-1");
  });

  it("does not surface the receipt under the student's new current-class session", async () => {
    const { getFinanceControlsPageData } = await import("@/lib/finance-controls/data");

    const data = await getFinanceControlsPageData(PAYMENT_DATE, NEW_SESSION);

    expect(data.summary.receiptCount).toBe(0);
    expect(data.summary.receiptTotal).toBe(0);
    expect(data.dayBookRows).toHaveLength(0);
  });
});

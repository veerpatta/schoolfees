import { describe, expect, it, vi } from "vitest";

const createClient = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

function receiptQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: "receipt-1",
        student_id: "student-1",
        receipt_number: "SVP20260420-0001",
        payment_date: "2026-04-20",
        payment_mode: "cash",
        total_amount: 1000,
        reference_number: null,
        notes: null,
        received_by: "Office",
        created_at: "2026-04-20T04:30:00.000Z",
        created_by: null,
        student_ref: {
          id: "student-1",
          full_name: "Backdated Student",
          admission_no: "SR-1",
          father_name: "Parent",
          primary_phone: "9999999999",
          class_ref: {
            session_label: "2026-27",
            class_name: "1",
            section: "A",
            stream_name: null,
          },
          route_ref: null,
        },
      },
      error: null,
    }),
  };
}

function paymentsQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({
      data: [
        {
          id: "payment-1",
          amount: 1000,
          notes: null,
          installment_ref: {
            installment_no: 1,
            installment_label: "Installment 1",
            due_date: "2025-04-20",
            class_ref: { session_label: "2025-26" },
          },
        },
      ],
      error: null,
    }),
  };
}

function financialQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        student_id: "student-1",
        session_label: "2026-27",
        student_status_label: "Active",
        tuition_fee: 1000,
        transport_fee: 0,
        academic_fee: 0,
        other_adjustment_head: null,
        other_adjustment_amount: 0,
        discount_amount: 0,
        late_fee_total: 0,
        late_fee_waiver_amount: 0,
        total_due: 1000,
        total_paid: 1000,
        outstanding_amount: 0,
      },
      error: null,
    }),
  };
}

function studentReceiptsQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then(resolve: (value: unknown) => void) {
      return Promise.resolve({
      data: [
        {
          id: "receipt-1",
          total_amount: 1000,
          payment_date: "2026-04-20",
          created_at: "2026-04-20T04:30:00.000Z",
        },
      ],
      error: null,
      }).then(resolve);
    },
  };
}

function adjustmentsQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
}

function conventionalAssignmentsQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then(resolve: (value: unknown) => void) {
      return Promise.resolve({ data: [], error: null }).then(resolve);
    },
  };
}

describe("receipt session display", () => {
  it("shows the paid installment session instead of the student's current session", async () => {
    let receiptsCalls = 0;
    createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "receipts") {
          receiptsCalls += 1;
          return receiptsCalls === 1 ? receiptQuery() : studentReceiptsQuery();
        }
        if (table === "payments") return paymentsQuery();
        if (table === "v_workbook_student_financials") return financialQuery();
        if (table === "receipt_adjustments") return adjustmentsQuery();
        if (table === "student_conventional_discount_assignments") {
          return conventionalAssignmentsQuery();
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const { getReceiptDetail } = await import("@/lib/receipts/data");
    const receipt = await getReceiptDetail("receipt-1");

    expect(receipt?.sessionLabel).toBe("2025-26");
  });
});

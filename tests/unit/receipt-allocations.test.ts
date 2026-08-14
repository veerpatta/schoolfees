import { describe, expect, it } from "vitest";

import {
  buildReceiptAllocationIndex,
  formatAppliedTo,
  type ReceiptAllocationRow,
} from "@/lib/receipts/allocations";

function row(overrides: Partial<ReceiptAllocationRow> = {}): ReceiptAllocationRow {
  return {
    receipt_id: "r1",
    amount: 1000,
    installment_ref: {
      installment_no: 1,
      installment_label: "Installment 1",
      due_date: "2026-04-20",
      is_carry_forward: false,
      source_session_label: null,
    },
    ...overrides,
  };
}

describe("buildReceiptAllocationIndex", () => {
  it("collapses one receipt's payment rows onto that receipt", () => {
    const index = buildReceiptAllocationIndex([
      row(),
      row({
        amount: 500,
        installment_ref: {
          installment_no: 2,
          installment_label: "Installment 2",
          due_date: "2026-07-20",
        },
      }),
    ]);

    expect(index.get("r1")).toEqual([
      { label: "Installment 1", dueDate: "2026-04-20", amount: 1000 },
      { label: "Installment 2", dueDate: "2026-07-20", amount: 500 },
    ]);
  });

  it("keeps receipts apart", () => {
    const index = buildReceiptAllocationIndex([row(), row({ receipt_id: "r2" })]);
    expect(index.size).toBe(2);
    expect(index.get("r2")).toHaveLength(1);
  });

  it("accepts the embedded installment as an object or as an array", () => {
    const asArray = buildReceiptAllocationIndex([
      row({
        installment_ref: [
          { installment_no: 3, installment_label: "Installment 3", due_date: "2026-10-20" },
        ],
      }),
    ]);

    expect(asArray.get("r1")?.[0].label).toBe("Installment 3");
  });

  it("names a carry-forward row the way a parent would recognise it", () => {
    const index = buildReceiptAllocationIndex([
      row({
        installment_ref: {
          installment_no: 0,
          installment_label: "Previous year balance",
          due_date: "2026-04-01",
          is_carry_forward: true,
          source_session_label: "2025-26",
        },
      }),
    ]);

    expect(index.get("r1")?.[0].label).toBe("Previous year tuition balance from 2025-26");
  });

  it("skips rows with no receipt or no installment rather than inventing one", () => {
    const index = buildReceiptAllocationIndex([
      row({ receipt_id: null }),
      row({ receipt_id: "r3", installment_ref: null }),
      row({ receipt_id: "r4", installment_ref: [] }),
    ]);

    expect(index.size).toBe(0);
  });

  it("reads a missing amount as zero rather than NaN", () => {
    const index = buildReceiptAllocationIndex([row({ amount: null })]);
    expect(index.get("r1")?.[0].amount).toBe(0);
  });
});

describe("formatAppliedTo", () => {
  const one = { label: "Installment 1", dueDate: null, amount: 100 };
  const two = { label: "Installment 2", dueDate: null, amount: 100 };
  const three = { label: "Installment 3", dueDate: null, amount: 100 };

  it("returns null when a receipt has no allocation on record", () => {
    expect(formatAppliedTo([])).toBeNull();
  });

  it("names one or two installments outright", () => {
    expect(formatAppliedTo([one])).toBe("Installment 1");
    expect(formatAppliedTo([one, two])).toBe("Installment 1 + Installment 2");
  });

  it("counts beyond two, so the column cannot wrap to three lines on A4", () => {
    expect(formatAppliedTo([one, two, three])).toBe("3 installments");
  });
});

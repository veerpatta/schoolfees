import { getDisplayInstallmentLabel } from "@/lib/prev-year-dues/display";

/**
 * Which installment(s) a receipt was applied to.
 *
 * A receipt is one payment event, but `payments` holds one row per installment
 * it touched — a parent handing over ₹15,000 against two open installments
 * gets one receipt and two payment rows. The statement's "Applied to" column
 * has to name them, so this collapses the rows back onto the receipt.
 *
 * Kept pure and separate from the query so the shape normalisation below is
 * unit-tested rather than re-derived at each call site.
 */

export type ReceiptAllocationRow = {
  receipt_id: string | null;
  amount: number | null;
  /**
   * PostgREST types an embedded FK select as object-or-array depending on what
   * it infers about the relationship, and the inference is not stable across
   * schema changes. Accept both rather than pin one and break silently.
   */
  installment_ref?:
    | ReceiptAllocationInstallment
    | ReceiptAllocationInstallment[]
    | null;
};

type ReceiptAllocationInstallment = {
  installment_no?: number | null;
  installment_label?: string | null;
  due_date?: string | null;
  is_carry_forward?: boolean | null;
  source_session_label?: string | null;
};

export type ReceiptAllocation = {
  label: string;
  dueDate: string | null;
  amount: number;
};

function toSingleRecord(
  value: ReceiptAllocationRow["installment_ref"],
): ReceiptAllocationInstallment | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * receiptId → the installments it paid, in the order the payment rows came back
 * (the caller orders by `created_at`, so this is posting order).
 */
export function buildReceiptAllocationIndex(
  rows: readonly ReceiptAllocationRow[],
): Map<string, ReceiptAllocation[]> {
  const index = new Map<string, ReceiptAllocation[]>();

  for (const row of rows) {
    if (!row.receipt_id) continue;
    const installment = toSingleRecord(row.installment_ref);
    if (!installment) continue;

    const entry: ReceiptAllocation = {
      // Carry-forward rows read "Previous year tuition balance from 2025-26"
      // rather than a raw label a parent would not recognise.
      label: getDisplayInstallmentLabel({
        installmentNo: installment.installment_no,
        installmentLabel: installment.installment_label,
        is_carry_forward: installment.is_carry_forward,
        source_session_label: installment.source_session_label,
      }),
      dueDate: installment.due_date ?? null,
      amount: Number(row.amount ?? 0),
    };

    const existing = index.get(row.receipt_id);
    if (existing) {
      existing.push(entry);
    } else {
      index.set(row.receipt_id, [entry]);
    }
  }

  return index;
}

/**
 * The "Applied to" cell. Two installments still fit a column; beyond that the
 * count is more readable than a list that wraps to three lines on A4.
 */
export function formatAppliedTo(entries: readonly ReceiptAllocation[]): string | null {
  if (entries.length === 0) return null;
  if (entries.length === 1) return entries[0].label;
  if (entries.length === 2) return `${entries[0].label} + ${entries[1].label}`;
  return `${entries.length} installments`;
}

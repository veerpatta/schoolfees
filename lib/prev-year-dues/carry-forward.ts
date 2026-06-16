import {
  CARRY_FORWARD_DUE_DATE,
  CARRY_FORWARD_INSTALLMENT_NO_BASE,
  CARRY_FORWARD_INSTALLMENT_NO_MIN,
  CARRY_FORWARD_LABEL,
  CARRY_FORWARD_LATE_FEE_FLAT_AMOUNT,
} from "@/lib/prev-year-dues/constants";

export type CarryForwardInstallmentInput = {
  studentId: string;
  classId: string;
  feeSettingId: string;
  amount: number;
  /** installment_no values that already exist for this (student, class). */
  existingInstallmentNos?: number[];
  dueDate?: string;
};

export type CarryForwardInstallmentPayload = {
  student_id: string;
  class_id: string;
  fee_setting_id: string;
  installment_no: number;
  installment_label: string;
  due_date: string;
  base_amount: number;
  transport_amount: 0;
  discount_amount: 0;
  late_fee_flat_amount: 0;
  status: "scheduled";
  is_carry_forward: true;
};

/**
 * Pick the sentinel installment_no: the canonical 99, or — if 99 is already
 * taken for this (student, class) — the next free value >= 90. Keeps clear of
 * the real 1–4 schedule while staying detectable.
 */
export function selectCarryForwardInstallmentNo(existingInstallmentNos: number[] = []): number {
  const taken = new Set(existingInstallmentNos);
  if (!taken.has(CARRY_FORWARD_INSTALLMENT_NO_BASE)) {
    return CARRY_FORWARD_INSTALLMENT_NO_BASE;
  }
  for (let candidate = CARRY_FORWARD_INSTALLMENT_NO_MIN; candidate < CARRY_FORWARD_INSTALLMENT_NO_BASE; candidate += 1) {
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  // Extremely unlikely (90–99 all taken); step above 99 as a last resort.
  let candidate = CARRY_FORWARD_INSTALLMENT_NO_BASE + 1;
  while (taken.has(candidate)) {
    candidate += 1;
  }
  return candidate;
}

/**
 * Build the exact installment row for a confirmed carry-forward. Enforces the
 * hard rules: zero late fee, zero transport/discount, the canonical label, the
 * early due date, and `is_carry_forward = true`. Never sets `amount_due`
 * (generated column) — only `base_amount`.
 */
export function buildCarryForwardInstallment(
  input: CarryForwardInstallmentInput,
): CarryForwardInstallmentPayload {
  const amount = Math.trunc(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Carry-forward amount must be a positive integer (got ${input.amount}).`);
  }

  return {
    student_id: input.studentId,
    class_id: input.classId,
    fee_setting_id: input.feeSettingId,
    installment_no: selectCarryForwardInstallmentNo(input.existingInstallmentNos),
    installment_label: CARRY_FORWARD_LABEL,
    due_date: input.dueDate ?? CARRY_FORWARD_DUE_DATE,
    base_amount: amount,
    transport_amount: 0,
    discount_amount: 0,
    late_fee_flat_amount: CARRY_FORWARD_LATE_FEE_FLAT_AMOUNT,
    status: "scheduled",
    is_carry_forward: true,
  };
}

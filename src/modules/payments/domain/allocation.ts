import type {
  InstallmentBalanceItem,
  PaymentAllocationItem,
} from "@/modules/payments/domain/types";

function sortForAllocation(items: InstallmentBalanceItem[]) {
  return [...items].sort((left, right) => {
    if (left.dueDate === right.dueDate) {
      return left.installmentNo - right.installmentNo;
    }

    return left.dueDate.localeCompare(right.dueDate);
  });
}

export function buildPaymentAllocation(
  installments: InstallmentBalanceItem[],
  paymentAmount: number,
): PaymentAllocationItem[] {
  let remaining = Math.max(0, Math.trunc(paymentAmount));

  if (remaining === 0) {
    return [];
  }

  const ordered = sortForAllocation(installments).filter(
    (item) => item.outstandingAmount > 0,
  );

  const allocations: PaymentAllocationItem[] = [];

  for (const installment of ordered) {
    if (remaining <= 0) {
      break;
    }

    const allocatedAmount = Math.min(remaining, installment.outstandingAmount);

    allocations.push({
      installmentId: installment.installmentId,
      installmentNo: installment.installmentNo,
      installmentLabel: installment.installmentLabel,
      displayLabel: installment.displayLabel,
      isCarryForward: installment.isCarryForward,
      sourceSessionLabel: installment.sourceSessionLabel,
      dueDate: installment.dueDate,
      outstandingBefore: installment.outstandingAmount,
      allocatedAmount,
      outstandingAfter: installment.outstandingAmount - allocatedAmount,
    });

    remaining -= allocatedAmount;
  }

  return allocations;
}

export type ReceiptPreviewAllocationItem = {
  installmentId: string;
  installmentLabel: string;
  displayLabel?: string;
  dueDate: string;
  pendingBefore: number;
  discountApplied: number;
  lateFeeWaived: number;
  amountReceived: number;
  remaining: number;
};

export function buildReceiptPreviewAllocation(payload: {
  installments: InstallmentBalanceItem[];
  paymentAmount: number;
  quickDiscountAmount: number;
  quickLateFeeWaiverAmount: number;
}): ReceiptPreviewAllocationItem[] {
  let remainingDiscount = Math.max(0, Math.trunc(payload.quickDiscountAmount));
  let remainingLateFeeWaiver = Math.max(0, Math.trunc(payload.quickLateFeeWaiverAmount));
  let remainingPayment = Math.max(0, Math.trunc(payload.paymentAmount));

  return sortForAllocation(payload.installments)
    .filter((item) => item.outstandingAmount > 0)
    .map((item) => {
      const pendingBefore = item.outstandingAmount;
      // Read off the row rather than re-derived as min(finalLateFee, pending).
      // That expression only worked while pending_amount carried both kinds of
      // money; since the split it reads 0 for anyone whose fees are clear --
      // which is exactly who still has a waivable late fee.
      const lateFeeWaived = Math.min(remainingLateFeeWaiver, item.lateFeePending);
      remainingLateFeeWaiver -= lateFeeWaived;

      const pendingAfterWaiver = pendingBefore - lateFeeWaived;
      const discountApplied = Math.min(remainingDiscount, pendingAfterWaiver);
      remainingDiscount -= discountApplied;

      const pendingAfterAdjustments = pendingAfterWaiver - discountApplied;
      const amountReceived = Math.min(remainingPayment, pendingAfterAdjustments);
      remainingPayment -= amountReceived;

      return {
        installmentId: item.installmentId,
        installmentLabel: item.installmentLabel,
        displayLabel: item.displayLabel,
        dueDate: item.dueDate,
        pendingBefore,
        discountApplied,
        lateFeeWaived,
        amountReceived,
        remaining: Math.max(pendingAfterAdjustments - amountReceived, 0),
      };
    });
}

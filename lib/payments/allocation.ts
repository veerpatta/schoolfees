import type {
  InstallmentBalanceItem,
  PaymentAllocationItem,
} from "@/lib/payments/types";

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
      dueDate: installment.dueDate,
      outstandingBefore: installment.outstandingAmount,
      allocatedAmount,
      outstandingAfter: installment.outstandingAmount - allocatedAmount,
    });

    remaining -= allocatedAmount;
  }

  return allocations;
}

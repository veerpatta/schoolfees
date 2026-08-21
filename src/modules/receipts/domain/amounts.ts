export type ReceiptDisplayAdjustment = {
  receiptId: string;
  adjustmentType: string;
  amountDelta: number | null | undefined;
};

type BuildReceiptAdjustmentTotalsInput = {
  currentReceiptId: string;
  receiptIdsUpToCurrent: string[];
  financialLateFeeTotal: number | null | undefined;
  adjustments: ReceiptDisplayAdjustment[];
};

function positiveAmount(value: number | null | undefined) {
  return Math.max(Math.trunc(value ?? 0), 0);
}

function sumAdjustments(adjustments: ReceiptDisplayAdjustment[], type?: string) {
  return adjustments
    .filter((row) => (type ? row.adjustmentType === type : true))
    .reduce((sum, row) => sum + positiveAmount(row.amountDelta), 0);
}

export function buildReceiptAdjustmentTotals(input: BuildReceiptAdjustmentTotalsInput) {
  const currentReceiptAdjustments = input.adjustments.filter(
    (row) => row.receiptId === input.currentReceiptId,
  );
  const receiptIdsUpToCurrent = new Set(input.receiptIdsUpToCurrent);
  const adjustmentsUpToCurrent = input.adjustments.filter((row) =>
    receiptIdsUpToCurrent.has(row.receiptId),
  );
  const receiptDiscountAmount = sumAdjustments(currentReceiptAdjustments, "discount");
  const receiptLateFeeWaived = sumAdjustments(currentReceiptAdjustments, "writeoff");
  const financialLateFeeTotal = positiveAmount(input.financialLateFeeTotal);

  return {
    receiptDiscountAmount,
    receiptLateFeeWaived,
    receiptLateFeeAmount: Math.max(financialLateFeeTotal, receiptLateFeeWaived),
    adjustmentsUpToCurrent: sumAdjustments(adjustmentsUpToCurrent),
  };
}

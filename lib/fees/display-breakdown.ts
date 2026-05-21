import type { FeeHeadAmount, ResolvedFeeBreakdown } from "@/lib/fees/types";

export type FeeBreakupDisplayRow = FeeHeadAmount & {
  kind: "charge" | "discount";
};

function conventionalDiscountLabel(labels: string[]) {
  const suffix = labels.length > 0 ? ` (${labels.join(", ")})` : "";
  return `Conventional Discount${suffix}`;
}

export function buildFeeBreakupDisplayRows(
  breakdown: Pick<
    ResolvedFeeBreakdown,
    | "coreHeads"
    | "customHeads"
    | "tuitionBeforeConventionalDiscount"
    | "conventionalDiscountApplied"
    | "conventionalDiscountLabels"
    | "discountApplied"
  >,
): FeeBreakupDisplayRow[] {
  const hasConventionalDiscount = breakdown.conventionalDiscountApplied > 0;
  const rows: FeeBreakupDisplayRow[] = [];
  let insertedConventionalDiscount = false;

  for (const item of [...breakdown.coreHeads, ...breakdown.customHeads]) {
    const isTuitionRow = item.id === "tuition_fee";
    rows.push({
      ...item,
      amount:
        hasConventionalDiscount && isTuitionRow
          ? breakdown.tuitionBeforeConventionalDiscount
          : item.amount,
      kind: "charge",
    });

    if (hasConventionalDiscount && isTuitionRow) {
      rows.push({
        id: "conventional_discount",
        label: conventionalDiscountLabel(breakdown.conventionalDiscountLabels),
        amount: -breakdown.conventionalDiscountApplied,
        kind: "discount",
      });
      insertedConventionalDiscount = true;
    }
  }

  if (hasConventionalDiscount && !insertedConventionalDiscount) {
    rows.push({
      id: "conventional_discount",
      label: conventionalDiscountLabel(breakdown.conventionalDiscountLabels),
      amount: -breakdown.conventionalDiscountApplied,
      kind: "discount",
    });
  }

  if (breakdown.discountApplied > 0) {
    rows.push({
      id: "student_discount",
      label: "Discount",
      amount: -breakdown.discountApplied,
      kind: "discount",
    });
  }

  return rows;
}

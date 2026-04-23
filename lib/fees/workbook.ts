import type { FeePolicySummary } from "@/lib/fees/types";

export const WORKBOOK_CLASS_ORDER = [
  "Nursery",
  "JKG",
  "SKG",
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "Class 7",
  "Class 8",
  "Class 9",
  "Class 10",
  "11 Arts",
  "11 Commerce",
  "11 Science",
  "12 Arts",
  "12 Commerce",
  "12 Science",
] as const;

const WORKBOOK_CLASS_ALIASES: Record<string, string> = {
  nursery: "Nursery",
  kg1: "JKG",
  jkg: "JKG",
  lkg: "JKG",
  kg2: "SKG",
  skg: "SKG",
  ukg: "SKG",
  class1: "Class 1",
  "1": "Class 1",
  "1st": "Class 1",
  first: "Class 1",
  class2: "Class 2",
  "2": "Class 2",
  "2nd": "Class 2",
  second: "Class 2",
  class3: "Class 3",
  "3": "Class 3",
  "3rd": "Class 3",
  third: "Class 3",
  class4: "Class 4",
  "4": "Class 4",
  "4th": "Class 4",
  fourth: "Class 4",
  class5: "Class 5",
  "5": "Class 5",
  "5th": "Class 5",
  fifth: "Class 5",
  class6: "Class 6",
  "6": "Class 6",
  "6th": "Class 6",
  sixth: "Class 6",
  class7: "Class 7",
  "7": "Class 7",
  "7th": "Class 7",
  seventh: "Class 7",
  class8: "Class 8",
  "8": "Class 8",
  "8th": "Class 8",
  eighth: "Class 8",
  class9: "Class 9",
  "9": "Class 9",
  "9th": "Class 9",
  ninth: "Class 9",
  class10: "Class 10",
  "10": "Class 10",
  "10th": "Class 10",
  tenth: "Class 10",
  "11arts": "11 Arts",
  "11tharts": "11 Arts",
  "class11arts": "11 Arts",
  "xiarts": "11 Arts",
  "11commerce": "11 Commerce",
  "11thcommerce": "11 Commerce",
  "class11commerce": "11 Commerce",
  "xicommerce": "11 Commerce",
  "11science": "11 Science",
  "11thscience": "11 Science",
  "class11science": "11 Science",
  "xiscience": "11 Science",
  "12arts": "12 Arts",
  "12tharts": "12 Arts",
  "class12arts": "12 Arts",
  "xiiarts": "12 Arts",
  "12commerce": "12 Commerce",
  "12thcommerce": "12 Commerce",
  "class12commerce": "12 Commerce",
  "xiicommerce": "12 Commerce",
  "12science": "12 Science",
  "12thscience": "12 Science",
  "class12science": "12 Science",
  "xiiscience": "12 Science",
};

function normalizeWorkbookLookupToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function normalizeWorkbookClassLabel(value: string) {
  const normalized = normalizeWorkbookLookupToken(value);

  if (!normalized) {
    return null;
  }

  return WORKBOOK_CLASS_ALIASES[normalized] ?? null;
}

export function isWorkbookPolicy(policy: Pick<FeePolicySummary, "calculationModel">) {
  return policy.calculationModel === "workbook_v1";
}

export function isWorkbookSession(
  policy: Pick<FeePolicySummary, "academicSessionLabel" | "calculationModel">,
  sessionLabel: string | null | undefined,
) {
  return isWorkbookPolicy(policy) && (sessionLabel ?? "").trim() === policy.academicSessionLabel;
}

export function getWorkbookStudentStatusLabel(studentType: "new" | "existing") {
  return studentType === "new" ? "New" : "Old";
}

export function getWorkbookStudentStatusCode(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();

  if (normalized === "new") {
    return "new" as const;
  }

  if (normalized === "old" || normalized === "existing") {
    return "existing" as const;
  }

  return null;
}

export function splitAmountWithRemainderLast(totalAmount: number, count: number) {
  const normalizedTotal = Math.max(0, Math.trunc(totalAmount));
  const normalizedCount = Math.max(1, Math.trunc(count));
  const baseAmount = Math.floor(normalizedTotal / normalizedCount);

  return Array.from({ length: normalizedCount }, (_, index) =>
    index === normalizedCount - 1
      ? normalizedTotal - baseAmount * (normalizedCount - 1)
      : baseAmount,
  );
}

export function buildWorkbookInstallmentCharges(payload: {
  installmentCount: number;
  tuitionFee: number;
  transportFee: number;
  academicFee: number;
  otherAdjustmentAmount: number;
  discountAmount: number;
}) {
  const installmentCount = Math.max(1, Math.trunc(payload.installmentCount));
  const tuitionFee = Math.max(0, Math.trunc(payload.tuitionFee));
  const transportFee = Math.max(0, Math.trunc(payload.transportFee));
  const academicFee = Math.max(0, Math.trunc(payload.academicFee));
  const otherAdjustmentAmount = Math.trunc(payload.otherAdjustmentAmount);
  const discountAmount = Math.max(0, Math.trunc(payload.discountAmount));
  const grossBaseBeforeDiscount = Math.max(
    0,
    tuitionFee + transportFee + academicFee + otherAdjustmentAmount,
  );
  const discountApplied = Math.min(discountAmount, grossBaseBeforeDiscount);
  const baseTotalDue = Math.max(0, grossBaseBeforeDiscount - discountApplied);
  const academicCharge = Math.min(academicFee, baseTotalDue);
  const remainderBase = Math.max(0, baseTotalDue - academicCharge);
  const sharedCharges = splitAmountWithRemainderLast(remainderBase, installmentCount);

  const installmentCharges = sharedCharges.map((amount, index) =>
    index === 0 ? amount + academicCharge : amount,
  );

  return {
    grossBaseBeforeDiscount,
    discountApplied,
    baseTotalDue,
    academicCharge,
    installmentCharges,
  };
}

export function distributeLateFeeWaiver(payload: {
  rawLateFees: number[];
  waiverAmount: number;
}) {
  const waiverAmount = Math.max(0, Math.trunc(payload.waiverAmount));
  let remainingWaiver = waiverAmount;

  return payload.rawLateFees.map((rawValue) => {
    const rawLateFee = Math.max(0, Math.trunc(rawValue));
    const appliedWaiver = Math.min(rawLateFee, remainingWaiver);
    remainingWaiver -= appliedWaiver;

    return {
      rawLateFee,
      appliedWaiver,
      finalLateFee: rawLateFee - appliedWaiver,
    };
  });
}

export function buildWorkbookStatus(payload: {
  totalDueIncludingLate: number;
  totalPaid: number;
  outstandingAmount: number;
  nextDueDate: string | null;
  today?: string;
}) {
  if (payload.totalDueIncludingLate <= 0) {
    return "";
  }

  if (payload.outstandingAmount <= 0) {
    return "PAID";
  }

  if (payload.totalPaid <= 0) {
    return "NOT STARTED";
  }

  const today =
    payload.today ??
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

  if (payload.nextDueDate && today > payload.nextDueDate) {
    return "OVERDUE";
  }

  return "PARTLY PAID";
}

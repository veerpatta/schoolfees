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

export const WORKBOOK_CLASS_TUITION_DEFAULTS = [
  { label: "Nursery", sortOrder: 1, annualTuition: 16000 },
  { label: "JKG", sortOrder: 2, annualTuition: 17000 },
  { label: "SKG", sortOrder: 3, annualTuition: 17000 },
  { label: "Class 1", sortOrder: 4, annualTuition: 18000 },
  { label: "Class 2", sortOrder: 5, annualTuition: 18500 },
  { label: "Class 3", sortOrder: 6, annualTuition: 19000 },
  { label: "Class 4", sortOrder: 7, annualTuition: 19500 },
  { label: "Class 5", sortOrder: 8, annualTuition: 20000 },
  { label: "Class 6", sortOrder: 9, annualTuition: 21000 },
  { label: "Class 7", sortOrder: 10, annualTuition: 22000 },
  { label: "Class 8", sortOrder: 11, annualTuition: 23000 },
  { label: "Class 9", sortOrder: 12, annualTuition: 24000 },
  { label: "Class 10", sortOrder: 13, annualTuition: 25000 },
  { label: "11 Arts", sortOrder: 14, annualTuition: 30000 },
  { label: "11 Commerce", sortOrder: 15, annualTuition: 30000 },
  { label: "11 Science", sortOrder: 16, annualTuition: 35000 },
  { label: "12 Arts", sortOrder: 17, annualTuition: 32000 },
  { label: "12 Commerce", sortOrder: 18, annualTuition: 32000 },
  { label: "12 Science", sortOrder: 19, annualTuition: 38000 },
] as const;

export const WORKBOOK_ROUTE_FEE_DEFAULTS = [
  { routeName: "No Transport", annualFee: 0 },
  { routeName: "Amet Bus", annualFee: 5500 },
  { routeName: "Amet College Side (On Road)", annualFee: 6000 },
  { routeName: "Amet College Road (Colony Inside)", annualFee: 6000 },
  { routeName: "Amet Railway Station (On Road)", annualFee: 7000 },
  { routeName: "Amet Railway Station (Inside)", annualFee: 7000 },
  { routeName: "Amet City", annualFee: 7000 },
  { routeName: "Bhopji Ka Kheda", annualFee: 11000 },
  { routeName: "Ballo Ka Khera", annualFee: 12000 },
  { routeName: "Makarda", annualFee: 14000 },
  { routeName: "Masingpura", annualFee: 14000 },
  { routeName: "Jilola", annualFee: 17000 },
  { routeName: "Mund Koshiya", annualFee: 12000 },
  { routeName: "Dhelana", annualFee: 11000 },
  { routeName: "Selaguda", annualFee: 9000 },
  { routeName: "Kanji Ka Kedha", annualFee: 4000 },
  { routeName: "Aambaghati", annualFee: 6000 },
  { routeName: "Banda", annualFee: 9500 },
  { routeName: "Aidana", annualFee: 11500 },
  { routeName: "Karera", annualFee: 13000 },
  { routeName: "Saprav", annualFee: 10500 },
  { routeName: "Dabla", annualFee: 14500 },
  { routeName: "Tanvan", annualFee: 6000 },
  { routeName: "Sardargarh", annualFee: 14000 },
  { routeName: "Agariya Kotari", annualFee: 9000 },
  { routeName: "Gugli", annualFee: 11500 },
  { routeName: "Ghosundi", annualFee: 10000 },
  { routeName: "Agariya", annualFee: 10000 },
  { routeName: "Bhakroda", annualFee: 14000 },
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

export function normalizeWorkbookRouteName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
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

export type WorkbookPaymentInput = {
  paymentDate: string;
  amount: number;
};

export type WorkbookStudentMasterCalculationInput = {
  classLabel: string;
  studentName: string;
  admissionNo?: string | null;
  dateOfBirth?: string | null;
  installmentDueDates: string[];
  lateFeeFlatAmount: number;
  tuitionFee: number;
  transportFee: number;
  academicFee: number;
  otherAdjustmentAmount?: number;
  discountAmount?: number;
  lateFeeWaiverAmount?: number;
  payments?: WorkbookPaymentInput[];
  today?: string;
};

export type WorkbookStudentMasterCalculation = ReturnType<
  typeof buildWorkbookStudentMasterCalculation
>;

function toWorkbookDateKey(value: string | null | undefined) {
  const normalized = (value ?? "").trim();

  if (!normalized) {
    return "";
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}${isoMatch[2]}${isoMatch[1]}`;
  }

  const slashMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[1].padStart(2, "0")}${slashMatch[2].padStart(2, "0")}${slashMatch[3]}`;
  }

  return normalized.replace(/[^0-9]/g, "");
}

export function buildWorkbookStudentKey(payload: {
  classLabel: string;
  studentName: string;
  admissionNo?: string | null;
  dateOfBirth?: string | null;
}) {
  const classLabel = payload.classLabel.trim();
  const studentName = payload.studentName.trim();
  const admissionNo = (payload.admissionNo ?? "").trim();
  const dobKey = toWorkbookDateKey(payload.dateOfBirth);

  if (admissionNo) {
    return `${classLabel}|${admissionNo}`;
  }

  if (dobKey) {
    return `${classLabel}|${studentName}|${dobKey}`;
  }

  return `${classLabel}|${studentName}`;
}

function normalizeWorkbookPayments(payments: WorkbookPaymentInput[] | undefined) {
  return (payments ?? [])
    .map((payment, index) => ({
      index,
      paymentDate: payment.paymentDate,
      amount: Math.max(0, Math.trunc(payment.amount)),
    }))
    .filter((payment) => payment.amount > 0 && payment.paymentDate.trim().length > 0)
    .sort((left, right) => {
      if (left.paymentDate === right.paymentDate) {
        return left.index - right.index;
      }

      return left.paymentDate.localeCompare(right.paymentDate);
    });
}

export function buildWorkbookStudentMasterCalculation(
  payload: WorkbookStudentMasterCalculationInput,
) {
  const installmentDueDates = payload.installmentDueDates.slice(0, 4);
  const charges = buildWorkbookInstallmentCharges({
    installmentCount: installmentDueDates.length || 4,
    tuitionFee: payload.tuitionFee,
    transportFee: payload.transportFee,
    academicFee: payload.academicFee,
    otherAdjustmentAmount: payload.otherAdjustmentAmount ?? 0,
    discountAmount: payload.discountAmount ?? 0,
  });
  const payments = normalizeWorkbookPayments(payload.payments);
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const cumulativeBaseCharges = charges.installmentCharges.map((_, index) =>
    charges.installmentCharges
      .slice(0, index + 1)
      .reduce((sum, amount) => sum + amount, 0),
  );
  const rawLateFees = charges.installmentCharges.map((_, index) => {
    const dueDate = installmentDueDates[index] ?? "";
    const paidByDueDate = payments
      .filter((payment) => dueDate && payment.paymentDate <= dueDate)
      .reduce((sum, payment) => sum + payment.amount, 0);
    const hasLatePayment = payments.some((payment) => dueDate && payment.paymentDate > dueDate);
    const wasNotPaidByDue = paidByDueDate < cumulativeBaseCharges[index];
    const laterPaymentHappened = totalPaid > paidByDueDate && hasLatePayment;

    return wasNotPaidByDue && laterPaymentHappened
      ? Math.max(0, Math.trunc(payload.lateFeeFlatAmount))
      : 0;
  });
  const lateFeeRows = distributeLateFeeWaiver({
    rawLateFees,
    waiverAmount: payload.lateFeeWaiverAmount ?? 0,
  });
  const installmentCharges = charges.installmentCharges.map(
    (baseCharge, index) => baseCharge + lateFeeRows[index].finalLateFee,
  );
  let remainingPaid = totalPaid;
  const paidByInstallment = installmentCharges.map((installmentCharge) => {
    const paid = Math.min(remainingPaid, installmentCharge);
    remainingPaid -= paid;
    return paid;
  });
  const pendingByInstallment = installmentCharges.map((installmentCharge, index) =>
    Math.max(0, installmentCharge - paidByInstallment[index]),
  );
  const finalLateFeeTotal = lateFeeRows.reduce((sum, row) => sum + row.finalLateFee, 0);
  const totalDueIncludingLate = charges.baseTotalDue + finalLateFeeTotal;
  const outstanding = Math.max(0, totalDueIncludingLate - totalPaid);
  const nextDueIndex = pendingByInstallment.findIndex((amount) => amount > 0);
  const lastPayment = payments.at(-1) ?? null;

  return {
    workbookStudentKey: buildWorkbookStudentKey(payload),
    tuitionRate: Math.max(0, Math.trunc(payload.tuitionFee)),
    transportFee: Math.max(0, Math.trunc(payload.transportFee)),
    academicFee: Math.max(0, Math.trunc(payload.academicFee)),
    otherAdjustmentAmount: Math.trunc(payload.otherAdjustmentAmount ?? 0),
    grossBaseBeforeDiscount: charges.grossBaseBeforeDiscount,
    discountApplied: charges.discountApplied,
    baseTotalDue: charges.baseTotalDue,
    installmentBase: charges.installmentCharges,
    rawLateFees: lateFeeRows.map((row) => row.rawLateFee),
    lateFeeWaiverApplied: lateFeeRows.map((row) => row.appliedWaiver),
    finalLateFees: lateFeeRows.map((row) => row.finalLateFee),
    paidByInstallment,
    pendingByInstallment,
    totalPaid,
    lateFeeTotal: finalLateFeeTotal,
    totalDueIncludingLate,
    outstanding,
    nextDueNo: nextDueIndex === -1 ? 0 : nextDueIndex + 1,
    nextDueLabel: nextDueIndex === -1 ? "" : `Installment ${nextDueIndex + 1}`,
    nextDueDate: nextDueIndex === -1 ? null : (installmentDueDates[nextDueIndex] ?? null),
    nextDueAmount: nextDueIndex === -1 ? 0 : pendingByInstallment[nextDueIndex],
    status: buildWorkbookStatus({
      totalDueIncludingLate,
      totalPaid,
      outstandingAmount: outstanding,
      nextDueDate: nextDueIndex === -1 ? null : (installmentDueDates[nextDueIndex] ?? null),
      today: payload.today,
    }),
    lastPaymentDate: lastPayment?.paymentDate ?? null,
    lastPaymentAmount: lastPayment?.amount ?? 0,
  };
}

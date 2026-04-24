import type { PaymentMode } from "@/lib/db/types";
import type { FeeHeadDefinition } from "@/lib/fees/types";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const ACADEMIC_SESSION_PATTERN = /^(?:([a-z0-9]+)-)?(\d{4})-(\d{2})$/i;
const TEST_SESSION_PREFIXES = new Set(["TEST", "UAT", "DEMO"]);

function buildInvalidAcademicSessionError(academicSessionLabel: string) {
  return new Error(
    `Academic session "${academicSessionLabel}" is invalid. Use format like 2026-27 or TEST-2026-27.`,
  );
}

export function parseAcademicSessionLabel(academicSessionLabel: string) {
  const normalizedLabel = academicSessionLabel.trim();
  const match = normalizedLabel.match(ACADEMIC_SESSION_PATTERN);

  if (!match) {
    throw buildInvalidAcademicSessionError(academicSessionLabel);
  }

  const prefix = (match[1] ?? "").toUpperCase();
  const startYear = Number(match[2]);
  const endYearSuffix = match[3] ?? "";
  const expectedEndYearSuffix = (startYear + 1).toString().slice(-2);

  if (!Number.isInteger(startYear) || endYearSuffix !== expectedEndYearSuffix) {
    throw buildInvalidAcademicSessionError(academicSessionLabel);
  }

  return {
    normalizedLabel,
    prefix,
    startYear,
    endYearSuffix,
  };
}

export function getAcademicSessionStartYear(academicSessionLabel: string) {
  return parseAcademicSessionLabel(academicSessionLabel).startYear;
}

export function isTestAcademicSessionLabel(academicSessionLabel: string) {
  const { prefix } = parseAcademicSessionLabel(academicSessionLabel);
  return TEST_SESSION_PREFIXES.has(prefix);
}

export function getDefaultAcademicSessionLabel(referenceDate = new Date()) {
  const month = referenceDate.getUTCMonth();
  const year = referenceDate.getUTCFullYear();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = (startYear + 1).toString().slice(-2);

  return `${startYear}-${endYear}`;
}

export const DEFAULT_INSTALLMENT_SCHEDULE = [
  { label: "Installment 1", dueDateLabel: "20 April" },
  { label: "Installment 2", dueDateLabel: "20 July" },
  { label: "Installment 3", dueDateLabel: "20 October" },
  { label: "Installment 4", dueDateLabel: "20 January" },
] as const;

export const DEFAULT_CUSTOM_FEE_HEADS: FeeHeadDefinition[] = [];

export const DEFAULT_ACCEPTED_PAYMENT_MODES: PaymentMode[] = [
  "cash",
  "upi",
  "bank_transfer",
  "cheque",
];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
};

export function formatPaymentModeLabel(value: PaymentMode) {
  return PAYMENT_MODE_LABELS[value];
}

export const CORE_FEE_HEADS = [
  {
    id: "tuition_fee",
    label: "Tuition fee",
    amount: 0,
    applicationType: "annual_fixed",
    isRefundable: false,
    chargeFrequency: "recurring",
    isMandatory: true,
    includeInWorkbookCalculation: true,
    isActive: true,
    notes: null,
  },
  {
    id: "transport_fee",
    label: "Transport fee",
    amount: 0,
    applicationType: "annual_fixed",
    isRefundable: false,
    chargeFrequency: "recurring",
    isMandatory: false,
    includeInWorkbookCalculation: true,
    isActive: true,
    notes: null,
  },
  {
    id: "books_fee",
    label: "Books fee",
    amount: 0,
    applicationType: "annual_fixed",
    isRefundable: false,
    chargeFrequency: "one_time",
    isMandatory: false,
    includeInWorkbookCalculation: false,
    isActive: true,
    notes: null,
  },
  {
    id: "admission_activity_misc_fee",
    label: "Admission / activity / misc fee",
    amount: 0,
    applicationType: "annual_fixed",
    isRefundable: false,
    chargeFrequency: "one_time",
    isMandatory: true,
    includeInWorkbookCalculation: false,
    isActive: true,
    notes: null,
  },
] as const satisfies ReadonlyArray<FeeHeadDefinition>;

export function normalizeFeeHeadId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildInstallmentDueDate(
  academicSessionLabel: string,
  dueDateLabel: string,
) {
  const startYear = getAcademicSessionStartYear(academicSessionLabel);

  const absoluteMatch = dueDateLabel.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (absoluteMatch) {
    const [, dayRawAbsolute, monthRawAbsolute, yearRawAbsolute] = absoluteMatch;
    const dayAbsolute = Number(dayRawAbsolute);
    const monthAbsolute = Number(monthRawAbsolute);
    const yearAbsolute = Number(yearRawAbsolute);

    if (
      Number.isInteger(dayAbsolute) &&
      Number.isInteger(monthAbsolute) &&
      Number.isInteger(yearAbsolute) &&
      dayAbsolute > 0 &&
      monthAbsolute >= 1 &&
      monthAbsolute <= 12
    ) {
      return new Date(Date.UTC(yearAbsolute, monthAbsolute - 1, dayAbsolute))
        .toISOString()
        .slice(0, 10);
    }
  }

  const [dayRaw, ...monthParts] = dueDateLabel.trim().split(/\s+/);
  const day = Number(dayRaw);
  const monthName = monthParts.join(" ");
  const monthIndex = MONTH_NAMES.findIndex(
    (candidate) => candidate.toLowerCase() === monthName.toLowerCase(),
  );

  if (!Number.isInteger(day) || day <= 0 || monthIndex === -1) {
    throw new Error(
      `Due date "${dueDateLabel}" is invalid. Use format like "20 April" or "20-04-2026".`,
    );
  }

  const year = monthIndex < 3 ? startYear + 1 : startYear;
  const isoDate = new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);

  return isoDate;
}

export function buildDefaultInstallmentSchedule(referenceDate = new Date()) {
  const academicSessionLabel = getDefaultAcademicSessionLabel(referenceDate);

  return DEFAULT_INSTALLMENT_SCHEDULE.map((item) => ({
    ...item,
    dueDate: buildInstallmentDueDate(academicSessionLabel, item.dueDateLabel),
  }));
}

export function buildDefaultFeePolicySummary(referenceDate = new Date()) {
  const academicSessionLabel = getDefaultAcademicSessionLabel(referenceDate);
  const installmentSchedule = DEFAULT_INSTALLMENT_SCHEDULE.map((item) => ({
    ...item,
    dueDate: buildInstallmentDueDate(academicSessionLabel, item.dueDateLabel),
  }));

  return {
    academicSessionLabel,
    calculationModel: "standard" as const,
    installmentCount: installmentSchedule.length,
    installmentSchedule,
    lateFeeFlatAmount: 1000,
    lateFeeLabel: "Flat Rs 1000",
    newStudentAcademicFeeAmount: 1100,
    oldStudentAcademicFeeAmount: 500,
    acceptedPaymentModes: DEFAULT_ACCEPTED_PAYMENT_MODES.map((value) => ({
      value,
      label: formatPaymentModeLabel(value),
    })),
    receiptPrefix: "SVP",
    customFeeHeads: DEFAULT_CUSTOM_FEE_HEADS,
    notes: "Global school policy drives future fee setup, ledger recalculation, payment desk rules, and policy notes.",
  };
}

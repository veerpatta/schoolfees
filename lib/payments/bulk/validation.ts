import type { PaymentMode } from "@/lib/db/types";
import { formatIsoDateIst } from "@/lib/helpers/date";
import {
  normalizeLookupToken,
  parseNonNegativeWholeNumber,
  parseSpreadsheetDate,
  stringifyImportCell,
} from "@/lib/import/validation";

import type { ValidatedPaymentRow } from "@/lib/payments/bulk/types";

/**
 * Pure row-level validation for the bulk payment upload. No DB access — the
 * caller supplies the student lookup and allowed payment modes, so the whole
 * matrix is unit-testable.
 */

export type PaymentImportStudentLookup = {
  id: string;
  admissionNo: string;
  fullName: string;
  status: string;
  classSessionLabel: string | null;
};

export type PaymentRowValidationContext = {
  sessionLabel: string;
  /** Keyed by normalizeLookupToken(admission_no). */
  studentsByAdmissionNo: Map<string, PaymentImportStudentLookup[]>;
  allowedModes: ReadonlySet<PaymentMode>;
  /** Injectable for deterministic tests; defaults to today's school date in IST. */
  todayIso?: string;
};

const HEADER_ALIASES: Record<string, string> = {
  srno: "admissionNo",
  admissionno: "admissionNo",
  admissionnumber: "admissionNo",
  amount: "amount",
  amountreceived: "amount",
  paymentamount: "amount",
  paymentdate: "paymentDate",
  date: "paymentDate",
  paymentmode: "paymentMode",
  mode: "paymentMode",
  remarks: "remarks",
  notes: "remarks",
};

const MODE_ALIASES: Record<string, PaymentMode> = {
  cash: "cash",
  upi: "upi",
  bank: "bank_transfer",
  banktransfer: "bank_transfer",
  neft: "bank_transfer",
  rtgs: "bank_transfer",
  imps: "bank_transfer",
  cheque: "cheque",
  check: "cheque",
  chq: "cheque",
};

/** Maps raw spreadsheet headers to canonical field keys (null = unrecognized). */
export function mapPaymentImportHeaders(headers: readonly string[]) {
  const mapping = new Map<string, string>();
  const unrecognized: string[] = [];

  for (const header of headers) {
    const field = HEADER_ALIASES[normalizeLookupToken(header)];
    if (field && ![...mapping.values()].includes(field)) {
      mapping.set(header, field);
    } else {
      unrecognized.push(header);
    }
  }

  return { mapping, unrecognized };
}

export function resolvePaymentModeInput(raw: unknown): PaymentMode | null {
  const token = normalizeLookupToken(stringifyImportCell(raw));
  return token ? (MODE_ALIASES[token] ?? null) : null;
}

function fieldValue(
  raw: Record<string, unknown>,
  mapping: Map<string, string>,
  field: string,
) {
  for (const [header, mapped] of mapping) {
    if (mapped === field) {
      return raw[header];
    }
  }
  return null;
}

export function validatePaymentImportRow(
  raw: Record<string, unknown>,
  mapping: Map<string, string>,
  context: PaymentRowValidationContext,
): ValidatedPaymentRow {
  const messages: string[] = [];
  let status: ValidatedPaymentRow["status"] = "valid";
  const fail = (message: string) => {
    messages.push(message);
    status = "error";
  };

  const admissionNo = stringifyImportCell(fieldValue(raw, mapping, "admissionNo")) || null;
  let studentId: string | null = null;
  let studentName: string | null = null;

  if (!admissionNo) {
    fail("SR no is required.");
  } else {
    const matches = context.studentsByAdmissionNo.get(normalizeLookupToken(admissionNo)) ?? [];
    if (matches.length === 0) {
      fail(`No student found with SR no "${admissionNo}".`);
    } else if (matches.length > 1) {
      fail(`SR no "${admissionNo}" matches ${matches.length} students — resolve the duplicate first.`);
    } else {
      const student = matches[0];
      if (student.classSessionLabel && student.classSessionLabel !== context.sessionLabel) {
        fail(
          `Student "${student.fullName}" belongs to ${student.classSessionLabel}, not ${context.sessionLabel}.`,
        );
      } else if (student.status !== "active") {
        fail(`Student "${student.fullName}" is not active (status: ${student.status}).`);
      } else {
        studentId = student.id;
        studentName = student.fullName;
      }
    }
  }

  const amountResult = parseNonNegativeWholeNumber(fieldValue(raw, mapping, "amount"), "Amount");
  let amount: number | null = null;
  if (amountResult.error) {
    fail(amountResult.error);
  } else if (amountResult.value === null || amountResult.value <= 0) {
    fail("Amount must be a whole number greater than 0.");
  } else {
    amount = amountResult.value;
  }

  const dateResult = parseSpreadsheetDate(
    fieldValue(raw, mapping, "paymentDate"),
    "Payment date",
  );
  let paymentDate: string | null = null;
  if (dateResult.error) {
    fail(dateResult.error);
  } else if (!dateResult.value) {
    fail("Payment date is required.");
  } else if (dateResult.value > (context.todayIso ?? formatIsoDateIst(new Date())!)) {
    fail("Payment date cannot be in the future.");
  } else {
    paymentDate = dateResult.value;
  }

  const rawMode = fieldValue(raw, mapping, "paymentMode");
  const paymentMode = resolvePaymentModeInput(rawMode);
  if (!paymentMode) {
    fail(
      `Payment mode "${stringifyImportCell(rawMode)}" is not recognized. Use Cash, UPI, Bank transfer, or Cheque.`,
    );
  } else if (!context.allowedModes.has(paymentMode)) {
    fail(`Payment mode "${paymentMode}" is not allowed by the current fee policy.`);
  }

  const remarks = stringifyImportCell(fieldValue(raw, mapping, "remarks")) || null;

  return {
    admissionNo,
    studentId,
    studentName,
    paymentDate,
    paymentMode: paymentMode ?? null,
    amount,
    remarks,
    status,
    messages,
    intraFileDuplicate: false,
    existingReceiptDuplicate: false,
  };
}

/** A receipt already on the books, keyed for same-day/same-amount matching. */
export type ExistingReceiptKey = {
  studentId: string;
  paymentDate: string;
  amount: number;
  receiptNumber: string;
};

export function buildExistingReceiptKey(studentId: string, paymentDate: string, amount: number) {
  return `${studentId}|${paymentDate}|${amount}`;
}

/**
 * Flags rows that match a receipt ALREADY in the database for the same student,
 * date and amount. Previously nothing checked this at validation time, so the
 * only defence was postStudentPayment's same-day guard — which the intra-file
 * acknowledgment silently switched off. Surfacing it here gives the operator the
 * warning on the review screen, with its own acknowledgment.
 */
export function flagExistingReceiptDuplicates(
  rows: ValidatedPaymentRow[],
  existingReceipts: readonly ExistingReceiptKey[],
): ValidatedPaymentRow[] {
  if (existingReceipts.length === 0) return rows;

  const byKey = new Map<string, string[]>();
  for (const receipt of existingReceipts) {
    const key = buildExistingReceiptKey(receipt.studentId, receipt.paymentDate, receipt.amount);
    const list = byKey.get(key) ?? [];
    list.push(receipt.receiptNumber);
    byKey.set(key, list);
  }

  for (const row of rows) {
    if (row.status === "error") continue;
    if (!row.studentId || !row.paymentDate || row.amount === null) continue;

    const matches = byKey.get(buildExistingReceiptKey(row.studentId, row.paymentDate, row.amount));
    if (!matches?.length) continue;

    row.existingReceiptDuplicate = true;
    row.status = "warning";
    row.messages.push(
      `A receipt for this student, date and amount already exists (${matches.join(", ")}) — confirm this is a further payment, not a re-entry.`,
    );
  }

  return rows;
}

/**
 * Flags repeated (student, amount) pairs inside one file as warnings needing
 * explicit acknowledgment, and repeated students as informational warnings —
 * the most common accidental-duplicate shape in a hand-filled sheet.
 */
export function flagIntraFileDuplicates(rows: ValidatedPaymentRow[]): ValidatedPaymentRow[] {
  const byStudent = new Map<string, number[]>();
  rows.forEach((row, index) => {
    if (!row.studentId) return;
    const list = byStudent.get(row.studentId) ?? [];
    list.push(index);
    byStudent.set(row.studentId, list);
  });

  for (const indices of byStudent.values()) {
    if (indices.length < 2) continue;
    const amounts = new Map<number, number>();
    for (const index of indices) {
      const amount = rows[index].amount;
      if (amount !== null) {
        amounts.set(amount, (amounts.get(amount) ?? 0) + 1);
      }
    }
    for (const index of indices) {
      const row = rows[index];
      if (row.status === "error") continue;
      row.intraFileDuplicate = true;
      const sameAmountCount = row.amount !== null ? (amounts.get(row.amount) ?? 0) : 0;
      if (sameAmountCount > 1) {
        row.status = "warning";
        row.messages.push(
          `This file has ${sameAmountCount} rows for this student with the same amount — confirm each is a separate payment.`,
        );
      } else {
        row.messages.push("This student appears more than once in this file.");
        if (row.status === "valid") row.status = "warning";
      }
    }
  }

  return rows;
}

import { describe, expect, it } from "vitest";

import type { PaymentMode } from "@/lib/db/types";
import {
  flagIntraFileDuplicates,
  mapPaymentImportHeaders,
  resolvePaymentModeInput,
  validatePaymentImportRow,
  type PaymentImportStudentLookup,
} from "@/lib/payments/bulk/validation";
import type { ValidatedPaymentRow } from "@/lib/payments/bulk/types";

const ALLOWED_MODES = new Set<PaymentMode>(["cash", "upi", "bank_transfer", "cheque"]);

function student(overrides: Partial<PaymentImportStudentLookup> = {}): PaymentImportStudentLookup {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    admissionNo: "2486",
    fullName: "Test Student",
    status: "active",
    classSessionLabel: "2026-27",
    ...overrides,
  };
}

function context(students: PaymentImportStudentLookup[] = [student()]) {
  const map = new Map<string, PaymentImportStudentLookup[]>();
  for (const item of students) {
    const key = item.admissionNo.toLowerCase().replace(/[^a-z0-9]+/g, "");
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return { sessionLabel: "2026-27", studentsByAdmissionNo: map, allowedModes: ALLOWED_MODES };
}

const HEADERS = ["SR no", "Amount", "Payment date", "Payment mode", "Remarks"];
const { mapping } = mapPaymentImportHeaders(HEADERS);

function row(values: Record<string, unknown>) {
  return {
    "SR no": "2486",
    Amount: 6300,
    "Payment date": "2026-07-01",
    "Payment mode": "Cash",
    Remarks: null,
    ...values,
  };
}

describe("mapPaymentImportHeaders", () => {
  it("maps the template headers and common aliases", () => {
    const result = mapPaymentImportHeaders([
      "Admission No",
      "Payment Amount",
      "Date",
      "Mode",
      "Notes",
    ]);
    expect([...result.mapping.values()].sort()).toEqual([
      "admissionNo",
      "amount",
      "paymentDate",
      "paymentMode",
      "remarks",
    ]);
  });

  it("reports unrecognized headers", () => {
    const result = mapPaymentImportHeaders(["SR no", "Amount", "Mystery column"]);
    expect(result.unrecognized).toEqual(["Mystery column"]);
  });
});

describe("resolvePaymentModeInput", () => {
  it("accepts labels, raw values, and bank synonyms", () => {
    expect(resolvePaymentModeInput("Cash")).toBe("cash");
    expect(resolvePaymentModeInput("UPI")).toBe("upi");
    expect(resolvePaymentModeInput("Bank transfer")).toBe("bank_transfer");
    expect(resolvePaymentModeInput("bank_transfer")).toBe("bank_transfer");
    expect(resolvePaymentModeInput("NEFT")).toBe("bank_transfer");
    expect(resolvePaymentModeInput("Cheque")).toBe("cheque");
    expect(resolvePaymentModeInput("card")).toBeNull();
  });
});

describe("validatePaymentImportRow", () => {
  it("accepts a fully valid row", () => {
    const result = validatePaymentImportRow(row({}), mapping, context());
    expect(result.status).toBe("valid");
    expect(result.studentId).toBe("00000000-0000-4000-8000-000000000001");
    expect(result.amount).toBe(6300);
    expect(result.paymentDate).toBe("2026-07-01");
    expect(result.paymentMode).toBe("cash");
  });

  it("rejects an unknown SR no", () => {
    const result = validatePaymentImportRow(row({ "SR no": "9999" }), mapping, context());
    expect(result.status).toBe("error");
    expect(result.messages.join(" ")).toContain("No student found");
  });

  it("rejects a student from another session", () => {
    const result = validatePaymentImportRow(
      row({}),
      mapping,
      context([student({ classSessionLabel: "2025-26" })]),
    );
    expect(result.status).toBe("error");
    expect(result.messages.join(" ")).toContain("belongs to 2025-26");
  });

  it("rejects inactive students", () => {
    const result = validatePaymentImportRow(
      row({}),
      mapping,
      context([student({ status: "left" })]),
    );
    expect(result.status).toBe("error");
    expect(result.messages.join(" ")).toContain("not active");
  });

  it("rejects zero, negative, and non-numeric amounts", () => {
    for (const amount of [0, -100, "abc"]) {
      const result = validatePaymentImportRow(row({ Amount: amount }), mapping, context());
      expect(result.status).toBe("error");
    }
  });

  it("rejects a future payment date", () => {
    const result = validatePaymentImportRow(
      row({ "Payment date": "2099-01-01" }),
      mapping,
      context(),
    );
    expect(result.status).toBe("error");
    expect(result.messages.join(" ")).toContain("future");
  });

  it("rejects unknown payment modes", () => {
    const result = validatePaymentImportRow(row({ "Payment mode": "Card" }), mapping, context());
    expect(result.status).toBe("error");
    expect(result.messages.join(" ")).toContain("not recognized");
  });

  it("collects multiple problems on one row", () => {
    const result = validatePaymentImportRow(
      row({ "SR no": "", Amount: 0, "Payment mode": "??" }),
      mapping,
      context(),
    );
    expect(result.status).toBe("error");
    expect(result.messages.length).toBeGreaterThanOrEqual(3);
  });
});

describe("flagIntraFileDuplicates", () => {
  function validated(overrides: Partial<ValidatedPaymentRow>): ValidatedPaymentRow {
    return {
      admissionNo: "2486",
      studentId: "student-1",
      studentName: "Test Student",
      paymentDate: "2026-07-01",
      paymentMode: "cash",
      amount: 6300,
      remarks: null,
      status: "valid",
      messages: [],
      ...overrides,
    };
  }

  it("marks same-student same-amount pairs as warnings needing confirmation", () => {
    const rows = flagIntraFileDuplicates([validated({}), validated({})]);
    expect(rows[0].status).toBe("warning");
    expect(rows[1].status).toBe("warning");
    expect(rows[0].messages.join(" ")).toContain("same amount");
  });

  it("same student with different amounts gets a softer repeat warning", () => {
    const rows = flagIntraFileDuplicates([validated({}), validated({ amount: 1000 })]);
    expect(rows[0].status).toBe("warning");
    expect(rows[0].messages.join(" ")).toContain("more than once");
  });

  it("leaves distinct students untouched", () => {
    const rows = flagIntraFileDuplicates([
      validated({}),
      validated({ studentId: "student-2", admissionNo: "2487" }),
    ]);
    expect(rows.every((item) => item.status === "valid")).toBe(true);
  });
});

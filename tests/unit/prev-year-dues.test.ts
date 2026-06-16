import { describe, expect, it } from "vitest";

import {
  buildCarryForwardInstallment,
  selectCarryForwardInstallmentNo,
} from "@/lib/prev-year-dues/carry-forward";
import {
  CARRY_FORWARD_DUE_DATE,
  CARRY_FORWARD_INSTALLMENT_NO_BASE,
  CARRY_FORWARD_LABEL,
} from "@/lib/prev-year-dues/constants";
import { planDuesRows, summarizeDryRun } from "@/lib/prev-year-dues/matching";
import {
  interpretConfirm,
  parseDuesRows,
  parseRupees,
} from "@/lib/prev-year-dues/parser";
import type { MatchableStudent } from "@/lib/prev-year-dues/types";

const HEADERS = {
  reviewGroup: "Review Group",
  oldAdm: "Old Adm# (export)",
  oldName: "Name (last year export)",
  due: "Prev-Year Due (Rs)",
  suggested: "Suggested App Adm#",
  appName: "App Student Name",
  appFather: "App Father Name",
  appPhone: "App Phone",
  appClass: "App Class",
  matchType: "Match Type",
  confirm: "CONFIRM? (Y/N)",
  corrected: "If wrong: correct App Adm#",
  notes: "Your Notes",
} as const;

function row(overrides: Record<string, string | number | null>) {
  return {
    [HEADERS.reviewGroup]: null,
    [HEADERS.oldAdm]: null,
    [HEADERS.oldName]: null,
    [HEADERS.due]: null,
    [HEADERS.suggested]: null,
    [HEADERS.appName]: null,
    [HEADERS.appFather]: null,
    [HEADERS.appPhone]: null,
    [HEADERS.appClass]: null,
    [HEADERS.matchType]: null,
    [HEADERS.confirm]: null,
    [HEADERS.corrected]: null,
    [HEADERS.notes]: null,
    ...overrides,
  };
}

const student = (overrides: Partial<MatchableStudent>): MatchableStudent => ({
  studentId: "s-1",
  admissionNo: "A100",
  fullName: "Aarav Sharma",
  fatherName: "Rakesh Sharma",
  phone: "9876543210",
  classLabel: "Class 5",
  classId: "c-1",
  feeSettingId: "f-1",
  ...overrides,
});

describe("parseRupees", () => {
  it("parses numeric, comma, and currency formats", () => {
    expect(parseRupees(11500)).toBe(11500);
    expect(parseRupees("11,500")).toBe(11500);
    expect(parseRupees("₹ 11,500")).toBe(11500);
    expect(parseRupees("")).toBeNull();
    expect(parseRupees(null)).toBeNull();
    expect(parseRupees("abc")).toBeNull();
  });
});

describe("interpretConfirm", () => {
  it("maps Y / WRITE-OFF / N / blank correctly", () => {
    expect(interpretConfirm("Y")).toBe("confirm");
    expect(interpretConfirm("yes")).toBe("confirm");
    expect(interpretConfirm("WRITE-OFF")).toBe("write_off");
    expect(interpretConfirm("write off")).toBe("write_off");
    expect(interpretConfirm("N")).toBe("reject");
    expect(interpretConfirm("")).toBe("pending");
    expect(interpretConfirm(null)).toBe("pending");
    expect(interpretConfirm("maybe")).toBe("pending");
  });
});

describe("parseDuesRows", () => {
  it("tolerates header whitespace and resolves columns", () => {
    const parsed = parseDuesRows([
      { "  CONFIRM? (Y/N) ": "Y", "Prev-Year Due (Rs)": "1,000", "Suggested App Adm#": "A100" },
    ]);
    expect(parsed[0].ownerDecision).toBe("confirm");
    expect(parsed[0].prevYearDue).toBe(1000);
    expect(parsed[0].targetAdmissionNo).toBe("A100");
  });

  it("uses the corrected admission number over the suggested one", () => {
    const parsed = parseDuesRows([
      row({ [HEADERS.confirm]: "Y", [HEADERS.due]: 500, [HEADERS.suggested]: "A100", [HEADERS.corrected]: "A200" }),
    ]);
    expect(parsed[0].targetAdmissionNo).toBe("A200");
  });

  it("flags confirmed rows with missing or non-positive amounts as parse errors", () => {
    const parsed = parseDuesRows([
      row({ [HEADERS.confirm]: "Y", [HEADERS.suggested]: "A100" }),
      row({ [HEADERS.confirm]: "Y", [HEADERS.due]: 0, [HEADERS.suggested]: "A100" }),
    ]);
    expect(parsed[0].parseError).toMatch(/no readable/i);
    expect(parsed[1].parseError).toMatch(/non-positive/i);
  });
});

describe("planDuesRows", () => {
  it("imports only confirmed rows; skips write-off / N / blank with reasons", () => {
    const rows = parseDuesRows([
      row({ [HEADERS.confirm]: "Y", [HEADERS.due]: 1000, [HEADERS.suggested]: "A100" }),
      row({ [HEADERS.confirm]: "WRITE-OFF", [HEADERS.due]: 2000, [HEADERS.suggested]: "A100" }),
      row({ [HEADERS.confirm]: "N", [HEADERS.due]: 3000, [HEADERS.suggested]: "A100" }),
      row({ [HEADERS.confirm]: "", [HEADERS.due]: 4000, [HEADERS.suggested]: "A100" }),
    ]);
    const planned = planDuesRows(rows, [student({})]);
    expect(planned[0].status).toBe("matched");
    expect(planned[1].status).toBe("skipped");
    expect(planned[1].skipReason).toMatch(/write-off/i);
    expect(planned[2].status).toBe("skipped");
    expect(planned[3].status).toBe("skipped");
  });

  it("matches by admission number first", () => {
    const rows = parseDuesRows([row({ [HEADERS.confirm]: "Y", [HEADERS.due]: 1000, [HEADERS.suggested]: "a100" })]);
    const planned = planDuesRows(rows, [student({})]);
    expect(planned[0].matchMethod).toBe("admission_no");
    expect(planned[0].matchedStudentId).toBe("s-1");
    expect(planned[0].applyAmount).toBe(1000);
  });

  it("falls back to name + phone when admission is blank", () => {
    const rows = parseDuesRows([
      row({
        [HEADERS.confirm]: "Y",
        [HEADERS.due]: 1000,
        [HEADERS.appName]: "Aarav Sharma",
        [HEADERS.appPhone]: "+91 98765 43210",
      }),
    ]);
    const planned = planDuesRows(rows, [student({ admissionNo: null })]);
    expect(planned[0].matchMethod).toBe("name_phone");
    expect(planned[0].matchedStudentId).toBe("s-1");
  });

  it("flags ambiguous when multiple students share the admission number", () => {
    const rows = parseDuesRows([row({ [HEADERS.confirm]: "Y", [HEADERS.due]: 1000, [HEADERS.suggested]: "A100" })]);
    const planned = planDuesRows(rows, [student({ studentId: "s-1" }), student({ studentId: "s-2" })]);
    expect(planned[0].status).toBe("ambiguous");
  });

  it("reports unmatched when no student is found", () => {
    const rows = parseDuesRows([row({ [HEADERS.confirm]: "Y", [HEADERS.due]: 1000, [HEADERS.suggested]: "ZZZ" })]);
    const planned = planDuesRows(rows, [student({})]);
    expect(planned[0].status).toBe("unmatched");
  });

  it("flags matched-but-no-fee-setting separately (insert would fail)", () => {
    const rows = parseDuesRows([row({ [HEADERS.confirm]: "Y", [HEADERS.due]: 1000, [HEADERS.suggested]: "A100" })]);
    const planned = planDuesRows(rows, [student({ feeSettingId: null })]);
    expect(planned[0].status).toBe("no_fee_setting");
  });

  it("is idempotent: an existing carry-forward marks the row already-applied", () => {
    const rows = parseDuesRows([row({ [HEADERS.confirm]: "Y", [HEADERS.due]: 1000, [HEADERS.suggested]: "A100" })]);
    const planned = planDuesRows(rows, [student({ hasExistingCarryForward: true })]);
    expect(planned[0].status).toBe("matched");
    expect(planned[0].alreadyApplied).toBe(true);
  });

  it("prevents two confirmed rows from double-applying to one student", () => {
    const rows = parseDuesRows([
      row({ [HEADERS.confirm]: "Y", [HEADERS.due]: 1000, [HEADERS.suggested]: "A100" }),
      row({ [HEADERS.confirm]: "Y", [HEADERS.due]: 2000, [HEADERS.suggested]: "A100" }),
    ]);
    const planned = planDuesRows(rows, [student({})]);
    expect(planned[0].status).toBe("matched");
    expect(planned[1].status).toBe("error");
    expect(planned[1].skipReason).toMatch(/duplicate/i);
  });

  it("summarizes the dry-run figures", () => {
    const rows = parseDuesRows([
      row({ [HEADERS.confirm]: "Y", [HEADERS.due]: 1000, [HEADERS.suggested]: "A100" }),
      row({ [HEADERS.confirm]: "WRITE-OFF", [HEADERS.due]: 2000, [HEADERS.suggested]: "B200" }),
      row({ [HEADERS.confirm]: "Y", [HEADERS.due]: 5000, [HEADERS.suggested]: "ZZZ" }),
    ]);
    const summary = summarizeDryRun(planDuesRows(rows, [student({})]));
    expect(summary.totalRows).toBe(3);
    expect(summary.confirmedRows).toBe(2);
    expect(summary.confirmedSubtotal).toBe(6000);
    expect(summary.writeOffRows).toBe(1);
    expect(summary.matchedRows).toBe(1);
    expect(summary.matchedSubtotal).toBe(1000);
    expect(summary.unmatchedRows).toBe(1);
  });
});

describe("carry-forward installment builder", () => {
  it("uses sentinel 99 and zero late fee / transport / discount", () => {
    const payload = buildCarryForwardInstallment({
      studentId: "s-1",
      classId: "c-1",
      feeSettingId: "f-1",
      amount: 12500,
    });
    expect(payload.installment_no).toBe(CARRY_FORWARD_INSTALLMENT_NO_BASE);
    expect(payload.installment_label).toBe(CARRY_FORWARD_LABEL);
    expect(payload.due_date).toBe(CARRY_FORWARD_DUE_DATE);
    expect(payload.base_amount).toBe(12500);
    expect(payload.late_fee_flat_amount).toBe(0);
    expect(payload.transport_amount).toBe(0);
    expect(payload.discount_amount).toBe(0);
    expect(payload.is_carry_forward).toBe(true);
    expect(payload).not.toHaveProperty("amount_due");
  });

  it("steps to the next free >= 90 sentinel when 99 is taken", () => {
    expect(selectCarryForwardInstallmentNo([1, 2, 3, 4])).toBe(99);
    expect(selectCarryForwardInstallmentNo([99])).toBe(90);
    expect(selectCarryForwardInstallmentNo([99, 90, 91])).toBe(92);
  });

  it("rejects non-positive amounts", () => {
    expect(() =>
      buildCarryForwardInstallment({ studentId: "s", classId: "c", feeSettingId: "f", amount: 0 }),
    ).toThrow(/positive/i);
  });
});

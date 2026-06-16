import { describe, expect, it } from "vitest";

// Dependency-free JS core used by the dry-run CLI.
import { parseRows as portParse, planRows as portPlan } from "../../scripts/prev-year-dues-core.mjs";
import { planDuesRows, summarizeDryRun } from "@/lib/prev-year-dues/matching";
import { parseDuesRows } from "@/lib/prev-year-dues/parser";
import type { MatchableStudent } from "@/lib/prev-year-dues/types";

// The dry-run CLI (scripts/prev-year-dues-dry-run.mjs) presents the numbers the
// owner approves, but cannot import the TS lib without a TS runner, so it uses a
// hand-port (scripts/prev-year-dues-core.mjs). This test guarantees the port and
// the canonical, fully-tested lib produce IDENTICAL outcomes — otherwise the
// owner would approve figures the apply path (which uses the lib) won't match.

const HEADERS = {
  oldAdm: "Old Adm# (export)",
  oldName: "Name (last year export)",
  due: "Prev-Year Due (Rs)",
  suggested: "Suggested App Adm#",
  appName: "App Student Name",
  appPhone: "App Phone",
  confirm: "CONFIRM? (Y/N)",
  corrected: "If wrong: correct App Adm#",
};

const records: Record<string, string | number | null>[] = [
  { [HEADERS.confirm]: "Y", [HEADERS.due]: "11,500", [HEADERS.suggested]: "A100" }, // matched
  { [HEADERS.confirm]: "WRITE-OFF", [HEADERS.due]: 2000, [HEADERS.suggested]: "A101" }, // write-off
  { [HEADERS.confirm]: "N", [HEADERS.due]: 3000, [HEADERS.suggested]: "A102" }, // reject
  { [HEADERS.confirm]: "", [HEADERS.due]: 4000, [HEADERS.suggested]: "A103" }, // pending
  { [HEADERS.confirm]: "Y", [HEADERS.due]: 5000, [HEADERS.suggested]: "ZZZ" }, // unmatched
  { [HEADERS.confirm]: "Y", [HEADERS.due]: 6000, [HEADERS.suggested]: "DUP" }, // ambiguous
  { [HEADERS.confirm]: "Y", [HEADERS.due]: 7000, [HEADERS.suggested]: "NOFEE" }, // no fee setting
  { [HEADERS.confirm]: "Y", [HEADERS.suggested]: "A100" }, // parse error (no amount) + dup
  { [HEADERS.confirm]: "Y", [HEADERS.due]: 8000, [HEADERS.appName]: "Bina Devi", [HEADERS.appPhone]: "+91 90000 11111" }, // name+phone
  { [HEADERS.confirm]: "Y", [HEADERS.due]: 9000, [HEADERS.suggested]: "A777", [HEADERS.corrected]: "A100" }, // corrected → A100 dup
];

const students: MatchableStudent[] = [
  { studentId: "s-100", admissionNo: "A100", fullName: "Aarav", fatherName: "R", phone: "1", classLabel: "5", classId: "c1", feeSettingId: "f1" },
  { studentId: "s-dup-a", admissionNo: "DUP", fullName: "X", fatherName: "Y", phone: "2", classLabel: "5", classId: "c1", feeSettingId: "f1" },
  { studentId: "s-dup-b", admissionNo: "DUP", fullName: "Z", fatherName: "W", phone: "3", classLabel: "5", classId: "c1", feeSettingId: "f1" },
  { studentId: "s-nofee", admissionNo: "NOFEE", fullName: "Q", fatherName: "P", phone: "4", classLabel: "5", classId: "c1", feeSettingId: null },
  { studentId: "s-bina", admissionNo: null, fullName: "Bina Devi", fatherName: "S", phone: "9000011111", classLabel: "5", classId: "c1", feeSettingId: "f1" },
];

describe("dry-run CLI port matches the canonical lib exactly", () => {
  const libPlanned = planDuesRows(parseDuesRows(records), students);
  const portPlanned = portPlan(portParse(records), students);

  it("produces the same per-row status and matched student", () => {
    expect(portPlanned).toHaveLength(libPlanned.length);
    libPlanned.forEach((libRow, index) => {
      expect(portPlanned[index].status).toBe(libRow.status);
      expect(portPlanned[index].matchedStudentId).toBe(libRow.matchedStudentId);
      expect(portPlanned[index].alreadyApplied).toBe(libRow.alreadyApplied);
    });
  });

  it("produces the same matched count and subtotal the owner would approve", () => {
    const summary = summarizeDryRun(libPlanned);
    const portMatched = portPlanned.filter((p: { status: string }) => p.status === "matched");
    const portSubtotal = portMatched.reduce(
      (acc: number, p: { applyAmount: number | null }) => acc + (p.applyAmount ?? 0),
      0,
    );
    expect(portMatched).toHaveLength(summary.matchedRows);
    expect(portSubtotal).toBe(summary.matchedSubtotal);
  });
});

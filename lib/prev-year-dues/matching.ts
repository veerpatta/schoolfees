import {
  normalizeAdmissionNo,
  normalizeName,
  normalizePhone,
} from "@/lib/prev-year-dues/parser";
import type {
  DuesDryRunSummary,
  MatchableStudent,
  ParsedDuesRow,
  PlannedDuesRow,
} from "@/lib/prev-year-dues/types";

function describeDecision(row: ParsedDuesRow): string {
  switch (row.ownerDecision) {
    case "write_off":
      return "Owner marked WRITE-OFF — not carried forward.";
    case "reject":
      return "Owner marked N (reject) — not carried forward.";
    case "pending":
    default:
      return "No CONFIRM decision (blank) — not carried forward.";
  }
}

type StudentIndex = {
  byAdmission: Map<string, MatchableStudent[]>;
  byNamePhone: Map<string, MatchableStudent[]>;
};

function buildIndex(students: MatchableStudent[]): StudentIndex {
  const byAdmission = new Map<string, MatchableStudent[]>();
  const byNamePhone = new Map<string, MatchableStudent[]>();

  for (const student of students) {
    const admission = normalizeAdmissionNo(student.admissionNo);
    if (admission) {
      const bucket = byAdmission.get(admission) ?? [];
      bucket.push(student);
      byAdmission.set(admission, bucket);
    }

    const name = normalizeName(student.fullName);
    const phone = normalizePhone(student.phone);
    if (name && phone) {
      const key = `${name}|${phone}`;
      const bucket = byNamePhone.get(key) ?? [];
      bucket.push(student);
      byNamePhone.set(key, bucket);
    }
  }

  return { byAdmission, byNamePhone };
}

/**
 * Resolve every parsed row against the app-student index. Pure: no DB, no IO.
 *
 * Matching order (only for `confirm` rows with a valid amount):
 *   1. admission number (corrected overrides suggested)
 *   2. exact normalized name + phone (App columns, falling back to last-year name)
 * Multiple candidates → ambiguous. None → unmatched. Matched-but-no-fee-setting
 * → no_fee_setting (an insert would violate the NOT NULL fee_setting_id).
 * A second confirmed row resolving to an already-targeted student is flagged so
 * the batch can never double-apply.
 */
export function planDuesRows(
  rows: ParsedDuesRow[],
  students: MatchableStudent[],
): PlannedDuesRow[] {
  const index = buildIndex(students);
  const claimedStudentIds = new Set<string>();

  return rows.map((row) => {
    const base = {
      row,
      matchedStudentId: null,
      matchedAdmissionNo: null,
      feeSettingId: null,
      classId: null,
      applyAmount: null,
      alreadyApplied: false,
      skipReason: null,
    } satisfies Omit<PlannedDuesRow, "status" | "matchMethod">;

    if (row.parseError) {
      return { ...base, status: "error", matchMethod: "unmatched", skipReason: row.parseError };
    }

    if (row.ownerDecision !== "confirm") {
      return {
        ...base,
        status: "skipped",
        matchMethod: "unmatched",
        skipReason: describeDecision(row),
      };
    }

    // --- resolve to a student -------------------------------------------------
    let candidates: MatchableStudent[] = [];
    let matchMethod: PlannedDuesRow["matchMethod"] = "unmatched";

    const targetAdmission = normalizeAdmissionNo(row.targetAdmissionNo);
    if (targetAdmission) {
      const byAdmission = index.byAdmission.get(targetAdmission) ?? [];
      if (byAdmission.length > 0) {
        candidates = byAdmission;
        matchMethod = "admission_no";
      }
    }

    if (candidates.length === 0) {
      const name = normalizeName(row.appStudentName ?? row.oldName);
      const phone = normalizePhone(row.appPhone);
      if (name && phone) {
        const byNamePhone = index.byNamePhone.get(`${name}|${phone}`) ?? [];
        if (byNamePhone.length > 0) {
          candidates = byNamePhone;
          matchMethod = "name_phone";
        }
      }
    }

    if (candidates.length === 0) {
      return { ...base, status: "unmatched", matchMethod: "unmatched", skipReason: "No matching student found." };
    }

    if (candidates.length > 1) {
      return {
        ...base,
        status: "ambiguous",
        matchMethod: "ambiguous",
        skipReason: `Multiple students (${candidates.length}) match — needs manual selection.`,
      };
    }

    const student = candidates[0];

    if (claimedStudentIds.has(student.studentId)) {
      return {
        ...base,
        status: "error",
        matchMethod,
        matchedStudentId: student.studentId,
        matchedAdmissionNo: student.admissionNo,
        skipReason: "Duplicate confirmed row — another row already targets this student.",
      };
    }

    if (student.hasExistingCarryForward) {
      claimedStudentIds.add(student.studentId);
      return {
        ...base,
        status: "matched",
        matchMethod,
        matchedStudentId: student.studentId,
        matchedAdmissionNo: student.admissionNo,
        feeSettingId: student.feeSettingId,
        classId: student.classId,
        applyAmount: row.prevYearDue,
        alreadyApplied: true,
        skipReason: "Carry-forward line already exists — apply will skip (idempotent).",
      };
    }

    if (!student.feeSettingId || !student.classId) {
      return {
        ...base,
        status: "no_fee_setting",
        matchMethod,
        matchedStudentId: student.studentId,
        matchedAdmissionNo: student.admissionNo,
        skipReason: "Student's class has no active fee setting — cannot create installment.",
      };
    }

    claimedStudentIds.add(student.studentId);
    return {
      ...base,
      status: "matched",
      matchMethod,
      matchedStudentId: student.studentId,
      matchedAdmissionNo: student.admissionNo,
      feeSettingId: student.feeSettingId,
      classId: student.classId,
      applyAmount: row.prevYearDue,
    };
  });
}

/** Aggregate a planned set into the dry-run report figures. */
export function summarizeDryRun(planned: PlannedDuesRow[]): DuesDryRunSummary {
  const summary: DuesDryRunSummary = {
    totalRows: planned.length,
    confirmedRows: 0,
    confirmedSubtotal: 0,
    writeOffRows: 0,
    rejectedRows: 0,
    pendingRows: 0,
    matchedRows: 0,
    matchedSubtotal: 0,
    unmatchedRows: 0,
    ambiguousRows: 0,
    noFeeSettingRows: 0,
    errorRows: 0,
    alreadyAppliedRows: 0,
  };

  for (const item of planned) {
    const decision = item.row.ownerDecision;
    if (decision === "confirm") {
      summary.confirmedRows += 1;
      summary.confirmedSubtotal += item.row.prevYearDue ?? 0;
    } else if (decision === "write_off") {
      summary.writeOffRows += 1;
    } else if (decision === "reject") {
      summary.rejectedRows += 1;
    } else {
      summary.pendingRows += 1;
    }

    switch (item.status) {
      case "matched":
        summary.matchedRows += 1;
        summary.matchedSubtotal += item.applyAmount ?? 0;
        if (item.alreadyApplied) {
          summary.alreadyAppliedRows += 1;
        }
        break;
      case "unmatched":
        summary.unmatchedRows += 1;
        break;
      case "ambiguous":
        summary.ambiguousRows += 1;
        break;
      case "no_fee_setting":
        summary.noFeeSettingRows += 1;
        break;
      case "error":
        summary.errorRows += 1;
        break;
      default:
        break;
    }
  }

  return summary;
}

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { CARRY_FORWARD_LABEL } from "@/lib/prev-year-dues/constants";
import { getDisplayInstallmentLabel } from "@/lib/prev-year-dues/display";
import type { MatchMethod, OwnerDecision } from "@/lib/prev-year-dues/types";

export type PrevYearImportBatchSummary = {
  id: string;
  sessionLabel: string;
  fileName: string;
  fileSha256: string;
  sourceSheet: string | null;
  candidateRowCount: number;
  confirmedRowCount: number;
  confirmedSubtotal: number;
  appliedRowCount: number;
  appliedSubtotal: number;
  status: string;
  applyNotes: string | null;
  appliedAt: string | null;
  createdAt: string;
};

export type PrevYearImportRowView = {
  id: string;
  rowIndex: number;
  sourceAdmissionNo: string | null;
  sourceName: string | null;
  prevYearDue: number | null;
  ownerDecision: OwnerDecision;
  matchMethod: MatchMethod;
  matchedStudentId: string | null;
  matchedAdmissionNo: string | null;
  appliedInstallmentId: string | null;
  appliedAmount: number | null;
  status: string;
  skipReason: string | null;
};

type BatchRow = {
  id: string;
  session_label: string;
  file_name: string;
  file_sha256: string;
  source_sheet: string | null;
  candidate_row_count: number;
  confirmed_row_count: number;
  confirmed_subtotal: number;
  applied_row_count: number;
  applied_subtotal: number;
  status: string;
  apply_notes: string | null;
  applied_at: string | null;
  created_at: string;
};

function mapBatch(row: BatchRow): PrevYearImportBatchSummary {
  return {
    id: row.id,
    sessionLabel: row.session_label,
    fileName: row.file_name,
    fileSha256: row.file_sha256,
    sourceSheet: row.source_sheet,
    candidateRowCount: row.candidate_row_count,
    confirmedRowCount: row.confirmed_row_count,
    confirmedSubtotal: row.confirmed_subtotal,
    appliedRowCount: row.applied_row_count,
    appliedSubtotal: row.applied_subtotal,
    status: row.status,
    applyNotes: row.apply_notes,
    appliedAt: row.applied_at,
    createdAt: row.created_at,
  };
}

/**
 * Returns every previous-year import batch (newest first). Gracefully returns
 * [] if the table is missing (42P01) so the page renders an empty state while a
 * migration is pending.
 */
export async function listPrevYearImportBatches(): Promise<PrevYearImportBatchSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prev_year_import_batches")
    .select(
      "id, session_label, file_name, file_sha256, source_sheet, candidate_row_count, confirmed_row_count, confirmed_subtotal, applied_row_count, applied_subtotal, status, apply_notes, applied_at, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw new Error(`Failed to load previous-year import batches: ${error.message}`);
  }

  return ((data ?? []) as BatchRow[]).map(mapBatch);
}

export async function getPrevYearImportRows(batchId: string): Promise<PrevYearImportRowView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prev_year_import_rows")
    .select(
      "id, row_index, source_admission_no, source_name, prev_year_due, owner_decision, match_method, matched_student_id, matched_admission_no, applied_installment_id, applied_amount, status, skip_reason",
    )
    .eq("batch_id", batchId)
    .order("row_index", { ascending: true });

  if (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw new Error(`Failed to load previous-year import rows: ${error.message}`);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    rowIndex: row.row_index as number,
    sourceAdmissionNo: (row.source_admission_no as string | null) ?? null,
    sourceName: (row.source_name as string | null) ?? null,
    prevYearDue: (row.prev_year_due as number | null) ?? null,
    ownerDecision: row.owner_decision as OwnerDecision,
    matchMethod: row.match_method as MatchMethod,
    matchedStudentId: (row.matched_student_id as string | null) ?? null,
    matchedAdmissionNo: (row.matched_admission_no as string | null) ?? null,
    appliedInstallmentId: (row.applied_installment_id as string | null) ?? null,
    appliedAmount: (row.applied_amount as number | null) ?? null,
    status: row.status as string,
    skipReason: (row.skip_reason as string | null) ?? null,
  }));
}

export type BatchRowBreakdown = {
  applied: number;
  matched: number;
  skipped: number;
  error: number;
  pending: number;
  appliedSubtotal: number;
  notApplied: PrevYearImportRowView[];
};

export type PrevYearDuesCollectionRow = {
  admissionNo: string | null;
  studentName: string;
  classLabel: string;
  fatherPhone: string | null;
  sourceSessionLabel: string | null;
  targetSessionLabel: string | null;
  displayLabel: string;
  oldBalance: number;
  collected: number;
  remaining: number;
  status: string;
};

/**
 * Collected-vs-remaining on carry-forward (previous-year) balances for a
 * session, read live from the installment-balances view. Drives the
 * "previous-year-dues" export.
 */
export async function getPrevYearDuesCollectionRows(
  sessionLabel: string,
): Promise<PrevYearDuesCollectionRow[]> {
  const supabase = await createClient();
  const carryForwardView = await supabase
    .from("v_student_carry_forward_balances")
    .select(
      "admission_no, student_name, class_label, father_phone, source_session_label, target_session_label, fee_head, original_amount, collected_amount, remaining_amount, balance_status, status",
    )
    .eq("target_session_label", sessionLabel)
    .neq("status", "cancelled");

  if (!carryForwardView.error) {
    return ((carryForwardView.data ?? []) as Record<string, unknown>[])
      .map((row) => {
        const sourceSessionLabel = (row.source_session_label as string | null) ?? null;
        return {
          admissionNo: (row.admission_no as string | null) ?? null,
          studentName: (row.student_name as string | null) ?? "",
          classLabel: (row.class_label as string | null) ?? "",
          fatherPhone: (row.father_phone as string | null) ?? null,
          sourceSessionLabel,
          targetSessionLabel: (row.target_session_label as string | null) ?? null,
          displayLabel: getDisplayInstallmentLabel({
            isCarryForward: true,
            sourceSessionLabel,
            feeBucket: "previous_year_tuition",
          }),
          oldBalance: Number(row.original_amount ?? 0),
          collected: Number(row.collected_amount ?? 0),
          remaining: Number(row.remaining_amount ?? 0),
          status: (row.balance_status as string | null) ?? (row.status as string | null) ?? "",
        };
      })
      .sort((a, b) => b.remaining - a.remaining || a.studentName.localeCompare(b.studentName));
  }

  if (!["42P01", "42703"].includes((carryForwardView.error as { code?: string }).code ?? "")) {
    throw new Error(`Failed to load carry-forward balances: ${carryForwardView.error.message}`);
  }

  const { data, error } = await supabase
    .from("v_workbook_installment_balances")
    .select(
      "admission_no, student_name, class_label, father_phone, base_charge, applied_amount, pending_amount, balance_status, session_label, installment_label",
    )
    .eq("installment_label", CARRY_FORWARD_LABEL)
    .eq("session_label", sessionLabel);

  if (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw new Error(`Failed to load previous-year dues collection: ${error.message}`);
  }

  return ((data ?? []) as Record<string, unknown>[])
    .map((row) => ({
      admissionNo: (row.admission_no as string | null) ?? null,
      studentName: (row.student_name as string | null) ?? "",
      classLabel: (row.class_label as string | null) ?? "",
      fatherPhone: (row.father_phone as string | null) ?? null,
      sourceSessionLabel: null,
      targetSessionLabel: sessionLabel,
      displayLabel: getDisplayInstallmentLabel({ installmentLabel: (row.installment_label as string | null) ?? "" }),
      oldBalance: Number(row.base_charge ?? 0),
      collected: Number(row.applied_amount ?? 0),
      remaining: Number(row.pending_amount ?? 0),
      status: (row.balance_status as string | null) ?? "",
    }))
    .sort((a, b) => b.remaining - a.remaining || a.studentName.localeCompare(b.studentName));
}

/** Pure: group rows by disposition for display. */
export function summarizeBatchRows(rows: PrevYearImportRowView[]): BatchRowBreakdown {
  const breakdown: BatchRowBreakdown = {
    applied: 0,
    matched: 0,
    skipped: 0,
    error: 0,
    pending: 0,
    appliedSubtotal: 0,
    notApplied: [],
  };

  for (const row of rows) {
    switch (row.status) {
      case "applied":
        breakdown.applied += 1;
        breakdown.appliedSubtotal += row.appliedAmount ?? 0;
        break;
      case "matched":
        breakdown.matched += 1;
        break;
      case "error":
        breakdown.error += 1;
        breakdown.notApplied.push(row);
        break;
      case "pending":
        breakdown.pending += 1;
        breakdown.notApplied.push(row);
        break;
      case "skipped":
      default:
        breakdown.skipped += 1;
        breakdown.notApplied.push(row);
        break;
    }
  }

  return breakdown;
}

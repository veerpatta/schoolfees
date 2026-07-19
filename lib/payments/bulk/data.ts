import "server-only";

import type { PaymentMode } from "@/lib/db/types";
import { getFeePolicyForSession } from "@/lib/fees/data";
import { parseStudentImportFile } from "@/lib/import/parser";
import { normalizeLookupToken } from "@/lib/import/validation";
import {
  DuplicatePaymentWarning,
  postStudentPayment,
  toFriendlyPaymentPostingError,
} from "@/lib/payments/data";
import {
  flagIntraFileDuplicates,
  mapPaymentImportHeaders,
  validatePaymentImportRow,
  type PaymentImportStudentLookup,
} from "@/lib/payments/bulk/validation";
import {
  PAYMENT_IMPORT_MAX_ROWS,
  type PaymentImportBatchSummary,
  type PaymentImportRowView,
  type ValidatedPaymentRow,
} from "@/lib/payments/bulk/types";
import { createClient } from "@/lib/supabase/server";

type RowRecord = {
  id: string;
  row_number: number;
  admission_no: string | null;
  student_id: string | null;
  student_name: string | null;
  payment_date: string | null;
  payment_mode: PaymentMode | null;
  amount: number | null;
  remarks: string | null;
  validation_status: PaymentImportRowView["validationStatus"];
  validation_messages: unknown;
  duplicate_acknowledged: boolean;
  client_request_id: string;
  receipt_id: string | null;
  receipt_number: string | null;
  posted_at: string | null;
  post_error: string | null;
};

function toRowView(row: RowRecord): PaymentImportRowView {
  return {
    id: row.id,
    rowNumber: row.row_number,
    admissionNo: row.admission_no,
    studentId: row.student_id,
    studentName: row.student_name,
    paymentDate: row.payment_date,
    paymentMode: row.payment_mode,
    amount: row.amount,
    remarks: row.remarks,
    validationStatus: row.validation_status,
    validationMessages: Array.isArray(row.validation_messages)
      ? (row.validation_messages as string[])
      : [],
    duplicateAcknowledged: row.duplicate_acknowledged,
    receiptId: row.receipt_id,
    receiptNumber: row.receipt_number,
    postedAt: row.posted_at,
    postError: row.post_error,
  };
}

function toSingle<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

async function lookupStudentsByAdmissionNo(admissionNos: string[]) {
  const supabase = await createClient();
  const lookup = new Map<string, PaymentImportStudentLookup[]>();

  if (admissionNos.length === 0) {
    return lookup;
  }

  const { data, error } = await supabase
    .from("students")
    .select("id, admission_no, full_name, status, class_ref:classes(session_label)")
    .in("admission_no", admissionNos);

  if (error) {
    throw new Error(`Could not look up students: ${error.message}`);
  }

  for (const raw of (data ?? []) as Array<{
    id: string;
    admission_no: string;
    full_name: string;
    status: string;
    class_ref: { session_label: string } | { session_label: string }[] | null;
  }>) {
    const key = normalizeLookupToken(raw.admission_no);
    const list = lookup.get(key) ?? [];
    list.push({
      id: raw.id,
      admissionNo: raw.admission_no,
      fullName: raw.full_name,
      status: raw.status,
      classSessionLabel: toSingle(raw.class_ref)?.session_label ?? null,
    });
    lookup.set(key, list);
  }

  return lookup;
}

export async function createPaymentImportBatch(
  file: File,
  sessionLabel: string,
): Promise<PaymentImportBatchSummary> {
  const parsed = await parseStudentImportFile(file);

  if (parsed.rows.length > PAYMENT_IMPORT_MAX_ROWS) {
    throw new Error(
      `The file has ${parsed.rows.length} rows — the bulk payment limit is ${PAYMENT_IMPORT_MAX_ROWS} per upload. Split the file and upload in parts.`,
    );
  }

  const { mapping } = mapPaymentImportHeaders(parsed.headers);
  const mappedFields = new Set(mapping.values());
  for (const required of ["admissionNo", "amount", "paymentDate", "paymentMode"]) {
    if (!mappedFields.has(required)) {
      throw new Error(
        "The file is missing required columns. Download the template — it needs SR no, Amount, Payment date, and Payment mode.",
      );
    }
  }

  const policy = await getFeePolicyForSession(sessionLabel);
  const allowedModes = new Set<PaymentMode>(
    policy.acceptedPaymentModes.map((mode: { value: PaymentMode }) => mode.value),
  );

  const admissionNos = [
    ...new Set(
      parsed.rows
        .map((row) => {
          for (const [header, field] of mapping) {
            if (field === "admissionNo") {
              const value = row.rawPayload[header];
              return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
            }
          }
          return "";
        })
        .filter(Boolean),
    ),
  ];
  const studentsByAdmissionNo = await lookupStudentsByAdmissionNo(admissionNos);

  const validated: ValidatedPaymentRow[] = parsed.rows.map((row) =>
    validatePaymentImportRow(row.rawPayload, mapping, {
      sessionLabel,
      studentsByAdmissionNo,
      allowedModes,
    }),
  );
  flagIntraFileDuplicates(validated);

  const counts = {
    valid: validated.filter((row) => row.status === "valid").length,
    warning: validated.filter((row) => row.status === "warning").length,
    error: validated.filter((row) => row.status === "error").length,
  };

  const supabase = await createClient();
  const { data: batchRaw, error: batchError } = await supabase
    .from("payment_import_batches")
    .insert({
      session_label: sessionLabel,
      file_name: parsed.filename,
      source_format: parsed.sourceFormat,
      status: "validated",
      total_rows: validated.length,
      valid_rows: counts.valid,
      warning_rows: counts.warning,
      error_rows: counts.error,
    })
    .select("id")
    .single();

  if (batchError || !batchRaw?.id) {
    throw new Error(`Could not create the upload batch: ${batchError?.message ?? "unknown error"}`);
  }

  const batchId = batchRaw.id as string;
  const { error: rowsError } = await supabase.from("payment_import_rows").insert(
    validated.map((row, index) => ({
      batch_id: batchId,
      row_number: parsed.rows[index].rowIndex,
      raw_payload: parsed.rows[index].rawPayload,
      admission_no: row.admissionNo,
      student_id: row.studentId,
      student_name: row.studentName,
      payment_date: row.paymentDate,
      payment_mode: row.paymentMode,
      amount: row.amount,
      remarks: row.remarks,
      validation_status: row.status,
      validation_messages: row.messages,
    })),
  );

  if (rowsError) {
    throw new Error(`Could not stage the upload rows: ${rowsError.message}`);
  }

  return getPaymentImportBatchSummary(batchId);
}

export async function getPaymentImportBatchSummary(
  batchId: string,
): Promise<PaymentImportBatchSummary> {
  const supabase = await createClient();
  const [{ data: batchRaw, error: batchError }, { data: rowsRaw, error: rowsError }] =
    await Promise.all([
      supabase
        .from("payment_import_batches")
        .select(
          "id, session_label, file_name, status, total_rows, valid_rows, warning_rows, error_rows, posted_rows",
        )
        .eq("id", batchId)
        .maybeSingle(),
      supabase
        .from("payment_import_rows")
        .select(
          "id, row_number, admission_no, student_id, student_name, payment_date, payment_mode, amount, remarks, validation_status, validation_messages, duplicate_acknowledged, client_request_id, receipt_id, receipt_number, posted_at, post_error",
        )
        .eq("batch_id", batchId)
        .order("row_number", { ascending: true }),
    ]);

  if (batchError || !batchRaw) {
    throw new Error(`Upload batch not found: ${batchError?.message ?? batchId}`);
  }
  if (rowsError) {
    throw new Error(`Could not load upload rows: ${rowsError.message}`);
  }

  return {
    batchId: batchRaw.id as string,
    sessionLabel: batchRaw.session_label as string,
    fileName: batchRaw.file_name as string,
    status: batchRaw.status as PaymentImportBatchSummary["status"],
    totalRows: batchRaw.total_rows as number,
    validRows: batchRaw.valid_rows as number,
    warningRows: batchRaw.warning_rows as number,
    errorRows: batchRaw.error_rows as number,
    postedRows: batchRaw.posted_rows as number,
    rows: ((rowsRaw ?? []) as RowRecord[]).map(toRowView),
  };
}

export type CommitPaymentImportResult = {
  posted: number;
  failed: number;
  results: Array<{
    rowId: string;
    ok: boolean;
    receiptNumber?: string;
    error?: string;
  }>;
};

/**
 * Posts a chunk of staged rows SEQUENTIALLY through postStudentPayment — the
 * single posting path. Each row's staged client_request_id makes a re-run
 * idempotent (the receipts unique index resolves retries to the existing
 * receipt). Rows flagged 'warning' post only when acknowledged.
 */
export async function commitPaymentImportRows(payload: {
  batchId: string;
  rowIds: string[];
  acknowledgedRowIds: string[];
  receivedBy: string;
}): Promise<CommitPaymentImportResult> {
  const supabase = await createClient();
  const acknowledged = new Set(payload.acknowledgedRowIds);

  const { data: batchRaw, error: batchError } = await supabase
    .from("payment_import_batches")
    .select("id, session_label, status")
    .eq("id", payload.batchId)
    .maybeSingle();

  if (batchError || !batchRaw) {
    throw new Error("Upload batch not found.");
  }
  if (batchRaw.status === "cancelled") {
    throw new Error("This upload batch was cancelled.");
  }

  const { data: rowsRaw, error: rowsError } = await supabase
    .from("payment_import_rows")
    .select(
      "id, row_number, admission_no, student_id, student_name, payment_date, payment_mode, amount, remarks, validation_status, validation_messages, duplicate_acknowledged, client_request_id, receipt_id, receipt_number, posted_at, post_error",
    )
    .eq("batch_id", payload.batchId)
    .in("id", payload.rowIds);

  if (rowsError) {
    throw new Error(`Could not load rows to post: ${rowsError.message}`);
  }

  await supabase
    .from("payment_import_batches")
    .update({ status: "committing" })
    .eq("id", payload.batchId);

  const results: CommitPaymentImportResult["results"] = [];
  let posted = 0;

  for (const row of (rowsRaw ?? []) as RowRecord[]) {
    if (row.posted_at || row.receipt_id) {
      results.push({ rowId: row.id, ok: true, receiptNumber: row.receipt_number ?? undefined });
      continue;
    }
    if (row.validation_status === "error" || row.validation_status === "pending") {
      results.push({ rowId: row.id, ok: false, error: "Row has validation errors." });
      continue;
    }
    const isAcknowledged = row.duplicate_acknowledged || acknowledged.has(row.id);
    if (row.validation_status === "warning" && !isAcknowledged) {
      results.push({
        rowId: row.id,
        ok: false,
        error: "Possible duplicate — tick the confirmation for this row before posting.",
      });
      continue;
    }
    if (!row.student_id || !row.payment_date || !row.payment_mode || !row.amount) {
      results.push({ rowId: row.id, ok: false, error: "Row is missing required values." });
      continue;
    }

    try {
      const receipt = await postStudentPayment({
        studentId: row.student_id,
        sessionLabel: batchRaw.session_label as string,
        paymentDate: row.payment_date,
        paymentMode: row.payment_mode,
        paymentAmount: row.amount,
        referenceNumber: null,
        remarks: row.remarks
          ? `[Bulk upload] ${row.remarks}`
          : "[Bulk upload]",
        receivedBy: payload.receivedBy,
        clientRequestId: row.client_request_id,
        acknowledgeDailyDuplicate: isAcknowledged,
      });

      await supabase
        .from("payment_import_rows")
        .update({
          receipt_id: receipt.receiptId,
          receipt_number: receipt.receiptNumber,
          posted_at: new Date().toISOString(),
          post_error: null,
          duplicate_acknowledged: isAcknowledged,
        })
        .eq("id", row.id);

      posted += 1;
      results.push({ rowId: row.id, ok: true, receiptNumber: receipt.receiptNumber });
    } catch (error) {
      const message =
        error instanceof DuplicatePaymentWarning
          ? `${error.message} (existing receipt ${error.receiptNumber})`
          : toFriendlyPaymentPostingError(error);

      await supabase
        .from("payment_import_rows")
        .update({ post_error: message })
        .eq("id", row.id);

      results.push({ rowId: row.id, ok: false, error: message });
    }
  }

  // Recompute batch progress from the rows table (authoritative) instead of
  // incrementing counters, so concurrent/retried chunks stay consistent.
  const { count: postedCount } = await supabase
    .from("payment_import_rows")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", payload.batchId)
    .not("posted_at", "is", null);
  const { count: postableCount } = await supabase
    .from("payment_import_rows")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", payload.batchId)
    .in("validation_status", ["valid", "warning"]);

  await supabase
    .from("payment_import_batches")
    .update({
      posted_rows: postedCount ?? 0,
      status:
        (postedCount ?? 0) >= (postableCount ?? 0) && (postableCount ?? 0) > 0
          ? "committed"
          : "committing",
    })
    .eq("id", payload.batchId);

  return { posted, failed: results.filter((result) => !result.ok).length, results };
}

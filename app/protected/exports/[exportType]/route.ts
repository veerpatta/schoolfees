import type { NextRequest } from "next/server";

import {
  getReceiptReversalTotals,
  isReceiptReversed,
} from "@/lib/receipts/reversals";
import { getOfficeWorkbookData } from "@/lib/transactions/dues";
import type { OfficeWorkbookView } from "@/lib/transactions/workbook";
import { getDefaulterExportRows } from "@/lib/defaulters/data";
import { getPrevYearDuesCollectionRows } from "@/lib/prev-year-dues/data";
import { getDisplayInstallmentLabel } from "@/lib/prev-year-dues/display";
import { getRecoveryQueue } from "@/lib/recovery/data";
import {
  getRepaymentPlanExportRows,
  getRepaymentScheduleExportRows,
} from "@/lib/repayment-plans/data";
import {
  getContactSummariesForStudents,
  getNoCallFlags,
  getPromiseReliabilityForStudents,
} from "@/lib/defaulters/contacts";
import {
  EMPTY_DEFAULTER_FILTERS,
  type DefaulterFilters,
} from "@/lib/defaulters/types";
import {
  getAllStudents,
  getStudentFormOptions,
  getStudentMasterFieldsByIds,
} from "@/lib/students/data";
import {
  STUDENT_INFO_FIELDS,
  STUDENT_INFO_SELECT_COLUMNS,
  mapStudentInfoRow,
} from "@/lib/students/info-fields";
import type { StudentInfoFields, StudentInfoRow } from "@/lib/students/info-fields";
import {
  getConventionalDiscountPolicies,
  getFeePolicySummary,
  getStudentConventionalDiscountAssignments,
} from "@/lib/fees/data";
import { getMasterDataOptions } from "@/lib/master-data/data";
import {
  buildTransportRouteLabel,
  isSentinelNoTransportRoute,
} from "@/lib/transport/label";
import {
  getWorkbookInstallmentRows,
  getWorkbookStudentFinancials,
  getWorkbookTransactions,
} from "@/lib/workbook/data";
import { getAuthenticatedStaff, hasStaffPermission } from "@/lib/supabase/session";
import { createClient } from "@/lib/supabase/server";
import { fetchInChunks } from "@/lib/helpers/chunk";
import { formatExportName } from "@/lib/helpers/export";
import { formatInr } from "@/lib/helpers/currency";
import { formatDateTimeIst } from "@/lib/helpers/date";
import { recordActivity } from "@/lib/activity/events";

import { withDownloadToken } from "@/lib/helpers/download-token";
import { parseSegments, STUDENT_SEGMENTS } from "@/lib/segments/student-segments";
import type { StudentListFilters } from "@/lib/students/types";
// Heavy exports (ai-context-bundle builds a 16-sheet workbook from ~14 reads)
// overrun Vercel's default function timeout on real data volumes.
export const maxDuration = 60;

// PostgREST .in() filters serialize ids into the URL; chunk to stay under limits.
const IN_FILTER_CHUNK_SIZE = 200;

type RouteContext = {
  params: Promise<{
    exportType: string;
  }>;
};

/** Today in IST as YYYY-MM-DD — schedule rows are priced against it. */
function todayIsoIst() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function workbookResponse(filename: string, rows: Array<Record<string, string | number>>) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Export");
  const data = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renders the same rows as a printable HTML page. The browser's Save-as-PDF
 * destination produces a PDF that mirrors the XLSX export.
 */
function printableHtmlResponse(
  title: string,
  rows: Array<Record<string, string | number>>,
): Response {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : ["Export"];
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 11px; color: #111; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 8px; border-bottom: 1px solid #999; margin-bottom: 12px; }
  h1 { font-size: 16px; margin: 0; }
  .meta { font-size: 10px; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  thead { background: #f3f3f3; }
  th, td { border: 1px solid #d8d8d8; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  tr:nth-child(even) td { background: #fafafa; }
  .print-hint { padding: 8px 12px; background: #fff8d6; border: 1px solid #e5d97a; font-size: 11px; margin-bottom: 12px; }
  @media print { .print-hint { display: none; } }
</style>
</head>
<body>
  <div class="print-hint">Use your browser's Print dialog (Ctrl+P / Cmd+P) and choose <strong>Save as PDF</strong>.</div>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Generated ${escapeHtml(formatDateTimeIst(new Date()))} · ${rows.length} row${rows.length === 1 ? "" : "s"}</div>
  </header>
  <table>
    <thead>
      <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (row) =>
            `<tr>${headers
              .map((header) => {
                const value = row[header];
                // Cell numbers are export-cell values which may be money, counts,
                // or percentages. We render them via Intl.NumberFormat (en-IN
                // grouping) to keep the existing CSV/HTML output stable. This is
                // the export pipeline, not a money-display surface — the audit
                // suppression is genuine and bounded to this cell renderer.
                const display =
                  value === undefined || value === null
                    ? ""
                    : typeof value === "number"
                      ? new Intl.NumberFormat("en-IN").format(value) // @allow-raw-money-format
                      : String(value);
                return `<td>${escapeHtml(display)}</td>`;
              })
              .join("")}</tr>`,
        )
        .join("\n")}
    </tbody>
  </table>
  <script>
    window.addEventListener("load", () => { setTimeout(() => window.print(), 200); });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * Appends the 25 information columns to a row, renaming any that would collide
 * with a column already on it.
 *
 * The bundle's Students sheet already carries "Guardian name" and "Guardian
 * phone" — but those come from `student_family_groups`: a different guardian,
 * on a different table, belonging to the family rather than the child.
 * Spreading the student's own guardian over them replaced one fact with the
 * other and silently dropped two columns from the sheet, so a student with no
 * family group still showed a family guardian.
 *
 * Generic rather than a two-name special case: the next information field that
 * happens to share a header would fail the same way and just as quietly.
 */
function withStudentInfoColumns(
  base: Record<string, unknown>,
  info: StudentInfoFields | undefined,
) {
  const row: Record<string, unknown> = { ...base };

  for (const field of STUDENT_INFO_FIELDS) {
    const key = Object.hasOwn(row, field.header)
      ? `${field.header} (student record)`
      : field.header;
    row[key] = info?.[field.name] ?? "";
  }

  return row;
}

async function rowsResponse(
  format: "xlsx" | "pdf",
  filenameBase: string,
  title: string,
  rows: Array<Record<string, string | number>>,
): Promise<Response> {
  if (format === "pdf") {
    return printableHtmlResponse(title, rows);
  }
  return workbookResponse(`${filenameBase}.xlsx`, rows);
}

async function aiContextBundleResponse(filename: string, sessionLabel: string) {
  const XLSX = await import("xlsx");

  // Source the roster from the workbook financials view (ALL statuses, not
  // paginated) so the Students sheet is complete and every SR no referenced by
  // Installments / Payments / Adjustments / Refunds resolves. getStudents() is
  // page-capped (100 rows) and active-only — wrong for a full AI snapshot.
  const [
    policy,
    masterData,
    financials,
    installments,
    transactions,
    discountPolicies,
    previousYearDues,
    leftStudentRecovery,
  ] = await Promise.all([
    getFeePolicySummary(),
    getMasterDataOptions(),
    getWorkbookStudentFinancials({ sessionLabel }),
    getWorkbookInstallmentRows({ sessionLabel }),
    getWorkbookTransactions({ sessionLabel }),
    getConventionalDiscountPolicies(sessionLabel),
    getPrevYearDuesCollectionRows(sessionLabel),
    getRecoveryQueue(),
  ]);

  const allStudentIds = financials.map((row) => row.studentId);
  const activePendingStudentIds = financials
    .filter((row) => row.recordStatus === "active" && row.outstandingAmount > 0)
    .map((row) => row.studentId);

  const [
    discountAssignments,
    contactSummaries,
    noCallFlags,
    promiseReliability,
  ] = await Promise.all([
    getStudentConventionalDiscountAssignments({
      academicSessionLabel: sessionLabel,
      studentIds: allStudentIds,
    }),
    getContactSummariesForStudents(activePendingStudentIds, sessionLabel),
    getNoCallFlags(activePendingStudentIds, sessionLabel),
    getPromiseReliabilityForStudents(activePendingStudentIds, sessionLabel),
  ]);

  // Per-student conventional discount labels (derived from assignments so they
  // cover every status, not just the active list).
  const discountLabelsByStudent = new Map<string, string[]>();
  for (const assignment of discountAssignments) {
    if (!assignment.isActive) continue;
    const labels = discountLabelsByStudent.get(assignment.studentId) ?? [];
    labels.push(assignment.policy.displayName);
    discountLabelsByStudent.set(assignment.studentId, labels);
  }

  // Every read below returns `{ data, error }`, and `fetchInChunks` returns the
  // rows it managed to collect ALONGSIDE the error. None of them were checked.
  //
  // This workbook is fed to a model that cannot go and look anything up, so an
  // empty sheet is read as "the school has never done this". A caller without
  // finance:view got an empty Adjustments sheet and a README line saying
  // "Adjustments: 0" — indistinguishable from a school that has never made a
  // correction. A failure partway through chunking is worse again: a half-
  // filled sheet that looks complete.
  //
  // So every read is registered here, and a failed one is named in the README
  // and in the _HEALTH sheet rather than being left to look like an absence.
  type ReadStatus = {
    source: string;
    sheet: string;
    ok: boolean;
    rows: number;
    reason: string;
  };
  const readStatus = new Map<string, ReadStatus>();

  function checkRead<T>(
    source: string,
    sheet: string,
    result: { data: T[] | null; error: unknown },
  ): T[] {
    const rows = (result.data ?? []) as T[];
    const reason = result.error
      ? ((result.error as { message?: string })?.message ?? String(result.error)).slice(0, 300)
      : "";
    readStatus.set(source, {
      source,
      sheet,
      ok: !result.error,
      rows: rows.length,
      reason,
    });
    return rows;
  }

  const degraded = () => [...readStatus.values()].filter((entry) => !entry.ok);

  /** A count that must not read as zero when the read behind it failed. */
  const countOf = (source: string, rows: { length: number }) =>
    readStatus.get(source)?.ok === false
      ? "UNAVAILABLE (read failed — see _HEALTH)"
      : rows.length;

  // Append-only corrections and refunds, session-scoped via the student set.
  // These read under the caller's JWT, so a role without finance:view is
  // refused by RLS — which must be reported, not rendered as an empty sheet.
  const supabase = await createClient();
  const [adjustmentsResult, refundsResult] = await Promise.all([
    fetchInChunks(allStudentIds, IN_FILTER_CHUNK_SIZE, (chunk) =>
      supabase
        .from("payment_adjustments")
        // No `installment_ref:installments(...)` embed. payment_adjustments has
        // no foreign key to installments — its only one is the composite
        // payment_adjustments_payment_fk to payments — so PostgREST answered
        // "Could not find a relationship between 'payment_adjustments' and
        // 'installments' in the schema cache" and the whole read failed. The
        // error was never checked, so the Adjustments sheet shipped empty and
        // the README said "Adjustments: 0" while 49 corrections sat in the
        // table. The label is resolved from installment_id against the
        // installments already loaded for this workbook.
        .select(
          "id, student_id, installment_id, adjustment_type, amount_delta, reason, notes, created_at, payment_ref:payments(receipt_ref:receipts(receipt_number))",
        )
        .in("student_id", chunk)
        .order("created_at", { ascending: true }),
    ),
    fetchInChunks(allStudentIds, IN_FILTER_CHUNK_SIZE, (chunk) =>
      supabase
        .from("refund_requests")
        .select(
          "id, student_id, refund_date, requested_amount, refund_method, refund_reference, reason, notes, status, created_at, approved_at, processed_at, receipt_ref:receipts(receipt_number)",
        )
        .in("student_id", chunk)
        .order("created_at", { ascending: true }),
    ),
  ]);

  // The workbook financials view carries the fee projection plus name/phone/DOB,
  // but not the rest of the student master (address, email, joined/left dates,
  // notes, audit stamps) or the sibling grouping. Read those straight from the
  // source tables so the Students sheet is the whole record, not a subset.
  const [studentDetailResult, familyMemberResult] = await Promise.all([
    fetchInChunks(allStudentIds, IN_FILTER_CHUNK_SIZE, (chunk) =>
      supabase
        .from("students")
        .select(
          `id, address, email, joined_on, left_on, notes, photo_path, created_at, updated_at, ${STUDENT_INFO_SELECT_COLUMNS}`,
        )
        .in("id", chunk),
    ),
    fetchInChunks(allStudentIds, IN_FILTER_CHUNK_SIZE, (chunk) =>
      supabase
        .from("student_family_members")
        .select(
          "student_id, sibling_order, is_policy_candidate, manual_order_override, notes, family_ref:student_family_groups(family_label, guardian_name, guardian_phone)",
        )
        .eq("academic_session_label", sessionLabel)
        .in("student_id", chunk),
    ),
  ]);

  // Through `unknown`: the select is assembled with STUDENT_INFO_SELECT_COLUMNS,
  // so postgrest-js cannot parse it at the type level. These row shapes were
  // always hand-declared here.
  const studentDetailRows = checkRead("students (detail)", "Students", studentDetailResult);

  const studentDetailById = new Map(
    (studentDetailRows as unknown as Array<{
      id: string;
      address: string | null;
      email: string | null;
      joined_on: string | null;
      left_on: string | null;
      notes: string | null;
      photo_path: string | null;
      created_at: string | null;
      updated_at: string | null;
    }>).map((row) => [row.id, row]),
  );

  // The 25 information columns, camelCased off the same rows. Keyed separately
  // so the Students sheet and the Recovery Follow-Up sheet read one shape.
  const masterFieldsById = new Map(
    (studentDetailRows as unknown as Array<
      StudentInfoRow & { id: string }
    >).map((row) => [row.id, mapStudentInfoRow(row)]),
  );

  // Everything the app knows that the financials projection does not carry.
  //
  // Fee overrides are the important one. The projection resolves them into a
  // single tuition/transport number, so the workbook could show a student
  // charged Rs 14,000 for transport with the Route column blank and no way to
  // tell whether that was a route, an override, or a mistake. Three active
  // students are in exactly that state, for Rs 29,500 a year between them.
  const [
    feeOverrideResult,
    lateFeeWaiverResult,
    allocationResult,
    feeSettingResult,
    directoryResult,
  ] = await Promise.all([
    fetchInChunks(allStudentIds, IN_FILTER_CHUNK_SIZE, (chunk) =>
      supabase
        .from("student_fee_overrides")
        .select(
          "student_id, custom_tuition_fee_amount, custom_transport_fee_amount, custom_books_fee_amount, custom_admission_activity_misc_fee_amount, custom_other_fee_heads, custom_other_fee_head_labels, custom_late_fee_flat_amount, other_adjustment_head, other_adjustment_amount, discount_amount, student_type_override, transport_applies_override, reason, notes, updated_at",
        )
        .eq("is_active", true)
        .in("student_id", chunk),
    ),
    fetchInChunks(allStudentIds, IN_FILTER_CHUNK_SIZE, (chunk) =>
      supabase
        .from("student_late_fee_waivers")
        .select(
          "student_id, installment_id, amount, reason, source, waived_by_label, waived_at, voided_at, void_reason, installment_ref:installments(installment_no, installment_label, due_date)",
        )
        .eq("session_label", sessionLabel)
        .in("student_id", chunk)
        .order("waived_at", { ascending: true }),
    ),
    // Receipt -> installment -> rupees. The Payments sheet is receipt-level, so
    // "this family paid Rs 8,000" could not be traced to which installments it
    // cleared.
    fetchInChunks(allStudentIds, IN_FILTER_CHUNK_SIZE, (chunk) =>
      supabase
        .from("payments")
        .select(
          "student_id, amount, notes, created_at, discount_applied_at_posting, waiver_applied_at_posting, pending_before_posting, pending_after_posting, receipt_ref:receipts(id, receipt_number, total_amount, payment_date, payment_mode, received_by), installment_ref:installments(installment_no, installment_label, due_date)",
        )
        .in("student_id", chunk)
        .order("created_at", { ascending: true }),
    ),
    supabase
      .from("fee_settings")
      .select(
        "class_id, annual_base_amount, tuition_fee_amount, transport_fee_amount, books_fee_amount, admission_activity_misc_fee_amount, other_fee_heads, late_fee_flat_amount, installment_count, student_type_default, transport_applies_default, is_active, notes, class_ref:classes!inner(class_name, section, stream_name, session_label)",
      )
      .eq("is_active", true)
      .eq("class_ref.session_label", sessionLabel),
    fetchInChunks(allStudentIds, IN_FILTER_CHUNK_SIZE, (chunk) =>
      supabase
        .from("v_student_directory")
        .select("*")
        .eq("session_label", sessionLabel)
        .in("student_id", chunk),
    ),
  ]);

  // Checked here rather than where the rows are shaped: _README is assembled
  // before those points and has to be able to say whether each read succeeded.
  const allocationRowsChecked = checkRead(
    "payments (allocations)",
    "Payment Allocations",
    allocationResult,
  );
  const waiverRowsChecked = checkRead(
    "student_late_fee_waivers",
    "Late Fee Waivers",
    lateFeeWaiverResult,
  );
  const feeSettingRowsChecked = checkRead("fee_settings", "Class Fee Settings", feeSettingResult);

  type FeeOverrideRow = {
    student_id: string;
    custom_tuition_fee_amount: number | null;
    custom_transport_fee_amount: number | null;
    custom_books_fee_amount: number | null;
    custom_admission_activity_misc_fee_amount: number | null;
    custom_other_fee_heads: Record<string, number> | null;
    custom_other_fee_head_labels: Record<string, string> | null;
    custom_late_fee_flat_amount: number | null;
    other_adjustment_head: string | null;
    other_adjustment_amount: number | null;
    discount_amount: number | null;
    student_type_override: string | null;
    transport_applies_override: boolean | null;
    reason: string | null;
    notes: string | null;
    updated_at: string | null;
  };

  const feeOverrideByStudent = new Map(
    (checkRead<FeeOverrideRow>("student_fee_overrides", "Fee Overrides", feeOverrideResult)).map(
      (row) => [row.student_id, row],
    ),
  );

  const directoryByStudent = new Map(
    (checkRead<Record<string, unknown>>("v_student_directory", "Student Segments", directoryResult)).map((row) => [
      String(row.student_id),
      row,
    ]),
  );

  const familyByStudentId = new Map(
    (checkRead("student_family_members", "Siblings", familyMemberResult) as Array<{
      student_id: string;
      sibling_order: number | null;
      is_policy_candidate: boolean | null;
      manual_order_override: boolean | null;
      notes: string | null;
      family_ref:
        | { family_label: string | null; guardian_name: string | null; guardian_phone: string | null }
        | { family_label: string | null; guardian_name: string | null; guardian_phone: string | null }[]
        | null;
    }>).map((row) => [row.student_id, row]),
  );

  const adjustments = checkRead("payment_adjustments", "Adjustments", adjustmentsResult) as Array<{
    id: string;
    student_id: string;
    adjustment_type: string;
    amount_delta: number;
    reason: string;
    notes: string | null;
    created_at: string;
    installment_id: string | null;
    payment_ref:
      | { receipt_ref: { receipt_number: string } | { receipt_number: string }[] | null }
      | { receipt_ref: { receipt_number: string } | { receipt_number: string }[] | null }[]
      | null;
  }>;
  const refunds = checkRead("refund_requests", "Refunds", refundsResult) as Array<{
    id: string;
    student_id: string;
    refund_date: string;
    requested_amount: number;
    refund_method: string;
    refund_reference: string | null;
    reason: string;
    notes: string | null;
    status: string;
    created_at: string;
    approved_at: string | null;
    processed_at: string | null;
    receipt_ref: { receipt_number: string } | { receipt_number: string }[] | null;
  }>;

  const firstOf = <T,>(value: T | T[] | null | undefined): T | null =>
    Array.isArray(value) ? value[0] ?? null : value ?? null;

  const studentIndex = new Map(financials.map((row) => [row.studentId, row]));
  // Adjustments carry an installment_id but no readable label, and the table has
  // no foreign key to installments to embed one through. The workbook already
  // holds every installment for this session, so the label comes from there.
  const installmentLabelById = new Map(
    installments.map((row) => [row.installmentId, getDisplayInstallmentLabel(row)]),
  );
  const activeCount = financials.filter((row) => row.recordStatus === "active").length;

  const generatedAt = new Date().toISOString();

  const readmeLines: string[] = [
    `VPPS School Fee Management — AI context bundle`,
    `Snapshot taken: ${generatedAt}`,
    `Active academic session: ${sessionLabel}`,
    ``,
    // First thing in the file, because a reader who stops after the header must
    // still not mistake an incomplete sheet for an empty one.
    ...(degraded().length > 0
      ? [
          `!!! THIS SNAPSHOT IS INCOMPLETE — ${degraded().length} READ(S) FAILED !!!`,
          `The sheets below are missing rows or are empty because the data could`,
          `not be read, NOT because the school has no such records. Do not report`,
          `an absence, a zero, or a total from them. Full detail in _HEALTH.`,
          ...degraded().map((entry) => `  * ${entry.sheet} (${entry.source}): ${entry.reason}`),
          `A common cause is permissions: a staff role without finance:view is`,
          `refused Adjustments and Refunds by row-level security.`,
          ``,
        ]
      : [`Completeness: all ${readStatus.size} reads succeeded. See _HEALTH.`, ``]),
    `WHAT THIS FILE IS`,
    `This workbook is a point-in-time export of the live fee-management state`,
    `for Shri Veer Patta Senior Secondary School (VPPS). It is intended for`,
    `feeding into an LLM so that the model can answer questions about the`,
    `school's finances without needing live DB access. All amounts are in`,
    `Indian Rupees (₹) and are integer rupees (no paise).`,
    ``,
    `THE SCHOOL`,
    `Shri Veer Patta Senior Secondary School (VPPS) — a single-school`,
    `single-tenant deployment. Audience is office staff and accounts team.`,
    `The school year runs April → March (e.g., AY ${sessionLabel}).`,
    ``,
    `FEE PLAN FOR ${sessionLabel}`,
    `* Installments: ${policy.installmentSchedule.length} per year.`,
    ...policy.installmentSchedule.map(
      (item, idx) => `  - Installment ${idx + 1}: due ${item.dueDate}, label "${item.label}"`,
    ),
    `* Late fee: ${formatInr(policy.lateFeeFlatAmount)} flat per installment that misses its due date.`,
    `* New-student academic fee: ${formatInr(policy.newStudentAcademicFeeAmount)}`,
    `* Existing-student academic fee: ${formatInr(policy.oldStudentAcademicFeeAmount)}`,
    `* Accepted payment modes: ${policy.acceptedPaymentModes.map((mode) => mode.label).join(", ")}`,
    `* Receipt prefix: ${policy.receiptPrefix}`,
    ``,
    `CONVENTIONAL DISCOUNT POLICIES`,
    `* RTE → tuition set to ₹0.`,
    `* Staff Child → tuition reduced to 50%.`,
    `* 3rd Child Policy → tuition fixed at ₹6,000 for the eligible sibling.`,
    `* Rules: tuition-only impact; max 2 active policies per student per year;`,
    `  lowest candidate tuition wins; year-scoped and auditable; manual override`,
    `  remains separate via is_manual_override flag.`,
    ``,
    `FINANCIAL IMMUTABILITY`,
    `Payment and receipt rows are append-only. Corrections happen in the`,
    `payment_adjustments table (Adjustments sheet) with an audit trail. Never`,
    `assume a receipt has been edited in place.`,
    ``,
    `MONEY & DEFINITIONS (read this to avoid miscounting)`,
    `All amounts are integer Indian Rupees (₹), no paise. There are THREE`,
    `distinct reductions — do NOT conflate them:`,
    `  1. Tuition discount — reduces the base fee a student owes. It lowers`,
    `     "Total due", it is NOT a payment. Split into two columns because they`,
    `     are decided differently:`,
    `       "Discount (conventional)" — from a school policy (RTE, Staff Child,`,
    `          3rd Child). The policy name is in "Conventional discounts".`,
    `       "Discount (student)"      — an extra, per-student amount entered by`,
    `          the office ON TOP of any policy.`,
    `       "Discount (total)"        — the two added together. This is the one`,
    `          that reconciles: Gross before discount - Discount (total) = Total due.`,
    `     Also broken out in the Discounts sheet.`,
    `  2. Discount close-out (a receipt with mode = "discount") — an administrative`,
    `     write-off that clears a pending balance. It is NOT cash and is`,
    `     deliberately EXCLUDED from "Total paid" / collection figures. It appears`,
    `     in Payments with Mode = "discount".`,
    `  3. Late-fee waiver — waives the late fee only (never the base fee). Shown`,
    `     in Students."Late-fee waiver" and Installments."Late fee (waiver)".`,
    `"Total paid" = real cash receipts + adjustments, capped per installment. It`,
    `EXCLUDES tuition discounts and discount-mode write-offs. So`,
    `Total due - Total paid is NOT always Outstanding when a write-off exists —`,
    `trust the "Outstanding" column, which already nets everything.`,
    `A "processed" refund posts a negative reversal in the Adjustments sheet,`,
    `which reduces that student's applied/paid amount.`,
    ``,
    `TRANSPORT (read before summing transport revenue)`,
    `A student can be charged for transport in two ways, and only one of them`,
    `involves a route:`,
    `  1. Assigned to a real transport_routes row. "Transport" reads the route`,
    `     name and code.`,
    `  2. No route, but student_fee_overrides.custom_transport_fee_amount is set.`,
    `     "Transport" reads "Custom transport (₹N)" and "Transport is custom`,
    `     amount" is yes. These students WERE being charged while every screen`,
    `     said "No transport" — 3 of them in the live 2026-27 session, ₹29,500 a`,
    `     year between them.`,
    `There is also a real route literally NAMED "No Transport", seeded at ₹0 and`,
    `still selectable. It is a placeholder, not a route: the Routes sheet flags it`,
    `in "Is 'no transport' placeholder", and an override can still charge a`,
    `student who is sitting on it.`,
    `ALWAYS sum "Transport charged", never infer transport from the route name.`,
    `"Transport route (raw)" is the unprocessed stored value, kept so the two can`,
    `be compared.`,
    ``,
    `SHEET GLOSSARY`,
    `* Students          — EVERY student in the session (active, inactive, left`,
    `                      AND graduated — see the Status column) and the WHOLE`,
    `                      stored record: Student ID, SR no, name, class, route,`,
    `                      father/mother name and phone, date of birth, email,`,
    `                      address, joined/left dates, family + sibling grouping,`,
    `                      notes, audit stamps, and the full fee breakdown —`,
    `                      discount, waiver, dues, next due, status.`,
    `                      "Student ID" is the same id the bulk update template`,
    `                      uses, so this sheet round-trips back into an import.`,
    `* Installments      — per-student per-installment expected/paid/pending/late fee.`,
    `* Payments          — every receipt with mode, reference, total amount.`,
    `* Adjustments       — append-only corrections/reversals (refunds, write-offs,`,
    `                      corrections) with signed amount_delta and reason.`,
    `* Refunds           — refund requests with status (pending/approved/processed).`,
    `* Classes           — class master with sort order and session label.`,
    `* Routes            — transport route master with codes.`,
    `* Discounts         — conventional discount policies + every active assignment.`,
    `* Defaulters        — outstanding follow-up list (students with pending > 0).`,
    `* Recovery Follow-Up — active defaulter contact state, promise/no-call data,`,
    `                      and best-call hints used by the Defaulters workspace.`,
    `* Previous Year Dues — carry-forward balance collection and recovery state.`,
    `* Left Student Recovery — collectable dues from left/graduated/inactive students.`,
    `* Fee Overrides     — every per-student departure from the class fee plan:`,
    `                      custom tuition / transport / books / misc / late fee,`,
    `                      other adjustment head and amount, student-type and`,
    `                      transport-applies overrides, with the reason and notes.`,
    `                      This is the baseline-vs-exception pair with Class Fee`,
    `                      Settings.`,
    `* Class Fee Settings — what each class is charged per head before any`,
    `                      override: tuition, transport, books, admission/activity`,
    `                      /misc, other heads, late fee, installment count.`,
    `* Payment Allocations — receipt → installment → rupees. The Payments sheet is`,
    `                      receipt-level; this is where a single ₹8,000 receipt`,
    `                      splits across the installments it actually cleared,`,
    `                      with pending-before and pending-after on each line.`,
    `* Late Fee Waivers  — one row per waived installment, with source. READ THE`,
    `                      SOURCE COLUMN: most rows are automatic ('grandfather'`,
    `                      or 'migration', written when the late-fee rule was`,
    `                      unified) and represent nobody's decision. Only`,
    `                      'manual' and 'payment_desk' were granted by a person —`,
    `                      "Granted by a person" says so directly. Counting all`,
    `                      of them as forgiveness overstates it by hundreds.`,
    `* Siblings          — the family groups the office linked, which drive the`,
    `                      3rd Child policy. A family exists only when staff link`,
    `                      it; the app no longer guesses one from a shared phone`,
    `                      number, so every row here was confirmed by a person.`,
    `* Student Segments  — one yes/no column per filter chip in the app (never`,
    `                      paid, year clear, old balance due, overdue, on`,
    `                      transport, RTE, …), generated from the same definition`,
    `                      list the UI uses. The three payment buckets — Never`,
    `                      paid, Partly paid, Year clear — partition the roll;`,
    `                      Overdue is a TIMING flag and overlaps all three.`,
    `* Sessions          — session metadata (current, fee plan summary).`,
    ``,
    `STUDENT INFORMATION COLUMNS (on the Students sheet)`,
    `The last ${STUDENT_INFO_FIELDS.length} columns of the Students sheet are the school's own record of`,
    `the child, all optional and often blank: ${STUDENT_INFO_FIELDS.map((field) => field.header).join(", ")}.`,
    `A blank means "not collected yet", never "none" — an office fills these in`,
    `over months, so do not read an empty Category or Aadhaar as a fact about`,
    `the student. "Guardian phone" here is the student's own guardian record and`,
    `is a DIFFERENT column from the Siblings sheet's guardian, which belongs to`,
    `the family group.`,
    ``,
    `THE TWO KINDS OF MONEY`,
    `Fees and late fees are separate charges and are never added together into a`,
    `single "pending" figure. On the Students sheet: "Fees pending" decides`,
    `whether a family is overdue or a defaulter, "Late fee pending (fee engine)"`,
    `is the late fee still owed after waivers, and "Outstanding" is the two`,
    `added — what a cashier can actually collect. A family whose only debt is a`,
    `late fee is NOT a defaulter and will not appear on the Defaulters or`,
    `Recovery Follow-Up sheets, though their late fee is shown on Students.`,
    `"Late fee pending (student list)" is the same quantity as read by the`,
    `student-list projection rather than the fee engine; they should agree.`,
    ``,
    `HOW TO INTERPRET THIS WORKBOOK`,
    `Join every sheet by "SR no" (admission number) — it is the stable student`,
    `key and appears on Students, Installments, Payments, Adjustments, Refunds,`,
    `and Defaulters. The Students sheet is complete (all statuses), so any SR no`,
    `you see elsewhere will resolve there. Defaulters is just a filtered view`,
    `(outstanding > 0). Treat all amounts as canonical only as of the snapshot`,
    `time above; live state may have moved since.`,
    ``,
    `Counts in this snapshot:`,
    `  Students (all statuses): ${financials.length}  (active: ${activeCount})`,
    `  Installments rows:       ${installments.length}`,
    `  Payments:                ${transactions.length}`,
    `  Adjustments:             ${countOf("payment_adjustments", adjustments)}`,
    `  Refunds:                 ${countOf("refund_requests", refunds)}`,
    `  Classes:                 ${masterData.classOptions.length}`,
    `  Routes:                  ${masterData.routeOptions.length}`,
    `  Discount policies:       ${discountPolicies.length}`,
    `  Discount assignments:    ${discountAssignments.length}`,
    // Fees only, and every status. A late fee never makes a defaulter (hard
    // rule 8), and a student who left owing still owes — so this counts the
    // same population the Defaulters sheet lists, said out loud rather than
    // left for the reader to infer from the sheet's filter.
    `  Defaulters (fees pending > 0, all statuses): ${
      financials.filter((row) => row.outstandingAmount > 0).length
    }  (active: ${
      financials.filter((row) => row.recordStatus === "active" && row.outstandingAmount > 0).length
    })`,
    `  Recovery contact rows:   ${contactSummaries.size}`,
    `  Previous-year dues rows: ${previousYearDues.length}`,
    `  Left-student recovery:   ${leftStudentRecovery.rows.length}`,
    `  Fee overrides:           ${countOf("student_fee_overrides", feeOverrideResult.data ?? [])}`,
    `  Payment allocations:     ${countOf("payments (allocations)", allocationRowsChecked)}`,
    `  Late-fee waivers:        ${countOf("student_late_fee_waivers", waiverRowsChecked)}`,
    `  Class fee settings:      ${countOf("fee_settings", feeSettingRowsChecked)}`,
    `  Custom-transport students: ${
      financials.filter(
        (row) => feeOverrideByStudent.get(row.studentId)?.custom_transport_fee_amount != null,
      ).length
    }`,
  ];

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(readmeLines.map((line) => [line])),
    "_README",
  );

  // Machine-readable completeness, next to the prose version in _README. A
  // model that reads only the data sheets has no other way to tell "no rows
  // exist" apart from "the rows could not be read", and the two lead to
  // opposite answers.
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      [...readStatus.values()].map((entry) => ({
        "Sheet": entry.sheet,
        "Source": entry.source,
        "Read succeeded": entry.ok ? "yes" : "NO",
        "Rows returned": entry.rows,
        "Rows are complete": entry.ok ? "yes" : "NO — partial or empty",
        "Failure reason": entry.reason,
      })),
    ),
    "_HEALTH",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      financials.map((row) => {
        const detail = studentDetailById.get(row.studentId);
        const family = familyByStudentId.get(row.studentId);
        const familyGroup = firstOf(family?.family_ref);
        const override = feeOverrideByStudent.get(row.studentId);
        const facets = directoryByStudent.get(row.studentId);
        // The same helper every screen uses, so a student on a custom amount
        // reads "Custom transport (Rs 14,000)" here too instead of a blank cell
        // or the "No Transport" placeholder route.
        const transportLabel = buildTransportRouteLabel({
          routeName: row.transportRouteName,
          routeCode: row.transportRouteCode,
          customTransportFeeAmount: override?.custom_transport_fee_amount ?? null,
          transportFeeAmount: row.transportFee,
        });
        return withStudentInfoColumns({
        "Student ID": row.studentId,
        "SR no": row.admissionNo,
        "Student": row.studentName,
        "Class": row.classLabel,
        "Status": row.recordStatus,
        "Student type": row.studentStatusLabel,
        "Transport": transportLabel,
        "Transport charged": row.transportFee,
        "Transport route (raw)": row.transportRouteName ?? "",
        "Transport is custom amount": override?.custom_transport_fee_amount != null ? "yes" : "no",
        "Father name": row.fatherName ?? "",
        "Mother name": row.motherName ?? "",
        "Father phone": row.fatherPhone ?? "",
        "Mother phone": row.motherPhone ?? "",
        "Date of birth": row.dateOfBirth ?? "",
        "Email": detail?.email ?? "",
        "Address": detail?.address ?? "",
        "Joined on": detail?.joined_on ?? "",
        "Left on": detail?.left_on ?? "",
        "Family group": familyGroup?.family_label ?? "",
        "Guardian name": familyGroup?.guardian_name ?? "",
        "Guardian phone": familyGroup?.guardian_phone ?? "",
        "Sibling order": family?.sibling_order ?? "",
        "Sibling policy candidate": family ? (family.is_policy_candidate ? "yes" : "no") : "",
        "Sibling order overridden": family ? (family.manual_order_override ? "yes" : "no") : "",
        "Tuition fee": row.tuitionFee,
        "Transport fee": row.transportFee,
        "Academic fee": row.academicFee,
        "Other adjustment head": row.otherAdjustmentHead ?? "",
        "Other adjustment amount": row.otherAdjustmentAmount,
        // Split, because "Discount (tuition)" used to read 0 for every student
        // on an RTE / Staff Child / 3rd Child policy — the view could not see
        // conventional discounts at all. The total is what reconciles:
        // "Gross before discount" - "Discount (total)" = "Total due".
        "Discount (conventional)": row.conventionalDiscountAmount,
        "Discount (student)": row.studentDiscountAmount,
        "Discount (total)": row.discountAmount,
        "Gross before discount": row.grossBaseBeforeDiscount,
        "Late-fee waiver (annual)": row.lateFeeWaiverAmount,
        "Late fee charged (total)": row.lateFeeTotal,
        "Total due": row.baseChargeTotal,
        "Total paid": row.totalPaid,
        "Discount close-out (not cash)": row.discountClosedAmount,
        // "Outstanding" keeps meaning what it always meant in this workbook --
        // everything the family still owes -- so old spreadsheets that total
        // this column stay correct. The two lines under it are the split.
        "Outstanding": row.totalOwedAmount,
        "Fees pending": row.outstandingAmount,
        // Two columns, two sources, and until now they were called "Late fee
        // pending (student)" and "Late fee pending" — indistinguishable in a
        // spreadsheet. Named by where the number comes from instead.
        "Late fee pending (fee engine)": row.lateFeeOutstandingAmount,
        "Old balance (carry forward)": Number(facets?.old_balance_amount ?? 0),
        "Overdue amount": Number(facets?.overdue_base_amount ?? 0),
        "Late fee pending (student list)": Number(facets?.pending_late_fee_amount ?? 0),
        "Installment 1 pending": row.inst1Pending,
        "Installment 2 pending": row.inst2Pending,
        "Installment 3 pending": row.inst3Pending,
        "Installment 4 pending": row.inst4Pending,
        "Installments paid": row.paidInstallmentCount,
        "Installments partly paid": row.partlyPaidInstallmentCount,
        "Installments overdue": row.overdueInstallmentCount,
        "Conventional discounts": (discountLabelsByStudent.get(row.studentId) ?? []).join(", "),
        "Next due label": row.nextDueLabel ?? "",
        "Next due date": row.nextDueDate ?? "",
        "Next due amount": row.nextDueAmount ?? 0,
        "Last payment date": row.lastPaymentDate ?? "",
        "Status label": row.statusLabel,
        // Fee-profile exceptions, flattened onto the student row so a reader
        // does not have to cross-reference the Fee Overrides sheet to see that
        // this student is not on the class default.
        "Has fee override": override ? "yes" : "no",
        "Custom tuition amount": override?.custom_tuition_fee_amount ?? "",
        "Custom transport amount": override?.custom_transport_fee_amount ?? "",
        "Custom books amount": override?.custom_books_fee_amount ?? "",
        "Custom admission/activity/misc amount":
          override?.custom_admission_activity_misc_fee_amount ?? "",
        "Custom late fee amount": override?.custom_late_fee_flat_amount ?? "",
        "Fee override reason": override?.reason ?? row.overrideReason ?? "",
        "Fee override notes": override?.notes ?? "",
        "Student notes": detail?.notes ?? "",
        "Sibling notes": family?.notes ?? "",
        "Has photo": detail?.photo_path ? "yes" : "no",
        "Record created at": detail?.created_at ?? "",
        "Record updated at": detail?.updated_at ?? "",
        }, masterFieldsById.get(row.studentId));
      }),
    ),
    "Students",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      installments.map((row) => ({
        "SR no": row.admissionNo,
        "Student": row.studentName,
        "Class": row.classLabel,
        "Installment no": row.installmentNo,
        "Installment label": getDisplayInstallmentLabel(row),
        "Due date": row.dueDate,
        "Base charge": row.baseCharge,
        "Paid": row.paidAmount,
        "Adjustment": row.adjustmentAmount,
        "Late fee (raw)": row.rawLateFee,
        "Late fee (waiver)": row.waiverApplied,
        "Late fee (final)": row.finalLateFee,
        "Total charge": row.totalCharge,
        "Pending": row.totalPending,
        "Fees pending": row.pendingAmount,
        "Late fee pending": row.lateFeePending,
        "Status": row.balanceStatus,
        "Late fee status": row.lateFeeStatus,
        "Last payment date": row.lastPaymentDate ?? "",
      })),
    ),
    "Installments",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      transactions.map((row) => ({
        "Date": row.paymentDate,
        "Receipt number": row.receiptNumber,
        "SR no": row.admissionNo,
        "Student": row.studentName,
        "Class": row.classLabel,
        "Mode": row.paymentMode,
        "Reference": row.referenceNumber ?? "",
        "Amount": row.totalAmount,
        "Discount applied": row.discountApplied,
        "Late fee waived": row.lateFeeWaived,
        "Outstanding (post)": row.currentOutstanding,
        "Total paid (post)": row.currentTotalPaid,
        // The source row has carried this all along; the sheet dropped it, so an
        // AI bundle handed a reader a reversed receipt indistinguishable from a
        // real one and a SUM over Amount that over-counted.
        "Status": row.isReversed ? "REVERSED" : "",
      })),
    ),
    "Payments",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      adjustments.length > 0
        ? adjustments.map((row) => {
            const student = studentIndex.get(row.student_id);
            const installment = row.installment_id
              ? installmentLabelById.get(row.installment_id)
              : null;
            const payment = firstOf(row.payment_ref);
            const receipt = payment ? firstOf(payment.receipt_ref) : null;
            return {
              "Date": row.created_at.slice(0, 10),
              "SR no": student?.admissionNo ?? "",
              "Student": student?.studentName ?? "",
              "Class": student?.classLabel ?? "",
              "Receipt number": receipt?.receipt_number ?? "",
              "Installment": installment ?? "",
              "Adjustment type": row.adjustment_type,
              "Amount delta (₹, signed)": row.amount_delta,
              "Reason": row.reason,
              "Notes": row.notes ?? "",
            };
          })
        : [
            {
              "Date": "",
              "SR no": "",
              "Student": "",
              "Class": "",
              "Receipt number": "",
              "Installment": "",
              "Adjustment type": "",
              "Amount delta (₹, signed)": "",
              "Reason": "No adjustments in this session (or insufficient permission to read them).",
              "Notes": "",
            },
          ],
    ),
    "Adjustments",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      refunds.length > 0
        ? refunds.map((row) => {
            const student = studentIndex.get(row.student_id);
            const receipt = firstOf(row.receipt_ref);
            return {
              "Refund date": row.refund_date,
              "SR no": student?.admissionNo ?? "",
              "Student": student?.studentName ?? "",
              "Class": student?.classLabel ?? "",
              "Receipt number": receipt?.receipt_number ?? "",
              "Requested amount": row.requested_amount,
              "Method": row.refund_method,
              "Reference": row.refund_reference ?? "",
              "Status": row.status,
              "Reason": row.reason,
              "Requested at": row.created_at,
              "Approved at": row.approved_at ?? "",
              "Processed at": row.processed_at ?? "",
            };
          })
        : [
            {
              "Refund date": "",
              "SR no": "",
              "Student": "",
              "Class": "",
              "Receipt number": "",
              "Requested amount": "",
              "Method": "",
              "Reference": "",
              "Status": "",
              "Reason": "No refund requests in this session (or insufficient permission to read them).",
              "Requested at": "",
              "Approved at": "",
              "Processed at": "",
            },
          ],
    ),
    "Refunds",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      masterData.classOptions.map((row) => ({
        "Class label": row.label,
        "Session": row.sessionLabel,
        "Class id": row.id,
      })),
    ),
    "Classes",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      masterData.routeOptions.map((row) => ({
        "Route name": row.label,
        "Route code": row.routeCode ?? "",
        "Is 'no transport' placeholder": isSentinelNoTransportRoute(row.label) ? "yes" : "no",
        "Active": row.isActive ? "yes" : "no",
        "Route id": row.id,
      })),
    ),
    "Routes",
  );

  // ── Fee Overrides ────────────────────────────────────────────────────────
  // Every per-student departure from the class fee plan, with the reason. This
  // is where a custom transport amount stops being invisible.
  const feeOverrideRows = ((feeOverrideResult.data ?? []) as FeeOverrideRow[])
    .map((override) => {
      const student = studentIndex.get(override.student_id);
      const otherHeads = override.custom_other_fee_heads ?? {};
      const otherLabels = override.custom_other_fee_head_labels ?? {};
      return {
        "SR no": student?.admissionNo ?? "",
        "Student": student?.studentName ?? "",
        "Class": student?.classLabel ?? "",
        "Custom tuition": override.custom_tuition_fee_amount ?? "",
        "Custom transport": override.custom_transport_fee_amount ?? "",
        "Custom books": override.custom_books_fee_amount ?? "",
        "Custom admission/activity/misc": override.custom_admission_activity_misc_fee_amount ?? "",
        "Custom late fee": override.custom_late_fee_flat_amount ?? "",
        "Custom other heads": Object.entries(otherHeads)
          .map(([key, amount]) => `${otherLabels[key] ?? key}: ${amount}`)
          .join("; "),
        "Student discount": override.discount_amount ?? 0,
        "Other adjustment head": override.other_adjustment_head ?? "",
        "Other adjustment amount": override.other_adjustment_amount ?? "",
        "Student type override": override.student_type_override ?? "",
        "Transport applies override":
          override.transport_applies_override === null ||
          override.transport_applies_override === undefined
            ? ""
            : override.transport_applies_override
              ? "yes"
              : "no",
        "Reason": override.reason ?? "",
        "Notes": override.notes ?? "",
        "Updated at": override.updated_at ?? "",
      };
    })
    .sort((left, right) => String(left["SR no"]).localeCompare(String(right["SR no"])));

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      feeOverrideRows.length > 0
        ? feeOverrideRows
        : [{ "SR no": "", Reason: "No active fee overrides in this session." }],
    ),
    "Fee Overrides",
  );

  // ── EMI Plans / EMI Schedule ─────────────────────────────────────────────
  // A family on a repayment plan owes the same rupees on a different calendar.
  // Without these two sheets any analysis of "who is overdue" reads them as
  // months late when the school agreed to exactly that.
  const [emiPlanRows, emiScheduleRows] = await Promise.all([
    getRepaymentPlanExportRows(sessionLabel).catch(() => []),
    getRepaymentScheduleExportRows(sessionLabel, todayIsoIst()).catch(() => []),
  ]);

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      emiPlanRows.length > 0
        ? emiPlanRows
        : [{ "SR no": "", Reason: "No EMI repayment plans in this session." }],
    ),
    "EMI Plans",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      emiScheduleRows.length > 0
        ? emiScheduleRows
        : [{ "SR no": "", Reason: "No EMI schedule rows in this session." }],
    ),
    "EMI Schedule",
  );

  // ── Payment Allocations ──────────────────────────────────────────────────
  // Receipt -> installment -> rupees, which is what "how much was paid" means
  // once a single receipt clears parts of three installments.
  type AllocationReceiptRef = {
    id: string;
    receipt_number: string;
    total_amount: number | null;
    payment_date: string;
    payment_mode: string;
    received_by: string | null;
  };

  type AllocationRow = {
    student_id: string;
    amount: number;
    notes: string | null;
    created_at: string;
    discount_applied_at_posting: number | null;
    waiver_applied_at_posting: number | null;
    pending_before_posting: number | null;
    pending_after_posting: number | null;
    receipt_ref:
      | AllocationReceiptRef
      | AllocationReceiptRef[]
      | null;
    installment_ref:
      | { installment_no: number; installment_label: string; due_date: string }
      | { installment_no: number; installment_label: string; due_date: string }[]
      | null;
  };

  const typedAllocationRows = allocationRowsChecked as AllocationRow[];
  const allocationReversalTotals = await getReceiptReversalTotals(
    typedAllocationRows
      .map((row) => firstOf(row.receipt_ref)?.id)
      .filter((id): id is string => Boolean(id)),
    supabase,
  );

  const allocationRows = typedAllocationRows.map((row) => {
    const student = studentIndex.get(row.student_id);
    const receipt = firstOf(row.receipt_ref);
    const installment = firstOf(row.installment_ref);
    return {
      "Date": receipt?.payment_date ?? row.created_at.slice(0, 10),
      "Receipt number": receipt?.receipt_number ?? "",
      "Mode": receipt?.payment_mode ?? "",
      "SR no": student?.admissionNo ?? "",
      "Student": student?.studentName ?? "",
      "Class": student?.classLabel ?? "",
      "Installment no": installment?.installment_no ?? "",
      "Installment": installment
        ? getDisplayInstallmentLabel({ installmentLabel: installment.installment_label })
        : "",
      "Installment due date": installment?.due_date ?? "",
      "Amount applied": row.amount,
      "Discount at posting": row.discount_applied_at_posting ?? 0,
      "Late-fee waiver at posting": row.waiver_applied_at_posting ?? 0,
      "Pending before": row.pending_before_posting ?? "",
      "Pending after": row.pending_after_posting ?? "",
      "Received by": receipt?.received_by ?? "",
      "Notes": row.notes ?? "",
      "Receipt status": receipt && isReceiptReversed(
        allocationReversalTotals,
        receipt.id,
        receipt.total_amount ?? 0,
      )
        ? "REVERSED"
        : "",
    };
  });

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      allocationRows.length > 0
        ? allocationRows
        : [{ "Date": "", Notes: "No payment allocations in this session." }],
    ),
    "Payment Allocations",
  );

  // ── Late Fee Waivers ─────────────────────────────────────────────────────
  // `source` matters: most rows here are automatic (grandfather / migration)
  // rather than a decision anyone made. Only 'manual' and 'payment_desk' are.
  type WaiverRow = {
    student_id: string;
    installment_id: string;
    amount: number;
    reason: string;
    source: string;
    waived_by_label: string | null;
    waived_at: string;
    voided_at: string | null;
    void_reason: string | null;
    installment_ref:
      | { installment_no: number; installment_label: string; due_date: string }
      | { installment_no: number; installment_label: string; due_date: string }[]
      | null;
  };

  const waiverRows = (waiverRowsChecked as WaiverRow[]).map((row) => {
    const student = studentIndex.get(row.student_id);
    const installment = firstOf(row.installment_ref);
    return {
      "SR no": student?.admissionNo ?? "",
      "Student": student?.studentName ?? "",
      "Class": student?.classLabel ?? "",
      "Installment no": installment?.installment_no ?? "",
      "Installment": installment
        ? getDisplayInstallmentLabel({ installmentLabel: installment.installment_label })
        : "",
      "Due date": installment?.due_date ?? "",
      "Waived amount": row.amount,
      "Source": row.source,
      "Granted by a person": row.source === "manual" || row.source === "payment_desk" ? "yes" : "no",
      "Reason": row.reason,
      "Waived by": row.waived_by_label ?? "",
      "Waived at": row.waived_at,
      "Voided at": row.voided_at ?? "",
      "Void reason": row.void_reason ?? "",
    };
  });

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      waiverRows.length > 0
        ? waiverRows
        : [{ "SR no": "", Reason: "No late-fee waivers in this session." }],
    ),
    "Late Fee Waivers",
  );

  // ── Class Fee Settings ───────────────────────────────────────────────────
  // What each class is charged by head, which is the baseline every Fee
  // Overrides row is a departure from.
  type FeeSettingRow = {
    class_id: string;
    annual_base_amount: number;
    tuition_fee_amount: number;
    transport_fee_amount: number;
    books_fee_amount: number;
    admission_activity_misc_fee_amount: number;
    other_fee_heads: Record<string, number> | null;
    late_fee_flat_amount: number;
    installment_count: number;
    student_type_default: string;
    transport_applies_default: boolean;
    notes: string | null;
    class_ref:
      | { class_name: string; section: string | null; stream_name: string | null }
      | { class_name: string; section: string | null; stream_name: string | null }[]
      | null;
  };

  const feeSettingRows = (feeSettingRowsChecked as FeeSettingRow[]).map((row) => {
    const classRef = firstOf(row.class_ref);
    return {
      "Class": [classRef?.class_name, classRef?.section, classRef?.stream_name]
        .filter(Boolean)
        .join(" - "),
      "Tuition": row.tuition_fee_amount,
      "Transport (default)": row.transport_fee_amount,
      "Books": row.books_fee_amount,
      "Admission/activity/misc": row.admission_activity_misc_fee_amount,
      "Other heads": Object.entries(row.other_fee_heads ?? {})
        .map(([key, amount]) => `${key}: ${amount}`)
        .join("; "),
      "Annual base": row.annual_base_amount,
      "Late fee (flat)": row.late_fee_flat_amount,
      "Installments": row.installment_count,
      "Student type default": row.student_type_default,
      "Transport applies by default": row.transport_applies_default ? "yes" : "no",
      "Notes": row.notes ?? "",
      "Class id": row.class_id,
    };
  });

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      feeSettingRows.length > 0
        ? feeSettingRows
        : [{ Class: "", Notes: "No active fee settings for this session." }],
    ),
    "Class Fee Settings",
  );

  // ── Siblings ─────────────────────────────────────────────────────────────
  // Confirmed family groups only — the ones the office linked, which are what
  // the 3rd Child policy runs on. The old phone-match "detected group" rows are
  // gone: a shared guardian phone is not a family, and shipping both senses in
  // one sheet under a "Confidence" column was the confusion this removed.
  const siblingRows: Array<Record<string, string | number>> = [];
  for (const [studentId, family] of familyByStudentId) {
    const student = studentIndex.get(studentId);
    const group = firstOf(family.family_ref);
    siblingRows.push({
      "Group": group?.family_label ?? "",
      "SR no": student?.admissionNo ?? "",
      "Student": student?.studentName ?? "",
      "Class": student?.classLabel ?? "",
      "Guardian name": group?.guardian_name ?? "",
      "Guardian phone": group?.guardian_phone ?? "",
      "Sibling order": family.sibling_order ?? "",
      "Policy candidate": family.is_policy_candidate ? "yes" : "no",
      "Order overridden": family.manual_order_override ? "yes" : "no",
      "Notes": family.notes ?? "",
    });
  }

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      siblingRows.length > 0
        ? siblingRows
        : [{ Group: "", Notes: "No family groups linked for this session." }],
    ),
    "Siblings",
  );

  // ── Student Segments ─────────────────────────────────────────────────────
  // The same booleans the Students and Transactions filter chips run on, one
  // column per segment, generated from the shared definition list so this sheet
  // cannot drift from what the UI offers.
  const segmentHeader = (id: string) => {
    const spaced = id.replace(/([A-Z])/g, " $1").toLowerCase().trim();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  };

  const segmentRows = financials.map((row) => {
    const facets = directoryByStudent.get(row.studentId);
    const record: Record<string, string | number> = {
      "SR no": row.admissionNo,
      "Student": row.studentName,
      "Class": row.classLabel,
      "Status": row.recordStatus,
    };
    for (const segment of STUDENT_SEGMENTS) {
      record[segmentHeader(segment.id)] = facets?.[segment.column] ? "yes" : "no";
    }
    return record;
  });

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(segmentRows), "Student Segments");

  const discountRows: Array<Record<string, string | number>> = [];
  discountPolicies.forEach((policyRow) => {
    discountRows.push({
      "Section": "Policy",
      "Code": policyRow.code,
      "Display name": policyRow.displayName,
      "Calculation": policyRow.calculationType,
      "Fixed tuition": policyRow.fixedTuitionAmount ?? "",
      "Percentage": policyRow.percentage ?? "",
      "Active": policyRow.isActive ? "yes" : "no",
      "SR no": "",
      "Student": "",
      "Family group": "",
      "Manual override": "",
      "Reason": "",
    });
  });
  discountAssignments.forEach((assignment) => {
    const student = studentIndex.get(assignment.studentId);
    discountRows.push({
      "Section": "Assignment",
      "Code": assignment.policy.code,
      "Display name": assignment.policy.displayName,
      "Calculation": assignment.policy.calculationType,
      "Fixed tuition": assignment.resultingTuitionAmount,
      "Percentage": "",
      "Active": assignment.isActive ? "yes" : "no",
      "SR no": student?.admissionNo ?? "",
      "Student": student?.studentName ?? "",
      "Family group": assignment.familyGroupLabel ?? "",
      "Manual override": assignment.isManualOverride ? "yes" : "no",
      "Reason": assignment.reason ?? "",
    });
  });
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(discountRows), "Discounts");

  // The filter stays on fees: a late fee never makes a student a defaulter
  // (hard rule 8), so a late-fee-only family belongs on the Students sheet and
  // not here. What was wrong was the money — "Outstanding" is fees-only since
  // 20260812120000, so this sheet showed a family's late fee nowhere at all.
  const defaulterRows = financials
    .filter((row) => row.outstandingAmount > 0)
    .sort((a, b) => b.totalOwedAmount - a.totalOwedAmount)
    .map((row) => ({
      "SR no": row.admissionNo,
      "Student": row.studentName,
      "Class": row.classLabel,
      "Phone": row.fatherPhone ?? "",
      "Total due": row.baseChargeTotal,
      "Total paid": row.totalPaid,
      "Fees pending": row.outstandingAmount,
      "Late fee pending": row.lateFeeOutstandingAmount,
      "Total owed": row.totalOwedAmount,
      "Next due label": row.nextDueLabel ?? "",
      "Next due date": row.nextDueDate ?? "",
      "Next due amount": row.nextDueAmount ?? 0,
      "Status": row.statusLabel,
    }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(defaulterRows), "Defaulters");

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      financials
        .filter((row) => row.recordStatus === "active" && row.outstandingAmount > 0)
        .sort((a, b) => b.totalOwedAmount - a.totalOwedAmount)
        .map((row) => {
          const summary = contactSummaries.get(row.studentId);
          const noCall = noCallFlags.get(row.studentId);
          const reliability = promiseReliability.get(row.studentId);
          const master = masterFieldsById.get(row.studentId);
          return {
            "SR no": row.admissionNo,
            "Student": row.studentName,
            "Class": row.classLabel,
            "Father phone": row.fatherPhone ?? "",
            "Mother phone": row.motherPhone ?? "",
            // The two numbers a caller actually needs, kept apart. Asking a
            // family for "total owed" when the late fee is waivable is a
            // different conversation from asking for the fees.
            "Fees pending": row.outstandingAmount,
            "Late fee pending": row.lateFeeOutstandingAmount,
            "Total owed": row.totalOwedAmount,
            // Follow-up numbers the recovery desk had to look up per student.
            "Guardian phone (student record)": master?.guardianPhone ?? "",
            "Emergency phone": master?.emergencyContactPhone ?? "",
            "Village / city": master?.villageCity ?? "",
            "District": master?.district ?? "",
            "Overdue installments": row.overdueInstallmentCount,
            "Next due label": row.nextDueLabel ?? "",
            "Next due date": row.nextDueDate ?? "",
            "Next due amount": row.nextDueAmount ?? 0,
            "Last contacted at": summary?.lastContactedAt ?? "",
            "Last outcome": summary?.lastOutcome ?? "",
            "Last channel": summary?.lastChannel ?? "",
            "Promise / snooze date": summary?.snoozeUntil ?? "",
            "No-answer streak": summary?.noAnswerStreak ?? 0,
            "Total contact attempts": summary?.totalAttempts ?? 0,
            "Suggested phone label": summary?.suggestedPhoneLabel ?? "",
            "Best call window": summary?.bestCallWindow ?? "",
            "No-call flag": noCall?.noCall ? "yes" : "no",
            "No-call reason": noCall?.reason ?? "",
            "Promise kept count": reliability?.promiseKeptCount ?? 0,
            "Promise broken count": reliability?.promiseBrokenCount ?? 0,
            "Promise kept rate": reliability?.promiseKeptRate ?? "",
          };
        }),
    ),
    "Recovery Follow-Up",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      previousYearDues.map((row) => ({
        "SR no": row.admissionNo ?? "",
        "Student": row.studentName,
        "Class": row.classLabel,
        "Student status": row.studentStatus ?? "",
        "Phone": row.fatherPhone ?? "",
        "Balance label": row.displayLabel,
        "Source session": row.sourceSessionLabel ?? "",
        "Target session": row.targetSessionLabel ?? "",
        "Opening old balance": row.oldBalance,
        "Collected from old balance": row.collected,
        "Old balance remaining": row.remaining,
        "Recovery state": row.status,
      })),
    ),
    "Previous Year Dues",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      leftStudentRecovery.rows.map((row) => ({
        "SR no": row.admissionNo,
        "Student": row.fullName,
        "Father": row.fatherName ?? "",
        "Phone": row.phone ?? "",
        "Status": row.status,
        "Class": row.classLabel ?? "",
        "Source session": row.sourceSessionLabel ?? "",
        "Carry-forward": row.hasCarryForward ? "yes" : "no",
        "Collectable": row.collectable ? "yes" : "no",
        "Total remaining": row.totalRemaining,
        "Last payment": row.lastPaymentDate ?? "",
        "Due count": row.dues.length,
        "Due details": row.dues
          .map((due) => {
            const source = due.sourceSessionLabel ?? due.sessionLabel ?? "unknown session";
            return `${due.installmentLabel} / ${source} / ${due.remainingAmount}`;
          })
          .join("; "),
      })),
    ),
    "Left Student Recovery",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        "Session label": policy.academicSessionLabel,
        "Installments": policy.installmentSchedule.length,
        "Late fee (₹)": policy.lateFeeFlatAmount,
        "New academic fee (₹)": policy.newStudentAcademicFeeAmount,
        "Old academic fee (₹)": policy.oldStudentAcademicFeeAmount,
        "Receipt prefix": policy.receiptPrefix,
        "Accepted payment modes": policy.acceptedPaymentModes.map((mode) => mode.label).join(", "),
        "Snapshot at": generatedAt,
      },
    ]),
    "Sessions",
  );

  const data = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

const DEFAULTER_FILTER_PARAMS = [
  "classId",
  "transportRouteId",
  "overdue",
  "prevYearDues",
  "minPendingAmount",
  "query",
] as const;

function hasDefaulterFilterParams(request: NextRequest): boolean {
  return DEFAULTER_FILTER_PARAMS.some((name) =>
    (request.nextUrl.searchParams.get(name) ?? "").trim().length > 0,
  );
}

function parseDefaulterFiltersFromQuery(request: NextRequest): DefaulterFilters {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const get = (key: string) => (request.nextUrl.searchParams.get(key) ?? "").trim();

  const rawClassId = get("classId");
  const rawRouteId = get("transportRouteId");
  const rawOverdue = get("overdue");
  const rawPrevYearDues = get("prevYearDues");
  const rawMinPending = get("minPendingAmount");
  const rawQuery = get("query");

  return {
    classId: uuidPattern.test(rawClassId) ? rawClassId : EMPTY_DEFAULTER_FILTERS.classId,
    transportRouteId: uuidPattern.test(rawRouteId)
      ? rawRouteId
      : EMPTY_DEFAULTER_FILTERS.transportRouteId,
    overdue: rawOverdue === "overdue" ? "overdue" : EMPTY_DEFAULTER_FILTERS.overdue,
    prevYearDues:
      rawPrevYearDues === "prevYear" ? "prevYear" : EMPTY_DEFAULTER_FILTERS.prevYearDues,
    minPendingAmount: /^\d+$/.test(rawMinPending)
      ? rawMinPending
      : EMPTY_DEFAULTER_FILTERS.minPendingAmount,
    searchQuery: rawQuery.slice(0, 80) || EMPTY_DEFAULTER_FILTERS.searchQuery,
  };
}

/**
 * Wraps every export response with the download-echo cookie, so the client's
 * spinner knows when the file actually started arriving. This route has a
 * dozen return paths; wrapping once here beats touching each of them.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  return withDownloadToken(request, await handleExport(request, context));
}

async function handleExport(request: NextRequest, context: RouteContext) {
  const staff = await getAuthenticatedStaff();
  if (!staff) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!hasStaffPermission(staff, "reports:view")) {
    return new Response("Forbidden", { status: 403 });
  }

  const { exportType } = await context.params;

  /*
   * Exports that carry Aadhaar and Jan Aadhaar need to read the student record,
   * not just reports.
   *
   * Worth knowing: today this refuses nobody. `reports:view` is a strict subset
   * of `students:view` — admin, accountant, teacher and fee_collector hold
   * both, and view_only holds students:view but not reports:view, so it is
   * already turned away above. This is here so the gate stays correct if the
   * role matrix moves, and because the doc comment on `student-master` already
   * claimed it. Restricting bulk Aadhaar downloads to admin/accountant would be
   * a different, narrower check.
   */
  const AADHAAR_BEARING_EXPORTS = new Set(["student-master", "ai-context-bundle"]);

  if (
    AADHAAR_BEARING_EXPORTS.has(exportType) &&
    !hasStaffPermission(staff, "students:view")
  ) {
    return new Response("Forbidden", { status: 403 });
  }
  const requestedSessionLabel = (request.nextUrl.searchParams.get("session") ?? "").trim();
  // The export follows the filter. Downloading "all students" while the
  // Students page is filtered to "Never paid" and getting all 509 back is the
  // same class of surprise as the filter not applying at all.
  const exportSegments = parseSegments(request.nextUrl.searchParams.get("seg"));
  const exportClassId = (request.nextUrl.searchParams.get("classId") ?? "").trim();
  const exportStatus = (request.nextUrl.searchParams.get("status") ?? "active").trim();
  const requestedFormat = (request.nextUrl.searchParams.get("format") ?? "").trim().toLowerCase();
  const format: "xlsx" | "pdf" = requestedFormat === "pdf" ? "pdf" : "xlsx";
  const { resolvedSessionLabel } = await getStudentFormOptions({
    sessionLabel: requestedSessionLabel || null,
  });
  const filenameBase = `VPPS-${exportType}-${resolvedSessionLabel || "current"}`;
  // Audit 1.22 — match the recorded extension to the actual format so the
  // dashboard recent-activity strip doesn't show ".xlsx" for a PDF download.
  const extension = format === "pdf" ? "pdf" : "xlsx";
  const filename = formatExportName(filenameBase, extension);
  const exportTitle = `${exportType.replace(/-/g, " ")} · ${resolvedSessionLabel || "current"}`;

  // Fire-and-forget activity log for the dashboard recent-activity strip.
  void recordActivity({
    userId: (staff?.id as string | undefined) ?? null,
    kind: "export_downloaded",
    payload: { exportType, sessionLabel: resolvedSessionLabel, filename, format },
  });

  if (exportType === "ai-context-bundle") {
    return aiContextBundleResponse(filename, resolvedSessionLabel);
  }

  if (exportType === "all-students") {
    const rows = await getAllStudents({
      query: (request.nextUrl.searchParams.get("query") ?? "").trim(),
      sessionLabel: resolvedSessionLabel,
      classId: exportClassId,
      transportRouteId: "",
      status: exportStatus as StudentListFilters["status"],
      segments: exportSegments,
      // An export has always come out in name order; the sort control on the
      // Students screen must not quietly reshape a downloaded file.
      sort: "name",
    });

    return rowsResponse(
      format,
      filenameBase,
      exportTitle,
      rows.map((row) => ({
        "SR no": row.admissionNo,
        "Student": row.fullName,
        "Class": row.classLabel,
        "Route": row.transportRouteLabel,
        "Phone": row.fatherPhone ?? "",
        "Session due": row.outstandingAmount,
        "Overdue without late fee": row.overdueAmount,
        "Late fee": row.pendingLateFeeAmount,
        "Conventional discounts": row.conventionalDiscountLabels.join(", "),
      })),
    );
  }

  /**
   * The full student record — identity, class, and all 25 information fields.
   *
   * Kept separate from `all-students`, which is the fee-facing sheet: the money
   * columns and 25 demographic ones in one file is a worse answer to both
   * questions. It carries Aadhaar and Jan Aadhaar, so it sits behind the extra
   * `students:view` check at the top of handleExport, and should be handled as
   * the identity document it is once downloaded.
   */
  if (exportType === "student-master") {
    const rows = await getAllStudents({
      query: (request.nextUrl.searchParams.get("query") ?? "").trim(),
      sessionLabel: resolvedSessionLabel,
      classId: exportClassId,
      transportRouteId: "",
      status: exportStatus as StudentListFilters["status"],
      segments: exportSegments,
      // An export has always come out in name order; the sort control on the
      // Students screen must not quietly reshape a downloaded file.
      sort: "name",
    });
    const masterById = await getStudentMasterFieldsByIds(rows.map((row) => row.id));

    return rowsResponse(
      format,
      filenameBase,
      exportTitle,
      rows.map((row) => {
        const info = masterById.get(row.id);

        return {
          "SR no": row.admissionNo,
          "Student": row.fullName,
          "Class": row.classLabel,
          "Date of birth": row.dateOfBirth ?? "",
          "Admission date": info?.joinedOn ?? "",
          "Father name": info?.fatherName ?? "",
          "Mother name": info?.motherName ?? "",
          "Father phone": row.fatherPhone ?? "",
          "Mother phone": row.motherPhone ?? "",
          "Email": info?.email ?? "",
          "Address": info?.address ?? "",
          "Route": row.transportRouteLabel,
          "Record status": row.status,
          // Headers come from the field catalogue, so this sheet, the import
          // template and the bulk-update sheet all name a column the same way.
          ...Object.fromEntries(
            STUDENT_INFO_FIELDS.map((field) => [
              field.header,
              info?.[field.name] ?? "",
            ]),
          ),
        };
      }),
    );
  }

  if (exportType === "emi-plans") {
    return rowsResponse(
      format,
      filenameBase,
      exportTitle,
      await getRepaymentPlanExportRows(resolvedSessionLabel),
    );
  }

  if (exportType === "emi-schedule") {
    return rowsResponse(
      format,
      filenameBase,
      exportTitle,
      await getRepaymentScheduleExportRows(resolvedSessionLabel, todayIsoIst()),
    );
  }

  if (exportType === "previous-year-dues") {
    const rows = await getPrevYearDuesCollectionRows(resolvedSessionLabel);
    // A carry-forward chase is a phone-call list, and the numbers worth having
    // on it were sitting unexported on the student record.
    const masterById = await getStudentMasterFieldsByIds(
      rows.map((row) => row.studentId).filter(Boolean) as string[],
    );

    return rowsResponse(
      format,
      filenameBase,
      exportTitle,
      rows.map((row) => ({
        "SR no": row.admissionNo ?? "",
        "Student": row.studentName,
        "Class": row.classLabel,
        "Student status": row.studentStatus ?? "",
        "Phone": row.fatherPhone ?? "",
        "Guardian phone": masterById.get(row.studentId ?? "")?.guardianPhone ?? "",
        "Emergency phone":
          masterById.get(row.studentId ?? "")?.emergencyContactPhone ?? "",
        "Village / city": masterById.get(row.studentId ?? "")?.villageCity ?? "",
        "District": masterById.get(row.studentId ?? "")?.district ?? "",
        "Balance label": row.displayLabel,
        "Source session": row.sourceSessionLabel ?? "",
        "Target session": row.targetSessionLabel ?? "",
        "Previous-year balance": row.oldBalance,
        "Collected": row.collected,
        "Remaining": row.remaining,
        "Recovery state": row.status,
      })),
    );
  }

  if (exportType === "left-student-dues") {
    const queue = await getRecoveryQueue();
    // These families have already left, so the phone on the student record is
    // the one that has most likely gone stale. Every alternative it holds is
    // worth putting on the sheet.
    const masterById = await getStudentMasterFieldsByIds(
      queue.rows.map((row) => row.studentId),
    );

    return rowsResponse(
      format,
      filenameBase,
      exportTitle,
      queue.rows.map((row) => ({
        "SR no": row.admissionNo,
        "Student": row.fullName,
        "Father": row.fatherName ?? "",
        "Phone": row.phone ?? "",
        "Guardian phone": masterById.get(row.studentId)?.guardianPhone ?? "",
        "Emergency phone":
          masterById.get(row.studentId)?.emergencyContactPhone ?? "",
        "Village / city": masterById.get(row.studentId)?.villageCity ?? "",
        "District": masterById.get(row.studentId)?.district ?? "",
        "Status": row.status,
        "Class": row.classLabel ?? "",
        "Source session": row.sourceSessionLabel ?? "",
        "Carry-forward": row.hasCarryForward ? "yes" : "no",
        "Total remaining": row.totalRemaining,
        "Last payment": row.lastPaymentDate ?? "",
      })),
    );
  }

  if (exportType === "conventional-discount-students") {
    const students = await getAllStudents({
      query: "",
      sessionLabel: resolvedSessionLabel,
      classId: exportClassId,
      transportRouteId: "",
      status: exportStatus as StudentListFilters["status"],
      segments: exportSegments,
      // An export has always come out in name order; the sort control on the
      // Students screen must not quietly reshape a downloaded file.
      sort: "name",
    });
    const assignments = await getStudentConventionalDiscountAssignments({
      academicSessionLabel: resolvedSessionLabel,
      studentIds: students.map((student) => student.id),
    });
    const assignmentMap = new Map(
      students.map((student) => [
        student.id,
        assignments.filter((assignment) => assignment.studentId === student.id),
      ]),
    );

    return rowsResponse(
      format,
      filenameBase,
      exportTitle,
      students
        .filter((student) => (assignmentMap.get(student.id) ?? []).length > 0)
        .map((student) => ({
          "SR no": student.admissionNo,
          "Student": student.fullName,
          "Class": student.classLabel,
          "Phone": student.fatherPhone ?? "",
          "Policies": (assignmentMap.get(student.id) ?? [])
            .map((assignment) => assignment.policy.displayName)
            .join(", "),
          "Session due": student.outstandingAmount,
          "Overdue without late fee": student.overdueAmount,
          "Late fee": student.pendingLateFeeAmount,
        })),
    );
  }

  // Audit 1.7 — when the Defaulters page passes filter params, export exactly
  // what's on screen using getDefaulterExportRows. Falls back to the unfiltered
  // workbook below if no filter params are present (preserves existing
  // /protected/exports/defaulters quick-link behaviour).
  if (exportType === "defaulters" && hasDefaulterFilterParams(request)) {
    const filters = parseDefaulterFiltersFromQuery(request);
    const rows = await getDefaulterExportRows(filters, resolvedSessionLabel);
    const masterById = await getStudentMasterFieldsByIds(
      rows.map((row) => row.studentId),
    );

    return rowsResponse(
      format,
      filenameBase,
      exportTitle,
      rows.map((row) => ({
        "Student": row.fullName,
        "SR no": row.admissionNo,
        "Class": row.classLabel,
        "Father": row.fatherName ?? "",
        "Phone": row.fatherPhone ?? "",
        "Alternate phone": row.motherPhone ?? "",
        "Guardian phone": masterById.get(row.studentId)?.guardianPhone ?? "",
        "Emergency phone":
          masterById.get(row.studentId)?.emergencyContactPhone ?? "",
        "Village / city": masterById.get(row.studentId)?.villageCity ?? "",
        "District": masterById.get(row.studentId)?.district ?? "",
        "Route": row.transportRouteLabel,
        // `totalPending` is fees-only and `lateFeeTotal` is really the pending
        // late fee, so the old headers read as a total that excluded the late
        // fee and a charge that was actually a balance. Named for what they are,
        // with the sum a cashier can collect spelled out.
        "Fees pending": row.totalPending,
        "Overdue base": row.overdueAmount,
        "Late fee pending": row.lateFeeTotal,
        "Total owed": row.totalPending + row.lateFeeTotal,
        "Next due date": row.nextDueDate ?? "",
        "Next due amount": row.nextDueAmount,
        "Status": row.statusLabel,
        "Days overdue": row.daysOverdue,
      })),
    );
  }

  const view: OfficeWorkbookView =
    exportType === "receipt-register"
      ? "receipts"
      : exportType === "defaulters"
        ? "defaulters"
        : "student_dues";
  const workbook = await getOfficeWorkbookData({
    view,
    classId: "",
    sessionLabel: resolvedSessionLabel,
    // Exports must contain every row, not just the first workbook page.
    exportAll: true,
  });

  if (workbook.view === "receipts" || workbook.view === "transactions") {
    return rowsResponse(
      format,
      filenameBase,
      exportTitle,
      workbook.rows.map((row) => ({
        "Date": row.paymentDate,
        "Receipt number": row.receiptNumber,
        "Student": row.studentName,
        "SR no": row.admissionNo,
        "Class": row.classLabel,
        "Mode": row.paymentMode,
        "Amount": row.totalAmount,
        "Status": row.isReversed ? "REVERSED" : "",
        "Reference": row.referenceNumber ?? "",
        "Received by": row.receivedBy ?? "",
      })),
    );
  }

  if (workbook.view === "student_dues" || workbook.view === "defaulters") {
    const masterById = await getStudentMasterFieldsByIds(
      workbook.rows.map((row) => row.studentId),
    );

    /**
     * Class-wise dues, finally class-wise.
     *
     * The tile has promised this since it shipped, but there was no branch for
     * it — it fell through to the flat student-dues list and its only
     * "class-wise" quality was having a Class column. Rows now group by class
     * in the master sort order, each class closing with its own subtotal and
     * the sheet closing with a grand total.
     *
     * Every row carries the identical key set, subtotals included: json_to_sheet
     * takes its headers from the FIRST row's keys only, so a subtotal row with
     * fewer keys would silently drop columns from the whole sheet.
     */
    if (exportType === "class-wise-dues") {
      const blankRow = {
        "Class": "",
        "Student": "",
        "SR no": "",
        "Father": "",
        "Phone": "",
        "Total due": "" as string | number,
        "Paid": "" as string | number,
        "Fees pending": "" as string | number,
        "Late fee pending": "" as string | number,
        "Total owed": "" as string | number,
        "Next due date": "",
        "Status": "",
      };
      const byClass = new Map<string, typeof workbook.rows>();

      for (const row of workbook.rows) {
        const key = `${String(row.sortOrder).padStart(6, "0")}|${row.classLabel}`;
        const bucket = byClass.get(key);
        if (bucket) {
          bucket.push(row);
        } else {
          byClass.set(key, [row]);
        }
      }

      const classWiseRows: (typeof blankRow)[] = [];
      let grandDue = 0;
      let grandPaid = 0;
      let grandFees = 0;
      let grandLateFee = 0;

      for (const key of [...byClass.keys()].sort()) {
        const classRows = [...(byClass.get(key) ?? [])].sort(
          (left, right) =>
            right.totalOwedAmount - left.totalOwedAmount ||
            left.studentName.localeCompare(right.studentName),
        );
        const classLabel = classRows[0]?.classLabel ?? "";

        for (const row of classRows) {
          classWiseRows.push({
            ...blankRow,
            "Class": classLabel,
            "Student": row.studentName,
            "SR no": row.admissionNo,
            "Father": row.fatherName ?? "",
            "Phone": row.fatherPhone ?? "",
            "Total due": row.baseChargeTotal,
            "Paid": row.totalPaid,
            "Fees pending": row.outstandingAmount,
            "Late fee pending": row.lateFeeOutstandingAmount,
            "Total owed": row.totalOwedAmount,
            "Next due date": row.nextDueDate ?? "",
            "Status": row.statusLabel,
          });
        }

        const sum = (pick: (row: (typeof classRows)[number]) => number) =>
          classRows.reduce((total, row) => total + pick(row), 0);
        const classDue = sum((row) => row.baseChargeTotal);
        const classPaid = sum((row) => row.totalPaid);
        const classFees = sum((row) => row.outstandingAmount);
        const classLateFee = sum((row) => row.lateFeeOutstandingAmount);

        grandDue += classDue;
        grandPaid += classPaid;
        grandFees += classFees;
        grandLateFee += classLateFee;

        classWiseRows.push({
          ...blankRow,
          "Class": classLabel,
          "Student": `${classLabel} total (${classRows.length} students)`,
          "Total due": classDue,
          "Paid": classPaid,
          "Fees pending": classFees,
          "Late fee pending": classLateFee,
          "Total owed": classFees + classLateFee,
        });
      }

      classWiseRows.push({
        ...blankRow,
        "Student": `All classes (${workbook.rows.length} students)`,
        "Total due": grandDue,
        "Paid": grandPaid,
        "Fees pending": grandFees,
        "Late fee pending": grandLateFee,
        "Total owed": grandFees + grandLateFee,
      });

      return rowsResponse(format, filenameBase, exportTitle, classWiseRows);
    }

    // Sort by what the family actually owes, not by fees alone. On the old key
    // a student clear of fees but carrying a late fee sorted to the very bottom
    // of the sheet, under everyone owing nothing at all.
    // Fallback: alphabetical by name as the deterministic tiebreaker.
    const sortedRows = [...workbook.rows].sort((left, right) => {
      if (right.totalOwedAmount !== left.totalOwedAmount) {
        return right.totalOwedAmount - left.totalOwedAmount;
      }
      return left.studentName.localeCompare(right.studentName);
    });
    return rowsResponse(
      format,
      filenameBase,
      exportTitle,
      sortedRows.map((row) => {
        const master = masterById.get(row.studentId);

        return {
          "Student": row.studentName,
          "SR no": row.admissionNo,
          "Class": row.classLabel,
          "Father": row.fatherName ?? "",
          "Phone": row.fatherPhone ?? "",
          "Guardian phone": master?.guardianPhone ?? "",
          "Emergency phone": master?.emergencyContactPhone ?? "",
          "Village / city": master?.villageCity ?? "",
          "District": master?.district ?? "",
          "Route": buildTransportRouteLabel({
            routeName: row.transportRouteName,
            transportFeeAmount: row.transportFee,
          }),
          "Total due": row.baseChargeTotal,
          "Paid": row.totalPaid,
          // Was a single "Outstanding" reading row.outstandingAmount, which is
          // fees-only — so a family owing nothing but a late fee showed as 0.
          "Fees pending": row.outstandingAmount,
          "Late fee pending": row.lateFeeOutstandingAmount,
          "Total owed": row.totalOwedAmount,
          "Next due date": row.nextDueDate ?? "",
          "Next due amount": row.nextDueAmount ?? 0,
          "Status": row.statusLabel,
        };
      }),
    );
  }

  return rowsResponse(format, filenameBase, exportTitle, [{ "Export": "No rows found" }]);
}

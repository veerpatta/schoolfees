import type { NextRequest } from "next/server";

import { getOfficeWorkbookData } from "@/lib/transactions/dues";
import type { OfficeWorkbookView } from "@/lib/transactions/workbook";
import { getDefaulterExportRows } from "@/lib/defaulters/data";
import { getPrevYearDuesCollectionRows } from "@/lib/prev-year-dues/data";
import {
  EMPTY_DEFAULTER_FILTERS,
  type DefaulterFilters,
} from "@/lib/defaulters/types";
import { getAllStudents, getStudentFormOptions } from "@/lib/students/data";
import {
  getConventionalDiscountPolicies,
  getFeePolicySummary,
  getStudentConventionalDiscountAssignments,
} from "@/lib/fees/data";
import { getMasterDataOptions } from "@/lib/master-data/data";
import {
  getWorkbookInstallmentRows,
  getWorkbookStudentFinancials,
  getWorkbookTransactions,
} from "@/lib/workbook/data";
import { getAuthenticatedStaff, hasStaffPermission } from "@/lib/supabase/session";
import { createClient } from "@/lib/supabase/server";
import { formatExportName } from "@/lib/helpers/export";
import { formatInr } from "@/lib/helpers/currency";
import { formatDateTimeIst } from "@/lib/helpers/date";
import { recordActivity } from "@/lib/activity/events";

type RouteContext = {
  params: Promise<{
    exportType: string;
  }>;
};

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
  ] = await Promise.all([
    getFeePolicySummary(),
    getMasterDataOptions(),
    getWorkbookStudentFinancials({ sessionLabel }),
    getWorkbookInstallmentRows({ sessionLabel }),
    getWorkbookTransactions({ sessionLabel }),
    getConventionalDiscountPolicies(sessionLabel),
  ]);

  const allStudentIds = financials.map((row) => row.studentId);

  const discountAssignments = await getStudentConventionalDiscountAssignments({
    academicSessionLabel: sessionLabel,
    studentIds: allStudentIds,
  });

  // Per-student conventional discount labels (derived from assignments so they
  // cover every status, not just the active list).
  const discountLabelsByStudent = new Map<string, string[]>();
  for (const assignment of discountAssignments) {
    if (!assignment.isActive) continue;
    const labels = discountLabelsByStudent.get(assignment.studentId) ?? [];
    labels.push(assignment.policy.displayName);
    discountLabelsByStudent.set(assignment.studentId, labels);
  }

  // Append-only corrections and refunds, session-scoped via the student set.
  // These read under the caller's JWT; lower roles without finance:view simply
  // get empty sheets (RLS), which is acceptable degradation.
  const supabase = await createClient();
  const [adjustmentsResult, refundsResult] = await Promise.all([
    allStudentIds.length > 0
      ? supabase
          .from("payment_adjustments")
          .select(
            "id, student_id, adjustment_type, amount_delta, reason, notes, created_at, installment_ref:installments(installment_label), payment_ref:payments(receipt_ref:receipts(receipt_number))",
          )
          .in("student_id", allStudentIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    allStudentIds.length > 0
      ? supabase
          .from("refund_requests")
          .select(
            "id, student_id, refund_date, requested_amount, refund_method, refund_reference, reason, notes, status, created_at, approved_at, processed_at, receipt_ref:receipts(receipt_number)",
          )
          .in("student_id", allStudentIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const adjustments = (adjustmentsResult.data ?? []) as Array<{
    id: string;
    student_id: string;
    adjustment_type: string;
    amount_delta: number;
    reason: string;
    notes: string | null;
    created_at: string;
    installment_ref: { installment_label: string } | { installment_label: string }[] | null;
    payment_ref:
      | { receipt_ref: { receipt_number: string } | { receipt_number: string }[] | null }
      | { receipt_ref: { receipt_number: string } | { receipt_number: string }[] | null }[]
      | null;
  }>;
  const refunds = (refundsResult.data ?? []) as Array<{
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
  const activeCount = financials.filter((row) => row.recordStatus === "active").length;

  const generatedAt = new Date().toISOString();

  const readmeLines: string[] = [
    `VPPS School Fee Management — AI context bundle`,
    `Snapshot taken: ${generatedAt}`,
    `Active academic session: ${sessionLabel}`,
    ``,
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
    `  1. Conventional / tuition discount — reduces the base fee a student owes.`,
    `     Shown per student in Students."Discount (tuition)" and in the Discounts`,
    `     sheet. It lowers "Total due", it is NOT a payment.`,
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
    `SHEET GLOSSARY`,
    `* Students          — EVERY student in the session (active, inactive, AND`,
    `                      graduated — see the Status column), with class, route,`,
    `                      phones, full fee breakdown, discount, waiver, dues.`,
    `* Installments      — per-student per-installment expected/paid/pending/late fee.`,
    `* Payments          — every receipt with mode, reference, total amount.`,
    `* Adjustments       — append-only corrections/reversals (refunds, write-offs,`,
    `                      corrections) with signed amount_delta and reason.`,
    `* Refunds           — refund requests with status (pending/approved/processed).`,
    `* Classes           — class master with sort order and session label.`,
    `* Routes            — transport route master with codes.`,
    `* Discounts         — conventional discount policies + every active assignment.`,
    `* Defaulters        — outstanding follow-up list (students with pending > 0).`,
    `* Sessions          — session metadata (current, fee plan summary).`,
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
    `  Adjustments:             ${adjustments.length}`,
    `  Refunds:                 ${refunds.length}`,
    `  Classes:                 ${masterData.classOptions.length}`,
    `  Routes:                  ${masterData.routeOptions.length}`,
    `  Discount policies:       ${discountPolicies.length}`,
    `  Discount assignments:    ${discountAssignments.length}`,
    `  Defaulters:              ${financials.filter((row) => row.outstandingAmount > 0).length}`,
  ];

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(readmeLines.map((line) => [line])),
    "_README",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      financials.map((row) => ({
        "SR no": row.admissionNo,
        "Student": row.studentName,
        "Class": row.classLabel,
        "Status": row.recordStatus,
        "Student type": row.studentStatusLabel,
        "Route": row.transportRouteName ?? "",
        "Father phone": row.fatherPhone ?? "",
        "Mother phone": row.motherPhone ?? "",
        "Tuition fee": row.tuitionFee,
        "Transport fee": row.transportFee,
        "Academic fee": row.academicFee,
        "Discount (tuition)": row.discountAmount,
        "Gross before discount": row.grossBaseBeforeDiscount,
        "Late-fee waiver (annual)": row.lateFeeWaiverAmount,
        "Late fee charged (total)": row.lateFeeTotal,
        "Total due": row.baseChargeTotal,
        "Total paid": row.totalPaid,
        "Outstanding": row.outstandingAmount,
        "Conventional discounts": (discountLabelsByStudent.get(row.studentId) ?? []).join(", "),
        "Next due label": row.nextDueLabel ?? "",
        "Next due date": row.nextDueDate ?? "",
        "Next due amount": row.nextDueAmount ?? 0,
        "Last payment date": row.lastPaymentDate ?? "",
        "Status label": row.statusLabel,
      })),
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
        "Installment label": row.installmentLabel,
        "Due date": row.dueDate,
        "Base charge": row.baseCharge,
        "Paid": row.paidAmount,
        "Adjustment": row.adjustmentAmount,
        "Late fee (raw)": row.rawLateFee,
        "Late fee (waiver)": row.waiverApplied,
        "Late fee (final)": row.finalLateFee,
        "Total charge": row.totalCharge,
        "Pending": row.pendingAmount,
        "Status": row.balanceStatus,
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
            const installment = firstOf(row.installment_ref);
            const payment = firstOf(row.payment_ref);
            const receipt = payment ? firstOf(payment.receipt_ref) : null;
            return {
              "Date": row.created_at.slice(0, 10),
              "SR no": student?.admissionNo ?? "",
              "Student": student?.studentName ?? "",
              "Class": student?.classLabel ?? "",
              "Receipt number": receipt?.receipt_number ?? "",
              "Installment": installment?.installment_label ?? "",
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
        "Active": row.isActive ? "yes" : "no",
        "Route id": row.id,
      })),
    ),
    "Routes",
  );

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

  const defaulterRows = financials
    .filter((row) => row.outstandingAmount > 0)
    .sort((a, b) => b.outstandingAmount - a.outstandingAmount)
    .map((row) => ({
      "SR no": row.admissionNo,
      "Student": row.studentName,
      "Class": row.classLabel,
      "Phone": row.fatherPhone ?? "",
      "Total due": row.baseChargeTotal,
      "Total paid": row.totalPaid,
      "Outstanding": row.outstandingAmount,
      "Next due label": row.nextDueLabel ?? "",
      "Next due date": row.nextDueDate ?? "",
      "Next due amount": row.nextDueAmount ?? 0,
      "Status": row.statusLabel,
    }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(defaulterRows), "Defaulters");

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

export async function GET(request: NextRequest, context: RouteContext) {
  const staff = await getAuthenticatedStaff();
  if (!staff) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!hasStaffPermission(staff, "reports:view")) {
    return new Response("Forbidden", { status: 403 });
  }

  const { exportType } = await context.params;
  const requestedSessionLabel = (request.nextUrl.searchParams.get("session") ?? "").trim();
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
      query: "",
      sessionLabel: resolvedSessionLabel,
      classId: "",
      transportRouteId: "",
      status: "active",
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

  if (exportType === "previous-year-dues") {
    const rows = await getPrevYearDuesCollectionRows(resolvedSessionLabel);

    return rowsResponse(
      format,
      filenameBase,
      exportTitle,
      rows.map((row) => ({
        "SR no": row.admissionNo ?? "",
        "Student": row.studentName,
        "Class": row.classLabel,
        "Phone": row.fatherPhone ?? "",
        "Previous-year balance": row.oldBalance,
        "Collected": row.collected,
        "Remaining": row.remaining,
        "Status": row.status,
      })),
    );
  }

  if (exportType === "conventional-discount-students") {
    const students = await getAllStudents({
      query: "",
      sessionLabel: resolvedSessionLabel,
      classId: "",
      transportRouteId: "",
      status: "active",
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
        "Route": row.transportRouteLabel,
        "Total pending": row.totalPending,
        "Overdue base": row.overdueAmount,
        "Late fee": row.lateFeeTotal,
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
        "Reference": row.referenceNumber ?? "",
        "Received by": row.receivedBy ?? "",
      })),
    );
  }

  if (workbook.view === "student_dues" || workbook.view === "defaulters") {
    // Audit 1.26 — sort by outstanding desc so the spreadsheet matches the
    // heat-ordered Defaulters page rather than the workbook's natural order.
    // Fallback: alphabetical by name as the deterministic tiebreaker.
    const sortedRows = [...workbook.rows].sort((left, right) => {
      if (right.outstandingAmount !== left.outstandingAmount) {
        return right.outstandingAmount - left.outstandingAmount;
      }
      return left.studentName.localeCompare(right.studentName);
    });
    return rowsResponse(
      format,
      filenameBase,
      exportTitle,
      sortedRows.map((row) => ({
        "Student": row.studentName,
        "SR no": row.admissionNo,
        "Class": row.classLabel,
        "Father": row.fatherName ?? "",
        "Phone": row.fatherPhone ?? "",
        "Route": row.transportRouteName ?? "No Transport",
        "Total due": row.baseChargeTotal,
        "Paid": row.totalPaid,
        "Outstanding": row.outstandingAmount,
        "Next due date": row.nextDueDate ?? "",
        "Next due amount": row.nextDueAmount ?? 0,
        "Status": row.statusLabel,
      })),
    );
  }

  return rowsResponse(format, filenameBase, exportTitle, [{ "Export": "No rows found" }]);
}

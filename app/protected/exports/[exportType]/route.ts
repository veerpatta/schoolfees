import type { NextRequest } from "next/server";

import { getOfficeWorkbookData } from "@/lib/transactions/dues";
import type { OfficeWorkbookView } from "@/lib/transactions/workbook";
import { getDefaulterExportRows } from "@/lib/defaulters/data";
import {
  EMPTY_DEFAULTER_FILTERS,
  type DefaulterFilters,
} from "@/lib/defaulters/types";
import { getStudents, getStudentFormOptions } from "@/lib/students/data";
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

  const [
    policy,
    masterData,
    students,
    installments,
    transactions,
    financials,
    discountPolicies,
  ] = await Promise.all([
    getFeePolicySummary(),
    getMasterDataOptions(),
    getStudents({
      query: "",
      sessionLabel,
      classId: "",
      transportRouteId: "",
      status: "active",
    }),
    getWorkbookInstallmentRows({ sessionLabel }),
    getWorkbookTransactions({ sessionLabel }),
    getWorkbookStudentFinancials({ sessionLabel, activeOnly: true }),
    getConventionalDiscountPolicies(sessionLabel),
  ]);

  const discountAssignments = await getStudentConventionalDiscountAssignments({
    academicSessionLabel: sessionLabel,
    studentIds: students.map((row) => row.id),
  });

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
    `payment_adjustments table with audit trail. Never assume a receipt has`,
    `been edited in place.`,
    ``,
    `SHEET GLOSSARY`,
    `* Students          — active student list with class, route, phone, status.`,
    `* Installments      — per-student per-installment expected/paid/pending/late fee.`,
    `* Payments          — every receipt with mode, reference, total amount.`,
    `* Classes           — class master with sort order and session label.`,
    `* Routes            — transport route master with codes.`,
    `* Discounts         — conventional discount policies + every active assignment.`,
    `* Defaulters        — current outstanding follow-up list (students with pending > 0).`,
    `* Sessions          — session metadata (current, fee plan summary).`,
    ``,
    `HOW TO INTERPRET THIS WORKBOOK`,
    `When the model needs a specific student's full picture, join Students,`,
    `Installments, and Payments by admission_no (SR no). Defaulters is just a`,
    `filtered view (outstanding > 0). Treat all amounts as canonical only as`,
    `of the snapshot time above; live state may have moved since.`,
    ``,
    `Counts in this snapshot:`,
    `  Students:            ${students.length}`,
    `  Installments rows:   ${installments.length}`,
    `  Payments:            ${transactions.length}`,
    `  Classes:             ${masterData.classOptions.length}`,
    `  Routes:              ${masterData.routeOptions.length}`,
    `  Discount policies:   ${discountPolicies.length}`,
    `  Discount assignments:${discountAssignments.length}`,
    `  Defaulters:          ${financials.filter((row) => row.outstandingAmount > 0).length}`,
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
      students.map((row) => ({
        "SR no": row.admissionNo,
        "Student": row.fullName,
        "Class": row.classLabel,
        "Route": row.transportRouteLabel,
        "Phone": row.fatherPhone ?? "",
        "Status": row.status,
        "Student type": row.studentStatusLabel,
        "Conventional discounts": row.conventionalDiscountLabels.join(", "),
        "Total due": row.totalDue,
        "Total paid": row.totalPaid,
        "Outstanding": row.outstandingAmount,
        "Overdue (no late fee)": row.overdueAmount,
        "Pending late fee": row.pendingLateFeeAmount,
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

  const studentIndex = new Map(students.map((row) => [row.id, row]));
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
      "Student": student?.fullName ?? "",
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
      "Total due": row.totalDue,
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
  const rawMinPending = get("minPendingAmount");
  const rawQuery = get("query");

  return {
    classId: uuidPattern.test(rawClassId) ? rawClassId : EMPTY_DEFAULTER_FILTERS.classId,
    transportRouteId: uuidPattern.test(rawRouteId)
      ? rawRouteId
      : EMPTY_DEFAULTER_FILTERS.transportRouteId,
    overdue: rawOverdue === "overdue" ? "overdue" : EMPTY_DEFAULTER_FILTERS.overdue,
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
    const rows = await getStudents({
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

  if (exportType === "conventional-discount-students") {
    const students = await getStudents({
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
    return rowsResponse(
      format,
      filenameBase,
      exportTitle,
      workbook.rows.map((row) => ({
        "Student": row.studentName,
        "SR no": row.admissionNo,
        "Class": row.classLabel,
        "Father": row.fatherName ?? "",
        "Phone": row.fatherPhone ?? "",
        "Route": row.transportRouteName ?? "No Transport",
        "Total due": row.totalDue,
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

import type { NextRequest } from "next/server";

import { getOfficeWorkbookData } from "@/lib/office/dues";
import { normalizeOfficeWorkbookView } from "@/lib/office/workbook";
import { serializeCsv } from "@/lib/reports/data";
import { getAuthenticatedStaff, hasStaffPermission } from "@/lib/supabase/session";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuid(value: string | null) {
  const normalized = (value ?? "").trim();
  return UUID_PATTERN.test(normalized) ? normalized : "";
}

function normalizeDate(value: string | null) {
  const normalized = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function normalizePaymentMode(value: string | null) {
  const normalized = (value ?? "").trim();
  return ["cash", "upi", "bank_transfer", "cheque"].includes(normalized)
    ? normalized
    : "";
}

function formatOptionalDate(value: string | null | undefined) {
  return value ?? "";
}

function formatPaymentModeLabel(value: string) {
  if (value === "upi") {
    return "UPI";
  }

  if (value === "bank_transfer") {
    return "Bank transfer";
  }

  if (value === "cheque") {
    return "Cheque";
  }

  return "Cash";
}

function buildFilename(view: string) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `transactions-${view}-${dateStamp}.csv`;
}

export async function GET(request: NextRequest) {
  const staff = await getAuthenticatedStaff();

  if (!staff) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!hasStaffPermission(staff, "reports:view")) {
    return new Response("Forbidden", { status: 403 });
  }

  const view = normalizeOfficeWorkbookView(request.nextUrl.searchParams.get("view"));
  const workbook = await getOfficeWorkbookData({
    view,
    classId: normalizeUuid(request.nextUrl.searchParams.get("classId")),
    fromDate: normalizeDate(request.nextUrl.searchParams.get("fromDate")),
    paymentMode: normalizePaymentMode(request.nextUrl.searchParams.get("paymentMode")),
    routeId: normalizeUuid(request.nextUrl.searchParams.get("routeId")),
    searchQuery: (request.nextUrl.searchParams.get("query") ?? "").trim(),
    sessionLabel: (request.nextUrl.searchParams.get("sessionLabel") ?? "").trim(),
    toDate: normalizeDate(request.nextUrl.searchParams.get("toDate")),
  });

  const csvData = (() => {
    switch (workbook.view) {
      case "transactions":
      case "receipts":
        return {
          filename: buildFilename(workbook.view),
          headers: [
            "Date",
            "Receipt number",
            "Student",
            "SR no",
            "Class",
            "Payment mode",
            "Reference number",
            "Amount",
            "Received by",
            "Current total paid",
            "Current outstanding",
          ],
          rows: workbook.rows.map((row) => [
            row.paymentDate,
            row.receiptNumber,
            row.studentName,
            row.admissionNo,
            row.classLabel,
            formatPaymentModeLabel(row.paymentMode),
            row.referenceNumber ?? "",
            row.totalAmount,
            row.receivedBy ?? "",
            row.currentTotalPaid,
            row.currentOutstanding,
          ]),
        };
      case "collection_today":
        return {
          filename: buildFilename(workbook.view),
          headers: ["Date", "Payment mode", "Receipt count", "Student count", "Total amount"],
          rows: workbook.rows.map((row) => [
            row.paymentDate,
            row.paymentMode,
            row.receiptCount,
            row.studentCount,
            row.totalAmount,
          ]),
        };
      case "student_dues":
      case "installments":
      case "defaulters":
      case "class_register":
        return {
          filename: buildFilename(workbook.view),
          headers: [
            "Student",
            "SR no",
            "Class",
            "Father",
            "Phone",
            "Route",
            "Total due",
            "Paid",
            "Outstanding",
            "Installment 1 pending",
            "Installment 2 pending",
            "Installment 3 pending",
            "Installment 4 pending",
            "Next due date",
            "Next due amount",
            "Status",
            "Discount",
            "Late fee",
            "Late fee waived",
          ],
          rows: workbook.rows.map((row) => [
            row.studentName,
            row.admissionNo,
            row.classLabel,
            row.fatherName ?? "",
            row.fatherPhone ?? "",
            row.transportRouteName ?? "No Transport",
            row.totalDue,
            row.totalPaid,
            row.outstandingAmount,
            row.inst1Pending,
            row.inst2Pending,
            row.inst3Pending,
            row.inst4Pending,
            formatOptionalDate(row.nextDueDate),
            row.nextDueAmount ?? 0,
            row.statusLabel,
            row.discountAmount,
            row.lateFeeTotal,
            row.lateFeeWaiverAmount,
          ]),
        };
      case "import_issues":
        return {
          filename: buildFilename(workbook.view),
          headers: ["Row", "Student", "SR no", "Class", "Status", "Errors", "Warnings"],
          rows: workbook.rows.map((row) => [
            row.rowIndex,
            row.fullName ?? "",
            row.admissionNo ?? "",
            row.classLabel ?? "",
            row.status,
            row.errors.join(" | "),
            row.warnings.join(" | "),
          ]),
        };
      case "exports":
        return {
          filename: buildFilename(workbook.view),
          headers: ["View", "Status"],
          rows: [["Exports", "Open a specific Transactions view to export records."]],
        };
    }
  })();

  return new Response(serializeCsv(csvData), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvData.filename}"`,
      "cache-control": "no-store",
    },
  });
}

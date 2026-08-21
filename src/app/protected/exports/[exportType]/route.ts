import type { NextRequest } from "next/server";

import { getOfficeWorkbookData } from "@/modules/transactions/data/dues";
import type { OfficeWorkbookView } from "@/modules/transactions/domain/workbook";
import { getDefaulterExportRows } from "@/modules/defaulters/data/queries";
import { getPrevYearDuesCollectionRows } from "@/modules/prev-year-dues/data/queries";
import { getRecoveryQueue } from "@/modules/recovery/data/queries";
import {
  getRepaymentPlanExportRows,
  getRepaymentScheduleExportRows,
} from "@/modules/repayment-plans/data/queries";
import {
  getAllStudents,
  getStudentFormOptions,
  getStudentMasterFieldsByIds,
} from "@/modules/students/data/queries";
import { STUDENT_INFO_FIELDS } from "@/modules/students/domain/info-fields";
import { getStudentConventionalDiscountAssignments } from "@/modules/fees/domain/queries";
import { buildTransportRouteLabel } from "@/modules/fees/domain/label";
import { getAuthenticatedStaff, hasStaffPermission } from "@/platform/supabase/session";
import { formatExportName } from "@/platform/helpers/export";
import { recordActivity } from "@/modules/activity/data/events";

import { withDownloadToken } from "@/platform/helpers/download-token";
import { parseSegments } from "@/modules/students/domain/student-segments";
import type { StudentListFilters } from "@/modules/students/domain/types";
import { aiContextBundleResponse } from "@/modules/exports/data/ai-context-bundle";
import { rowsResponse, todayIsoIst } from "@/modules/exports/data/responses";
import {
  hasDefaulterFilterParams,
  parseDefaulterFiltersFromQuery,
} from "@/modules/exports/domain/defaulter-filters";

// overrun Vercel's default function timeout on real data volumes.
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{
    exportType: string;
  }>;
};

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


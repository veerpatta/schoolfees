import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";

import { getOfficeWorkbookData } from "@/lib/office/dues";
import type { OfficeWorkbookView } from "@/lib/office/workbook";
import { getStudents, getStudentFormOptions } from "@/lib/students/data";
import { getStudentConventionalDiscountAssignments } from "@/lib/fees/data";
import { getAuthenticatedStaff, hasStaffPermission } from "@/lib/supabase/session";

type RouteContext = {
  params: Promise<{
    exportType: string;
  }>;
};

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function workbookResponse(filename: string, rows: Array<Record<string, string | number>>) {
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

export async function GET(_request: NextRequest, context: RouteContext) {
  const staff = await getAuthenticatedStaff();
  if (!staff) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!hasStaffPermission(staff, "reports:view")) {
    return new Response("Forbidden", { status: 403 });
  }

  const { exportType } = await context.params;
  const { resolvedSessionLabel } = await getStudentFormOptions();
  const filename = `VPPS-${exportType}-${resolvedSessionLabel || "current"}-${todayStamp()}.xlsx`;

  if (exportType === "all-students") {
    const rows = await getStudents({
      query: "",
      sessionLabel: resolvedSessionLabel,
      classId: "",
      transportRouteId: "",
      status: "active",
    });

    return workbookResponse(
      filename,
      rows.map((row) => ({
        "SR no": row.admissionNo,
        "Student": row.fullName,
        "Class": row.classLabel,
        "Route": row.transportRouteLabel,
        "Phone": row.fatherPhone ?? "",
        "Outstanding": row.outstandingAmount,
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

    return workbookResponse(
      filename,
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
          "Outstanding": student.outstandingAmount,
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
    return workbookResponse(
      filename,
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
    return workbookResponse(
      filename,
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

  return workbookResponse(filename, [{ "Export": "No rows found" }]);
}

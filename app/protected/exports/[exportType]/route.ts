import type { NextRequest } from "next/server";

import { getOfficeWorkbookData } from "@/lib/transactions/dues";
import type { OfficeWorkbookView } from "@/lib/transactions/workbook";
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
    `* Late fee: ₹${policy.lateFeeFlatAmount.toLocaleString("en-IN")} flat per installment that misses its due date.`,
    `* New-student academic fee: ₹${policy.newStudentAcademicFeeAmount.toLocaleString("en-IN")}`,
    `* Existing-student academic fee: ₹${policy.oldStudentAcademicFeeAmount.toLocaleString("en-IN")}`,
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
  const { resolvedSessionLabel } = await getStudentFormOptions({
    sessionLabel: requestedSessionLabel || null,
  });
  const filename = formatExportName(
    `VPPS-${exportType}-${resolvedSessionLabel || "current"}`,
    "xlsx",
  );

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

    return workbookResponse(
      filename,
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
          "Session due": student.outstandingAmount,
          "Overdue without late fee": student.overdueAmount,
          "Late fee": student.pendingLateFeeAmount,
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

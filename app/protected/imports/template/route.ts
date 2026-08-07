import type { UpdateTemplateStudent } from "@/lib/import/templates";
import { getConventionalDiscountPolicies } from "@/lib/fees/conventional-discounts";
import { getFeePolicyForSession, getFeePolicySummary } from "@/lib/fees/data";
import { getMasterDataOptions } from "@/lib/master-data/data";
import { ACTIVE_STUDENT_STATUS } from "@/lib/students/bulk-update/data";
import { compareStudentRowsByName } from "@/lib/students/sort";
import { createClient } from "@/lib/supabase/server";
import { requireAnyStaffPermission } from "@/lib/supabase/session";

import { withDownloadToken } from "@/lib/helpers/download-token";
type StudentClassRef = {
  session_label: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
};

type StudentRouteRef = {
  route_name: string;
  route_code: string | null;
};

type StudentExportRow = {
  id: string;
  admission_no: string;
  full_name: string;
  father_name: string | null;
  primary_phone: string | null;
  notes: string | null;
  class_ref: StudentClassRef | StudentClassRef[] | null;
  route_ref: StudentRouteRef | StudentRouteRef[] | null;
};

type OverrideRow = {
  student_id: string;
  custom_tuition_fee_amount: number | null;
  custom_transport_fee_amount: number | null;
  discount_amount: number;
  late_fee_waiver_amount: number;
  other_adjustment_head: string | null;
  other_adjustment_amount: number | null;
  student_type_override: "new" | "existing" | null;
};

function single<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function classLabel(row: StudentClassRef) {
  return [row.class_name, row.section ? `Section ${row.section}` : "", row.stream_name ?? ""]
    .filter(Boolean)
    .join(" - ");
}

function routeLabel(row: StudentRouteRef) {
  return row.route_code ? `${row.route_name} (${row.route_code})` : row.route_name;
}

function xlsxResponse(request: Request, buffer: Buffer, filename: string) {
  return withDownloadToken(request, new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  }));
}

async function buildUpdateRows(sessionLabel: string | null): Promise<UpdateTemplateStudent[]> {
  const supabase = await createClient();
  const [{ data: students, error: studentsError }, { data: overrides, error: overridesError }] =
    await Promise.all([
      supabase
        .from("students")
        .select("id, admission_no, full_name, father_name, primary_phone, notes, class_ref:classes(session_label, class_name, section, stream_name), route_ref:transport_routes(route_name, route_code)")
        // Withdrawn students keep their old class, so without this filter every
        // class template carries children who have left the school.
        .eq("status", ACTIVE_STUDENT_STATUS)
        .order("full_name", { ascending: true }),
      supabase
        .from("student_fee_overrides")
        .select("student_id, custom_tuition_fee_amount, custom_transport_fee_amount, discount_amount, late_fee_waiver_amount, other_adjustment_head, other_adjustment_amount, student_type_override")
        .eq("is_active", true),
    ]);

  if (studentsError) {
    throw new Error(`Unable to export students: ${studentsError.message}`);
  }

  if (overridesError && !overridesError.message.includes("does not exist")) {
    throw new Error(`Unable to export student fee profiles: ${overridesError.message}`);
  }

  const overrideMap = new Map(
    ((overrides ?? []) as OverrideRow[]).map((row) => [row.student_id, row]),
  );

  return ((students ?? []) as StudentExportRow[])
    // Same A-Z rule as every other downloadable student list, applied in JS so
    // it does not shift with the database collation.
    .sort(compareStudentRowsByName)
    .filter((student) => {
      if (!sessionLabel) {
        return true;
      }

      const classRef = single(student.class_ref);
      return classRef?.session_label === sessionLabel;
    })
    .map((student) => {
    const override = overrideMap.get(student.id);
    const classRef = single(student.class_ref);
    const routeRef = single(student.route_ref);

    return {
      studentId: student.id,
      admissionNo: student.admission_no,
      fullName: student.full_name,
      classLabel: classRef ? classLabel(classRef) : "",
      fatherName: student.father_name,
      fatherPhone: student.primary_phone,
      transportRouteLabel: routeRef ? routeLabel(routeRef) : "",
      studentTypeLabel: override?.student_type_override === "new" ? "New" : "Existing",
      tuitionOverride: override?.custom_tuition_fee_amount ?? null,
      transportOverride: override?.custom_transport_fee_amount ?? null,
      discountAmount: override?.discount_amount ?? 0,
      lateFeeWaiverAmount: override?.late_fee_waiver_amount ?? 0,
      otherAdjustmentHead: override?.other_adjustment_head ?? null,
      otherAdjustmentAmount: override?.other_adjustment_amount ?? null,
      notes: student.notes,
    };
  });
}

export async function GET(request: Request) {
  await requireAnyStaffPermission(["imports:view", "students:write"], { onDenied: "redirect" });

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "update" ? "update" : "add";
  const sessionLabel =
    (url.searchParams.get("sessionLabel") ?? url.searchParams.get("session"))?.trim() ?? "";
  const includeAllSessions = sessionLabel === "__all__";
  const normalizedSessionLabel = sessionLabel && sessionLabel !== "__all__" ? sessionLabel : null;
  const [{ classOptions, routeOptions }, policy] = await Promise.all([
    getMasterDataOptions(),
    normalizedSessionLabel
      ? getFeePolicyForSession(normalizedSessionLabel)
      : getFeePolicySummary(),
  ]);
  const targetSessionLabel = includeAllSessions
    ? ""
    : normalizedSessionLabel || policy.academicSessionLabel || "";
  const sessionClasses = targetSessionLabel
    ? classOptions.filter((item) => item.sessionLabel === targetSessionLabel)
    : classOptions;
  const classesForTemplate = sessionClasses.length > 0 ? sessionClasses : classOptions;
  const routesForTemplate = routeOptions.filter((item) => item.isActive).map((item) => ({
    label: item.routeCode ? `${item.label} (${item.routeCode})` : item.label,
  }));

  const conventionalPolicies = targetSessionLabel
    ? (await getConventionalDiscountPolicies(targetSessionLabel))
        .filter((item) => item.isActive)
        .map((item) => ({ label: item.displayName }))
    : [];

  // The *File builders write the workbook and then stamp the dropdowns onto the
  // zip — SheetJS cannot emit data validations on its own.
  if (mode === "update") {
    const { buildUpdateStudentsTemplateFile } = await import("@/lib/import/templates");

    const buffer = await buildUpdateStudentsTemplateFile(
      await buildUpdateRows(normalizedSessionLabel),
      {
        classes: classesForTemplate.map((item) => ({ label: item.label })),
        routes: routesForTemplate,
        conventionalPolicies,
      },
    );
    return xlsxResponse(request, buffer, "student-update-template.xlsx");
  }

  const { buildAddStudentsTemplateFile } = await import("@/lib/import/templates");
  const buffer = await buildAddStudentsTemplateFile(
    classesForTemplate.map((item) => ({ label: item.label })),
    routesForTemplate,
    conventionalPolicies,
  );

  return xlsxResponse(request, buffer, "student-add-template.xlsx");
}

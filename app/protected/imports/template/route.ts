import {
  buildAddStudentsTemplateWorkbook,
  buildUpdateStudentsTemplateWorkbook,
  workbookToXlsxBuffer,
  type UpdateTemplateStudent,
} from "@/lib/import/templates";
import { getMasterDataOptions } from "@/lib/master-data/data";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/supabase/session";

type StudentClassRef = {
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

function xlsxResponse(buffer: Buffer, filename: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

async function buildUpdateRows(): Promise<UpdateTemplateStudent[]> {
  const supabase = await createClient();
  const [{ data: students, error: studentsError }, { data: overrides, error: overridesError }] =
    await Promise.all([
      supabase
        .from("students")
        .select("id, admission_no, full_name, father_name, primary_phone, notes, class_ref:classes(class_name, section, stream_name), route_ref:transport_routes(route_name, route_code)")
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

  return ((students ?? []) as StudentExportRow[]).map((student) => {
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
  await requireStaffPermission("imports:view", { onDenied: "redirect" });

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "update" ? "update" : "add";

  if (mode === "update") {
    const workbook = buildUpdateStudentsTemplateWorkbook(await buildUpdateRows());
    return xlsxResponse(workbookToXlsxBuffer(workbook), "student-update-template.xlsx");
  }

  const { classOptions, routeOptions, currentSessionLabel } = await getMasterDataOptions();
  const currentSessionClasses = currentSessionLabel
    ? classOptions.filter((item) => item.sessionLabel === currentSessionLabel)
    : classOptions;
  const classesForTemplate = currentSessionClasses.length > 0 ? currentSessionClasses : classOptions;

  const workbook = buildAddStudentsTemplateWorkbook(
    classesForTemplate.map((item) => ({ label: item.label })),
    routeOptions.filter((item) => item.isActive).map((item) => ({
      label: item.routeCode ? `${item.label} (${item.routeCode})` : item.label,
    })),
  );

  return xlsxResponse(workbookToXlsxBuffer(workbook), "student-add-template.xlsx");
}

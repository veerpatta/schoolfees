import { studentImportFieldDefinitions } from "@/lib/import/mapping";
import { requireStaffPermission } from "@/lib/supabase/session";

function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export async function GET() {
  await requireStaffPermission("imports:view", { onDenied: "redirect" });

  const headers = studentImportFieldDefinitions.map((field) => field.label);
  const sample = studentImportFieldDefinitions.map((field) => {
    switch (field.key) {
      case "fullName":
        return "Student Name";
      case "classLabel":
        return "Class 1";
      case "admissionNo":
        return "SR001";
      case "studentTypeOverride":
        return "existing";
      case "status":
        return "active";
      case "discountAmount":
      case "lateFeeWaiverAmount":
        return "0";
      default:
        return "";
    }
  });
  const csv = [headers, sample]
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
    .join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="student-import-template.csv"',
    },
  });
}

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
        return "Test Student 001";
      case "classLabel":
        return "TEST CLASS 1";
      case "admissionNo":
        return "TEST-SR-001";
      case "fatherPhone":
      case "motherPhone":
        return "9999999999";
      case "transportRouteLabel":
        return "TEST ROUTE";
      case "studentTypeOverride":
        return "existing";
      case "status":
        return "active";
      case "discountAmount":
      case "lateFeeWaiverAmount":
        return "0";
      case "feeProfileReason":
        return "UAT dummy record";
      case "notes":
        return "Dummy UAT record only";
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

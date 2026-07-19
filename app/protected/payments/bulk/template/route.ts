import { workbookToXlsxBuffer } from "@/lib/import/templates";
import { PAYMENT_TEMPLATE_HEADERS } from "@/lib/payments/bulk/types";
import { getAuthenticatedStaff, hasStaffPermission } from "@/lib/supabase/session";

export async function GET() {
  const staff = await getAuthenticatedStaff();
  if (!staff || !hasStaffPermission(staff, "payments:bulk")) {
    return new Response("Forbidden", { status: 403 });
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  const fillSheet = XLSX.utils.aoa_to_sheet([
    [...PAYMENT_TEMPLATE_HEADERS],
  ]);
  fillSheet["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(workbook, fillSheet, "Fill Payments Here");

  const readmeSheet = XLSX.utils.aoa_to_sheet([
    ["Bulk payment upload — how to fill this file"],
    [""],
    ["SR no", "The student's admission number exactly as it appears in the app."],
    ["Amount", "Whole rupees, greater than 0. No commas or currency symbols."],
    ["Payment date", "Date the money was received (DD-MM-YYYY or YYYY-MM-DD). Cannot be in the future."],
    ["Payment mode", "One of: Cash, UPI, Bank transfer, Cheque."],
    ["Remarks", "Optional note. Receipts posted from this file are tagged [Bulk upload]."],
    [""],
    ["Rules"],
    ["- Maximum 200 rows per file."],
    ["- Every row posts through the same checks as the Payment Desk (duplicate protection included)."],
    ["- Rows with problems are shown for review before anything is posted."],
    ["- Do not include discounts or late-fee waivers here — use the Payment Desk for those."],
  ]);
  readmeSheet["!cols"] = [{ wch: 16 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(workbook, readmeSheet, "Read Me");

  const exampleSheet = XLSX.utils.aoa_to_sheet([
    [...PAYMENT_TEMPLATE_HEADERS],
    ["2486", 6300, "01-07-2026", "Cash", "Installment 2"],
    ["2364", 19500, "30-06-2026", "Bank transfer", ""],
  ]);
  exampleSheet["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(workbook, exampleSheet, "Examples");

  const buffer = await workbookToXlsxBuffer(workbook);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="bulk-payments-template.xlsx"',
      "cache-control": "no-store",
    },
  });
}

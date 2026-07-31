import { PAYMENT_IMPORT_MAX_ROWS, PAYMENT_TEMPLATE_HEADERS } from "./types";

type XlsxModule = typeof import("xlsx");
type XlsxWorkBook = import("xlsx").WorkBook;
type XlsxWorkSheet = import("xlsx").WorkSheet;

const TEMPLATE_COLUMNS = [
  {
    header: "SR no",
    width: 16,
    instruction:
      "Required. Copy the exact student SR/admission number. For leading zeroes, keep the cell as Text.",
    example: "TEST-2486",
  },
  {
    header: "Amount",
    width: 14,
    instruction: "Required. Whole rupees greater than 0. Do not add ₹ signs or commas.",
    example: 6300,
  },
  {
    header: "Payment date",
    width: 18,
    instruction:
      "Required. Date money was received. Use DD-MM-YYYY or YYYY-MM-DD; no future dates.",
    example: "01-07-2026",
  },
  {
    header: "Payment mode",
    width: 18,
    instruction: "Required. Use exactly Cash, UPI, Bank transfer, or Cheque.",
    example: "Cash",
  },
  {
    header: "Remarks",
    width: 38,
    instruction:
      "Optional. Add a short office note or reference. Do not enter discounts or waivers here.",
    example: "Installment 2",
  },
] as const;

function addHeaderComments(sheet: XlsxWorkSheet, XLSX: XlsxModule) {
  TEMPLATE_COLUMNS.forEach((column, index) => {
    const address = XLSX.utils.encode_cell({ r: 0, c: index });
    const cell = sheet[address];
    if (!cell) return;
    cell.c = [{ a: "VPPS Payment Desk", t: column.instruction }];
  });
}

function setPaymentSheetLayout(sheet: XlsxWorkSheet) {
  sheet["!cols"] = TEMPLATE_COLUMNS.map((column) => ({ wch: column.width }));
  sheet["!autofilter"] = { ref: `A1:E${PAYMENT_IMPORT_MAX_ROWS + 1}` };
}

export async function buildPaymentImportTemplateWorkbook(): Promise<XlsxWorkBook> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: "VPPS Bulk Payment Upload Template",
    Subject: "Guided template for staging and reviewing bulk payment entries",
    Author: "Shri Veer Patta Senior Secondary School",
    Comments: "Upload only through Payment Desk > Bulk payment upload.",
  };

  const fillSheet = XLSX.utils.aoa_to_sheet([[...PAYMENT_TEMPLATE_HEADERS]]);
  setPaymentSheetLayout(fillSheet);
  addHeaderComments(fillSheet, XLSX);
  XLSX.utils.book_append_sheet(workbook, fillSheet, "Fill Payments Here");

  const readmeSheet = XLSX.utils.aoa_to_sheet([
    ["VPPS BULK PAYMENT UPLOAD — START HERE"],
    ["Use this workbook only from Payment Desk > Bulk payment upload."],
    [""],
    ["SAFE 3-STEP CHECKLIST"],
    ["1", "Fill only the first sheet, one payment per row. Keep the header row unchanged."],
    [
      "2",
      "Upload the file, then review every matched student, payment date, mode, and the selected total.",
    ],
    [
      "3",
      "Confirm duplicate warnings only when they are genuinely separate collections, then post the selected rows.",
    ],
    [""],
    ["COLUMN", "WHAT TO ENTER", "EXAMPLE"],
    ...TEMPLATE_COLUMNS.map((column) => [
      column.header,
      column.instruction,
      column.example,
    ]),
    [""],
    ["ACCEPTED PAYMENT MODES", "Cash | UPI | Bank transfer | Cheque"],
    ["ACCEPTED DATE FORMATS", "DD-MM-YYYY or YYYY-MM-DD"],
    ["UPLOAD LIMIT", `${PAYMENT_IMPORT_MAX_ROWS} payment rows per file`],
    [""],
    ["BEFORE YOU POST"],
    ["• Confirm the academic session shown on screen."],
    ["• Compare the selected row count and total with the collection register/bank summary."],
    ["• Resolve red error rows in the workbook and upload a corrected file."],
    ["• A yellow duplicate warning never posts until a staff member confirms it."],
    ["• A refresh-safe batch link is kept in the address bar until you start over."],
    [""],
    ["DO NOT"],
    ["• Do not add, rename, reorder, or merge columns on the first sheet."],
    ["• Keep SR numbers with leading zeroes as Text; do not let Excel remove the zeroes."],
    ["• Do not paste ₹ symbols, commas, formulas, discounts, or late-fee waivers."],
    ["• Do not upload the Examples or Read Me sheets; the app reads the first sheet only."],
    ["• Do not use real students while rehearsing. Use TEST- students in TEST-2026-27."],
    [""],
    ["HOW SAFETY WORKS"],
    [
      "The upload only stages rows. Nothing posts until an authorised staff member reviews the matches, selects rows, checks the total, and confirms posting.",
    ],
    [
      "Each posted row uses the same idempotency, duplicate protection, receipt creation, and append-only history as a normal Payment Desk entry.",
    ],
  ]);
  readmeSheet["!cols"] = [{ wch: 30 }, { wch: 96 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(workbook, readmeSheet, "Read Me");

  const exampleSheet = XLSX.utils.aoa_to_sheet([
    [...PAYMENT_TEMPLATE_HEADERS],
    ["TEST-2486", 6300, "01-07-2026", "Cash", "Installment 2"],
    ["TEST-2364", 19500, "30-06-2026", "Bank transfer", "Bank ref 4831"],
    ["TEST-2210", 5000, "29-06-2026", "UPI", "UPI ref 9920"],
  ]);
  setPaymentSheetLayout(exampleSheet);
  addHeaderComments(exampleSheet, XLSX);
  XLSX.utils.book_append_sheet(workbook, exampleSheet, "Examples — do not upload");

  const fieldGuideSheet = XLSX.utils.aoa_to_sheet([
    ["FIELD", "REQUIRED?", "VALID VALUES / RULE", "COMMON MISTAKE"],
    ["SR no", "Yes", "Exact SR/admission number from Students", "Student name entered instead"],
    ["Amount", "Yes", "Whole rupees greater than 0", "₹6,300 or a formula"],
    [
      "Payment date",
      "Yes",
      "DD-MM-YYYY or YYYY-MM-DD; today or earlier",
      "Future date",
    ],
    [
      "Payment mode",
      "Yes",
      "Cash, UPI, Bank transfer, Cheque",
      "Card or free-text bank name",
    ],
    ["Remarks", "No", "Short collection note/reference", "Discount or waiver instruction"],
  ]);
  fieldGuideSheet["!cols"] = [{ wch: 20 }, { wch: 14 }, { wch: 55 }, { wch: 38 }];
  XLSX.utils.book_append_sheet(workbook, fieldGuideSheet, "Field Guide");

  return workbook;
}

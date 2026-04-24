import * as XLSX from "xlsx";

export type ImportTemplateOption = {
  label: string;
};

export type UpdateTemplateStudent = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  classLabel: string;
  fatherName: string | null;
  fatherPhone: string | null;
  transportRouteLabel: string | null;
  studentTypeLabel: "New" | "Existing";
  tuitionOverride: number | null;
  transportOverride: number | null;
  discountAmount: number;
  lateFeeWaiverAmount: number;
  otherAdjustmentHead: string | null;
  otherAdjustmentAmount: number | null;
  notes: string | null;
};

export const ADD_TEMPLATE_HEADERS = [
  "Student name",
  "Class",
  "SR no",
  "Father name",
  "Phone",
  "Route",
  "New/Old",
  "Notes",
] as const;

export const UPDATE_TEMPLATE_HEADERS = [
  "Student ID",
  "SR no",
  "Student name",
  "Class",
  "Father name",
  "Phone",
  "Route",
  "New/Old",
  "Tuition override",
  "Transport override",
  "Discount",
  "Late fee waiver",
  "Other adjustment head",
  "Other adjustment amount",
  "Notes",
] as const;

function buildExampleRows(classes: readonly ImportTemplateOption[], routes: readonly ImportTemplateOption[]) {
  const classLabel = classes[0]?.label ?? "";
  const routeLabel = routes[0]?.label ?? "";

  return [
    ["Example only - remove from upload sheet", "Use real class names from the app"],
    ["Student name", "Class", "SR no", "Father name", "Phone", "Route", "New/Old", "Notes"],
    ["Asha Sharma", classLabel, "SR-001", "Father Name", "9999999999", routeLabel, "Existing", "Optional note"],
    ["Ravi Singh", classLabel, "", "", "", "", "New", "Blank SR no will get temporary SR no"],
  ];
}

function appendListsSheet(
  workbook: XLSX.WorkBook,
  classes: readonly ImportTemplateOption[],
  routes: readonly ImportTemplateOption[],
) {
  const maxRows = Math.max(classes.length, routes.length, 1);
  const rows = [["Classes", "Routes", "New/Old"]];

  for (let index = 0; index < maxRows; index += 1) {
    rows.push([
      classes[index]?.label ?? "",
      routes[index]?.label ?? "",
      index === 0 ? "New" : index === 1 ? "Existing" : "",
    ]);
  }

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Current Lists");
}

export function buildAddStudentsTemplateWorkbook(
  classes: readonly ImportTemplateOption[],
  routes: readonly ImportTemplateOption[],
) {
  const workbook = XLSX.utils.book_new();
  const fillSheet = XLSX.utils.aoa_to_sheet([[...ADD_TEMPLATE_HEADERS]]);
  const exampleSheet = XLSX.utils.aoa_to_sheet(buildExampleRows(classes, routes));

  XLSX.utils.book_append_sheet(workbook, fillSheet, "Fill Students Here");
  XLSX.utils.book_append_sheet(workbook, exampleSheet, "Examples");
  appendListsSheet(workbook, classes, routes);

  return workbook;
}

export function buildUpdateStudentsTemplateWorkbook(rows: readonly UpdateTemplateStudent[]) {
  const workbook = XLSX.utils.book_new();
  const sheetRows = [
    [...UPDATE_TEMPLATE_HEADERS],
    ...rows.map((student) => [
      student.studentId,
      student.admissionNo,
      student.fullName,
      student.classLabel,
      student.fatherName ?? "",
      student.fatherPhone ?? "",
      student.transportRouteLabel ?? "",
      student.studentTypeLabel,
      student.tuitionOverride ?? "",
      student.transportOverride ?? "",
      student.discountAmount || "",
      student.lateFeeWaiverAmount || "",
      student.otherAdjustmentHead ?? "",
      student.otherAdjustmentAmount ?? "",
      student.notes ?? "",
    ]),
  ];

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheetRows), "Update Students Here");

  return workbook;
}

export function workbookToXlsxBuffer(workbook: XLSX.WorkBook) {
  return XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  }) as Buffer;
}

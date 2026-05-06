import * as XLSX from "xlsx";

export type ImportTemplateOption = {
  label: string;
};

export type UpdateTemplateWorkbookOptions = {
  classes?: readonly ImportTemplateOption[];
  routes?: readonly ImportTemplateOption[];
  conventionalPolicies?: readonly ImportTemplateOption[];
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
  "Conventional Policy 1",
  "Conventional Policy 2",
  "Family Group / Sibling Group",
  "Policy Notes",
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
  "Conventional Policy 1",
  "Conventional Policy 2",
  "Family Group / Sibling Group",
  "Policy Notes",
  "Special-case reason",
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
    [
      "Student name",
      "Class",
      "SR no",
      "Father name",
      "Phone",
      "Route",
      "New/Old",
      "Conventional Policy 1",
      "Conventional Policy 2",
      "Family Group / Sibling Group",
      "Policy Notes",
      "Notes",
    ],
    [
      "Asha Sharma",
      classLabel,
      "SR-001",
      "Father Name",
      "9999999999",
      routeLabel,
      "Existing",
      "Staff Child",
      "",
      "",
      "Approved by office",
      "Optional note",
    ],
    ["Ravi Singh", classLabel, "", "", "", "", "New", "", "", "", "", "Blank SR no will get temporary SR no"],
  ];
}

function setSheetLayout(
  sheet: XLSX.WorkSheet,
  columnWidths: readonly number[],
) {
  sheet["!cols"] = columnWidths.map((wch) => ({ wch }));
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
}

function appendListsSheet(
  workbook: XLSX.WorkBook,
  classes: readonly ImportTemplateOption[],
  routes: readonly ImportTemplateOption[],
  conventionalPolicies: readonly ImportTemplateOption[] = [],
) {
  const maxRows = Math.max(classes.length, routes.length, conventionalPolicies.length, 2);
  const rows = [["Classes", "Routes", "New/Old", "Conventional Policies"]];

  for (let index = 0; index < maxRows; index += 1) {
    rows.push([
      classes[index]?.label ?? "",
      routes[index]?.label ?? "",
      index === 0 ? "New" : index === 1 ? "Existing" : "",
      conventionalPolicies[index]?.label ?? "",
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  setSheetLayout(sheet, [28, 32, 14, 28]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Current Lists");
}

function buildUpdateInstructionsRows() {
  return [
    ["Bulk Update Students - Read Me"],
    [""],
    ["Use this file only for updating existing students already in Student Master."],
    ["Do not edit Student ID unless an admin specifically tells you to."],
    ["SR no can help match the student if Student ID is present and unchanged."],
    ["Student name is for checking only. The app never uses name alone to update a student."],
    ["Leave an optional cell blank if no change is needed for that student."],
    ["Class and Route must match the Current Lists sheet exactly. Route code format such as Main Route (MR) is accepted when shown."],
    ["Use only New or Existing in the New/Old column."],
    ["Use only active school policies from Current Lists for Conventional Policy 1 and 2."],
    ["Do not use this file for payments, receipts, dues resets, deleting students, or changing financial history."],
    ["After upload, the app will still check rows and staff must review before importing valid students."],
  ];
}

function buildUpdateExampleRows(options: Required<UpdateTemplateWorkbookOptions>) {
  const classLabel = options.classes[0]?.label ?? "Class 1";
  const routeLabel = options.routes[0]?.label ?? "Main Route";
  const policyLabel = options.conventionalPolicies[0]?.label ?? "Staff Child";

  return [
    ["Example only - copy the idea, do not upload this sheet"],
    [...UPDATE_TEMPLATE_HEADERS],
    [
      "student-id-kept-same",
      "SR001",
      "Asha Sharma",
      classLabel,
      "",
      "9999999999",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Change phone only",
    ],
    [
      "student-id-kept-same",
      "SR002",
      "Ravi Singh",
      classLabel,
      "",
      "",
      routeLabel,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Change route using Current Lists",
    ],
    [
      "student-id-kept-same",
      "SR003",
      "Meena Kumari",
      classLabel,
      "",
      "",
      "",
      "Existing",
      policyLabel,
      "",
      "",
      "Approved by office",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Mark New/Old and policy",
    ],
    [
      "student-id-kept-same",
      "SR004",
      "Karan Joshi",
      classLabel,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Approved tuition exception",
      "25000",
      "",
      "",
      "",
      "",
      "",
      "Tuition override with reason",
    ],
  ];
}

export function buildAddStudentsTemplateWorkbook(
  classes: readonly ImportTemplateOption[],
  routes: readonly ImportTemplateOption[],
) {
  const workbook = XLSX.utils.book_new();
  const fillSheet = XLSX.utils.aoa_to_sheet([[...ADD_TEMPLATE_HEADERS]]);
  const exampleSheet = XLSX.utils.aoa_to_sheet(buildExampleRows(classes, routes));
  setSheetLayout(fillSheet, [24, 24, 16, 24, 16, 28, 14, 24, 24, 30, 30, 28]);
  setSheetLayout(exampleSheet, [26, 24, 16, 24, 16, 28, 14, 24, 24, 30, 30, 36]);

  XLSX.utils.book_append_sheet(workbook, fillSheet, "Fill Students Here");
  XLSX.utils.book_append_sheet(workbook, exampleSheet, "Examples");
  appendListsSheet(workbook, classes, routes);

  return workbook;
}

export function buildUpdateStudentsTemplateWorkbook(
  rows: readonly UpdateTemplateStudent[],
  options: UpdateTemplateWorkbookOptions = {},
) {
  const workbook = XLSX.utils.book_new();
  const resolvedOptions: Required<UpdateTemplateWorkbookOptions> = {
    classes: options.classes ?? [],
    routes: options.routes ?? [],
    conventionalPolicies: options.conventionalPolicies ?? [],
  };
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
      "",
      "",
      "",
      "",
      "",
      student.tuitionOverride ?? "",
      student.transportOverride ?? "",
      student.discountAmount || "",
      student.lateFeeWaiverAmount || "",
      student.otherAdjustmentHead ?? "",
      student.otherAdjustmentAmount ?? "",
      student.notes ?? "",
    ]),
  ];
  const updateSheet = XLSX.utils.aoa_to_sheet(sheetRows);
  setSheetLayout(updateSheet, [
    38,
    16,
    28,
    24,
    24,
    16,
    28,
    14,
    24,
    24,
    30,
    30,
    32,
    16,
    18,
    14,
    18,
    26,
    22,
    32,
  ]);

  const readMeSheet = XLSX.utils.aoa_to_sheet(buildUpdateInstructionsRows());
  setSheetLayout(readMeSheet, [120]);

  const exampleSheet = XLSX.utils.aoa_to_sheet(buildUpdateExampleRows(resolvedOptions));
  setSheetLayout(exampleSheet, [
    24,
    14,
    24,
    22,
    20,
    16,
    28,
    14,
    22,
    22,
    28,
    28,
    30,
    16,
    18,
    14,
    18,
    24,
    22,
    34,
  ]);

  XLSX.utils.book_append_sheet(workbook, updateSheet, "Update Students Here");
  XLSX.utils.book_append_sheet(workbook, readMeSheet, "Read Me");
  XLSX.utils.book_append_sheet(workbook, exampleSheet, "Examples");
  appendListsSheet(
    workbook,
    resolvedOptions.classes,
    resolvedOptions.routes,
    resolvedOptions.conventionalPolicies,
  );

  return workbook;
}

export function workbookToXlsxBuffer(workbook: XLSX.WorkBook) {
  return XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  }) as Buffer;
}

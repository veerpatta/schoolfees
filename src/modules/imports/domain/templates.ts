import { applyListValidations, type ListValidation } from "@/platform/excel/data-validation";
import { STUDENT_INFO_FIELDS } from "@/modules/students/domain/info-fields";

export type ImportTemplateOption = {
  label: string;
};

type XlsxModule = typeof import("xlsx");
type XlsxWorkBook = import("xlsx").WorkBook;
type XlsxWorkSheet = import("xlsx").WorkSheet;

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

/**
 * The information columns, in catalogue order.
 *
 * The same strings the Student Master export writes and the bulk-update sheet
 * uses, because they all read `field.header`. A round trip — export, edit in
 * Excel, re-upload — only works if those three agree.
 */
const STUDENT_INFO_HEADERS = STUDENT_INFO_FIELDS.map((field) => field.header);

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
  // Appended, never inserted: buildStudentTemplateValidations pins the class,
  // route, New/Old and policy dropdowns to fixed column numbers, so anything
  // added ahead of them silently moves a dropdown onto the wrong column.
  ...STUDENT_INFO_HEADERS,
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
  ...STUDENT_INFO_HEADERS,
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
  sheet: XlsxWorkSheet,
  columnWidths: readonly number[],
) {
  sheet["!cols"] = columnWidths.map((wch) => ({ wch }));
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
}

export const LISTS_SHEET_NAME = "Current Lists";
export const ADD_TEMPLATE_SHEET_NAME = "Fill Students Here";
export const UPDATE_TEMPLATE_SHEET_NAME = "Update Students Here";

/**
 * Rows a dropdown covers. Generous on purpose: staff paste extra rows below the
 * pre-filled ones and the dropdown has to reach them too.
 */
const DROPDOWN_LAST_ROW = 2000;

/** Column positions on the "Current Lists" sheet, 1-based. */
const LIST_COLUMNS = {
  classes: 1,
  routes: 2,
  newOld: 3,
  conventionalPolicies: 4,
} as const;

/**
 * Builds the dropdown spec for a student template. Each list points at its own
 * exact range rather than one padded block, otherwise the shorter lists show a
 * tail of blank entries in the dropdown.
 *
 * A list with no entries is skipped: an empty range is not a valid source and
 * would make Excel report the file as corrupt.
 */
function buildStudentTemplateValidations(payload: {
  sheetName: string;
  columns: { class: number; route: number; newOld: number; policy1: number; policy2: number };
  classes: readonly ImportTemplateOption[];
  routes: readonly ImportTemplateOption[];
  conventionalPolicies: readonly ImportTemplateOption[];
  lastRow: number;
}): ListValidation[] {
  const shared = {
    sheetName: payload.sheetName,
    sourceSheetName: LISTS_SHEET_NAME,
    sourceFirstRow: 2,
    targetFirstRow: 2,
    targetLastRow: payload.lastRow,
  };

  const validations: ListValidation[] = [];

  if (payload.classes.length > 0) {
    validations.push({
      ...shared,
      sourceColumn: LIST_COLUMNS.classes,
      sourceLastRow: payload.classes.length + 1,
      targetColumn: payload.columns.class,
      definedName: "VPPS_Classes",
      prompt: "Pick a class that exists in this academic session.",
      error: "That class is not in the school's class list for this session.",
      strict: true,
    });
  }

  if (payload.routes.length > 0) {
    validations.push({
      ...shared,
      sourceColumn: LIST_COLUMNS.routes,
      sourceLastRow: payload.routes.length + 1,
      targetColumn: payload.columns.route,
      definedName: "VPPS_Routes",
      prompt: "Pick a transport route, or leave blank for no transport.",
      error: "That route is not in the school's route list.",
    });
  }

  validations.push({
    ...shared,
    sourceColumn: LIST_COLUMNS.newOld,
    sourceLastRow: 3, // exactly two values: New, Existing
    targetColumn: payload.columns.newOld,
    definedName: "VPPS_StudentType",
    prompt: "New = first year at the school. Existing = continuing student.",
    error: "Type must be New or Existing.",
    strict: true,
  });

  if (payload.conventionalPolicies.length > 0) {
    validations.push(
      {
        ...shared,
        sourceColumn: LIST_COLUMNS.conventionalPolicies,
        sourceLastRow: payload.conventionalPolicies.length + 1,
        targetColumn: payload.columns.policy1,
        definedName: "VPPS_Policies1",
        prompt: "Pick an active discount policy, or leave blank.",
        error: "That policy is not active for this year.",
      },
      {
        ...shared,
        sourceColumn: LIST_COLUMNS.conventionalPolicies,
        sourceLastRow: payload.conventionalPolicies.length + 1,
        targetColumn: payload.columns.policy2,
        definedName: "VPPS_Policies2",
        prompt: "Second policy only if the student genuinely has two.",
        error: "That policy is not active for this year.",
      },
    );
  }

  return validations;
}

function appendListsSheet(
  XLSX: XlsxModule,
  workbook: XlsxWorkBook,
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
  XLSX.utils.book_append_sheet(workbook, sheet, LISTS_SHEET_NAME);
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

export async function buildAddStudentsTemplateWorkbook(
  classes: readonly ImportTemplateOption[],
  routes: readonly ImportTemplateOption[],
  conventionalPolicies: readonly ImportTemplateOption[] = [],
) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const fillSheet = XLSX.utils.aoa_to_sheet([[...ADD_TEMPLATE_HEADERS]]);
  const exampleSheet = XLSX.utils.aoa_to_sheet(buildExampleRows(classes, routes));
  setSheetLayout(fillSheet, [24, 24, 16, 24, 16, 28, 14, 24, 24, 30, 30, 28]);
  setSheetLayout(exampleSheet, [26, 24, 16, 24, 16, 28, 14, 24, 24, 30, 30, 36]);

  XLSX.utils.book_append_sheet(workbook, fillSheet, ADD_TEMPLATE_SHEET_NAME);
  XLSX.utils.book_append_sheet(workbook, exampleSheet, "Examples");
  appendListsSheet(XLSX, workbook, classes, routes, conventionalPolicies);

  return workbook;
}

export async function buildUpdateStudentsTemplateWorkbook(
  rows: readonly UpdateTemplateStudent[],
  options: UpdateTemplateWorkbookOptions = {},
) {
  const XLSX = await import("xlsx");
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

  XLSX.utils.book_append_sheet(workbook, updateSheet, UPDATE_TEMPLATE_SHEET_NAME);
  XLSX.utils.book_append_sheet(workbook, readMeSheet, "Read Me");
  XLSX.utils.book_append_sheet(workbook, exampleSheet, "Examples");
  appendListsSheet(
    XLSX,
    workbook,
    resolvedOptions.classes,
    resolvedOptions.routes,
    resolvedOptions.conventionalPolicies,
  );

  return workbook;
}

export async function workbookToXlsxBuffer(workbook: XlsxWorkBook) {
  const XLSX = await import("xlsx");

  return XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  }) as Buffer;
}

/**
 * Writes a workbook and stamps the dropdowns on. SheetJS cannot emit data
 * validations itself, so this is always a two-step: write, then patch the zip.
 */
export async function workbookToValidatedXlsxBuffer(
  workbook: XlsxWorkBook,
  validations: readonly ListValidation[],
) {
  const raw = await workbookToXlsxBuffer(workbook);

  return Buffer.from(applyListValidations(new Uint8Array(raw), validations));
}

/** Ready-to-download Add template, dropdowns included. */
export async function buildAddStudentsTemplateFile(
  classes: readonly ImportTemplateOption[],
  routes: readonly ImportTemplateOption[],
  conventionalPolicies: readonly ImportTemplateOption[] = [],
) {
  const workbook = await buildAddStudentsTemplateWorkbook(classes, routes, conventionalPolicies);

  return workbookToValidatedXlsxBuffer(
    workbook,
    buildStudentTemplateValidations({
      sheetName: ADD_TEMPLATE_SHEET_NAME,
      // Student name, Class, SR no, Father name, Phone, Route, New/Old, Policy 1, Policy 2, ...
      columns: { class: 2, route: 6, newOld: 7, policy1: 8, policy2: 9 },
      classes,
      routes,
      conventionalPolicies,
      lastRow: DROPDOWN_LAST_ROW,
    }),
  );
}

/** Ready-to-download Update template, dropdowns included. */
export async function buildUpdateStudentsTemplateFile(
  rows: readonly UpdateTemplateStudent[],
  options: UpdateTemplateWorkbookOptions = {},
) {
  const workbook = await buildUpdateStudentsTemplateWorkbook(rows, options);

  return workbookToValidatedXlsxBuffer(
    workbook,
    buildStudentTemplateValidations({
      sheetName: UPDATE_TEMPLATE_SHEET_NAME,
      // Student ID, SR no, Student name, Class, Father name, Phone, Route, New/Old, Policy 1, Policy 2, ...
      columns: { class: 4, route: 7, newOld: 8, policy1: 9, policy2: 10 },
      classes: options.classes ?? [],
      routes: options.routes ?? [],
      conventionalPolicies: options.conventionalPolicies ?? [],
      lastRow: Math.max(rows.length + 1, DROPDOWN_LAST_ROW),
    }),
  );
}

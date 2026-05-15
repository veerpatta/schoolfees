import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";

const DEFAULT_MEMBER_FILE = "D:/Downloads/Member_List_2026-05-14_084051.xlsx";
const DEFAULT_DUES_FILE = "D:/Downloads/Custom_Report_2026-05-14_201835.xlsx";
const DEFAULT_OUTPUT_DIR = "docs/import-previews/2026-05-14-latest-excel-dry-run";

const CLASS_ORDER = [
  "Nursery",
  "JKG",
  "SKG",
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "Class 7",
  "Class 8",
  "Class 9",
  "Class 10",
  "11 Arts",
  "11 Commerce",
  "11 Science",
  "12 Arts",
  "12 Commerce",
  "12 Science",
];

const CLASS_ALIASES = new Map([
  ["nursery", "Nursery"],
  ["jkg", "JKG"],
  ["lkg", "JKG"],
  ["skg", "SKG"],
  ["ukg", "SKG"],
  ...Array.from({ length: 10 }, (_, index) => {
    const value = index + 1;
    return [
      [`class${value}`, `Class ${value}`],
      [`${value}`, `Class ${value}`],
    ];
  }).flat(),
  ["11arts", "11 Arts"],
  ["class11arts", "11 Arts"],
  ["xiarts", "11 Arts"],
  ["11commerce", "11 Commerce"],
  ["class11commerce", "11 Commerce"],
  ["xicommerce", "11 Commerce"],
  ["11science", "11 Science"],
  ["class11science", "11 Science"],
  ["xiscience", "11 Science"],
  ["12arts", "12 Arts"],
  ["class12arts", "12 Arts"],
  ["xiiarts", "12 Arts"],
  ["12commerce", "12 Commerce"],
  ["class12commerce", "12 Commerce"],
  ["xiicommerce", "12 Commerce"],
  ["12science", "12 Science"],
  ["class12science", "12 Science"],
  ["xiiscience", "12 Science"],
]);

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    memberFile: DEFAULT_MEMBER_FILE,
    duesFile: DEFAULT_DUES_FILE,
    outputDir: DEFAULT_OUTPUT_DIR,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--members" && next) {
      result.memberFile = next;
      index += 1;
    } else if (arg === "--dues" && next) {
      result.duesFile = next;
      index += 1;
    } else if (arg === "--out" && next) {
      result.outputDir = next;
      index += 1;
    }
  }

  return result;
}

function readSheetMatrix(file) {
  const workbook = XLSX.readFile(file, {
    cellDates: true,
    raw: true,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error(`No worksheet found in ${file}`);
  }
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
  return { sheetName, rows };
}

function stringify(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

function normalizeToken(value) {
  return stringify(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeName(value) {
  return stringify(value)
    .toUpperCase()
    .replace(/\s*\.\s*/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAdmission(value) {
  const raw = stringify(value);
  if (!raw) {
    return "";
  }
  return raw.replace(/\.0$/, "").trim();
}

function normalizePhone(value, code = "") {
  const digits = `${stringify(code)}${stringify(value)}`.replace(/\D+/g, "");
  if (!digits) {
    return "";
  }
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function parseAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  const raw = stringify(value).replace(/,/g, "");
  if (!raw) {
    return 0;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function parseHeaderRows(rows, requiredHeader) {
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => stringify(cell).toLowerCase() === requiredHeader.toLowerCase()),
  );
  if (headerIndex < 0) {
    throw new Error(`Header "${requiredHeader}" was not found.`);
  }
  const headers = rows[headerIndex].map((cell, index) => stringify(cell) || `Column ${index + 1}`);
  return rows.slice(headerIndex + 1).map((row, offset) => ({
    rowNumber: headerIndex + offset + 2,
    values: Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])),
  }));
}

function extractCurrentClass(groupName) {
  const group = stringify(groupName);
  const currentPart = group
    .split(",")
    .map((part) => part.trim())
    .find((part) => /AY\s*2026-?27/i.test(part));

  if (!currentPart) {
    return null;
  }

  const cleaned = currentPart
    .replace(/AY\s*2026-?27/ig, "")
    .replace(/\band\b/ig, " ")
    .trim();
  const direct = CLASS_ALIASES.get(normalizeToken(cleaned));
  if (direct) {
    return direct;
  }

  for (const classLabel of CLASS_ORDER) {
    if (normalizeToken(cleaned).includes(normalizeToken(classLabel))) {
      return classLabel;
    }
  }

  return null;
}

function classifySession(groupName) {
  const group = stringify(groupName);
  if (/AY\s*2026-?27/i.test(group)) {
    return "2026-27";
  }
  if (/2025-?26|25-?26|old/i.test(group)) {
    return "2025-26";
  }
  return "review";
}

function normalizeMembers(memberRows) {
  return memberRows
    .filter(({ values }) => stringify(values.name) || stringify(values.admissionNumber))
    .map(({ rowNumber, values }) => {
      const primaryMobile = normalizePhone(values.primaryNumber, values.primaryNumberCode);
      const alternateMobile = normalizePhone(values.altNumber, values.altNumberCode);
      const admissionNo = normalizeAdmission(values.admissionNumber);
      const classLabel = extractCurrentClass(values.group);
      return {
        rowNumber,
        admissionNo,
        studentName: stringify(values.name),
        normalizedName: normalizeName(values.name),
        classLabel,
        groupName: stringify(values.group),
        guardianName: stringify(values.guardianName),
        primaryMobile,
        alternateMobile,
        dateOfBirth: stringify(values.dateOfBirth),
        fallbackKey: `${normalizeName(values.name)}|${classLabel ?? ""}|${primaryMobile}`,
      };
    });
}

function normalizeDues(duesRows) {
  return duesRows
    .filter(({ values }) => stringify(values.Name) || stringify(values["Admission Number"]))
    .map(({ rowNumber, values }) => {
      const admissionNo = normalizeAdmission(values["Admission Number"]);
      const groupName = stringify(values["Group Name"]);
      const sessionLabel = classifySession(groupName);
      const classLabel = extractCurrentClass(groupName);
      const paidTillDate = parseAmount(values["Amount Paid Till Date"]);
      const remainingAmount = parseAmount(values["Remaining Amount"]);
      const fineAmount = parseAmount(values["Fine Amount"]);
      const totalDueAmount = remainingAmount > 0 ? remainingAmount + fineAmount : 0;
      const status =
        remainingAmount <= 0
          ? "fully_paid_or_no_due"
          : paidTillDate > 0
            ? "partially_paid"
            : "not_paid";
      return {
        rowNumber,
        admissionNo,
        studentName: stringify(values.Name),
        normalizedName: normalizeName(values.Name),
        phone: normalizePhone(values["Phone Number"]),
        groupName,
        sessionLabel,
        classLabel,
        dueOn: stringify(values["Due On"]),
        totalAmount: parseAmount(values["Total Amount"]),
        amountPaid: parseAmount(values["Amount Paid"]),
        amountPaidTillDate: paidTillDate,
        remainingAmount,
        fineAmount,
        totalDueAmount,
        status,
        sourceStatus: stringify(values.Status),
        transactionId: stringify(values["Transaction ID"]),
        invoiceId: stringify(values["Invoice ID"]),
        fallbackKey: `${normalizeName(values.Name)}|${classLabel ?? ""}|${normalizePhone(values["Phone Number"])}`,
      };
    });
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) {
      continue;
    }
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return map;
}

function uniqueOpenDueRows(dues) {
  const seen = new Set();
  const duplicates = [];
  const unique = [];

  for (const row of dues.filter((item) => item.remainingAmount > 0)) {
    const key = [
      row.admissionNo,
      row.normalizedName,
      row.groupName,
      row.dueOn,
      row.totalAmount,
      row.amountPaidTillDate,
      row.remainingAmount,
      row.fineAmount,
    ].join("|");
    if (seen.has(key)) {
      duplicates.push(row);
      continue;
    }
    seen.add(key);
    unique.push(row);
  }

  return { unique, duplicates };
}

function toCsvValue(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(file, rows) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const body = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(",")),
  ].join("\n");
  fs.writeFileSync(file, `${body}\n`, "utf8");
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

function main() {
  const { memberFile, duesFile, outputDir } = parseArgs();
  const resolvedOutput = path.resolve(outputDir);
  fs.mkdirSync(resolvedOutput, { recursive: true });

  const memberSheet = readSheetMatrix(memberFile);
  const duesSheet = readSheetMatrix(duesFile);
  const memberRows = normalizeMembers(parseHeaderRows(memberSheet.rows, "name"));
  const duesRows = normalizeDues(parseHeaderRows(duesSheet.rows, "Admission Number"));
  const memberByAdmission = groupBy(memberRows, (row) => row.admissionNo);
  const memberByFallback = groupBy(memberRows, (row) => row.fallbackKey);
  const dueByAdmission = groupBy(duesRows, (row) => row.admissionNo);
  const openDueResult = uniqueOpenDueRows(duesRows);

  const matchedByAdmission = [];
  const matchedByFallback = [];
  const unmatchedDueRows = [];
  const ambiguousFallbackRows = [];

  for (const due of duesRows) {
    if (due.admissionNo && (memberByAdmission.get(due.admissionNo) ?? []).length === 1) {
      matchedByAdmission.push(due);
      continue;
    }
    const fallbackMatches = memberByFallback.get(due.fallbackKey) ?? [];
    if (!due.admissionNo && fallbackMatches.length === 1) {
      matchedByFallback.push(due);
      continue;
    }
    if (!due.admissionNo && fallbackMatches.length > 1) {
      ambiguousFallbackRows.push(due);
      continue;
    }
    unmatchedDueRows.push(due);
  }

  const memberAdmissionDuplicates = [...memberByAdmission.entries()]
    .filter(([admissionNo, rows]) => admissionNo && rows.length > 1)
    .flatMap(([admissionNo, rows]) => rows.map((row) => ({ admissionNo, ...row })));
  const dueAdmissionDuplicates = [...dueByAdmission.entries()]
    .filter(([admissionNo, rows]) => admissionNo && rows.length > 1)
    .flatMap(([admissionNo, rows]) => rows.map((row) => ({ admissionNo, ...row })));

  const phoneGroups = groupBy(
    memberRows.flatMap((row) => [
      row.primaryMobile ? { phone: row.primaryMobile, phoneType: "primary", row } : null,
      row.alternateMobile ? { phone: row.alternateMobile, phoneType: "alternate", row } : null,
    ]).filter(Boolean),
    (entry) => entry.phone,
  );
  const sameMobileGroups = [...phoneGroups.entries()]
    .filter(([, entries]) => new Set(entries.map((entry) => entry.row.admissionNo)).size > 1)
    .flatMap(([phone, entries]) =>
      entries.map((entry) => ({
        phone,
        phoneType: entry.phoneType,
        admissionNo: entry.row.admissionNo,
        studentName: entry.row.studentName,
        classLabel: entry.row.classLabel,
        guardianName: entry.row.guardianName,
      })),
    );

  const openDues = openDueResult.unique;
  const currentDues = openDues.filter((row) => row.sessionLabel === "2026-27");
  const previousDues = openDues.filter((row) => row.sessionLabel === "2025-26");
  const reviewDues = openDues.filter((row) => row.sessionLabel === "review");
  const fullyPaidRows = duesRows.filter((row) => row.remainingAmount <= 0);
  const notPaidRows = openDues.filter((row) => row.status === "not_paid");
  const partialRows = openDues.filter((row) => row.status === "partially_paid");
  const dueAdmissionsMissingFromMembers = [...new Set(
    duesRows
      .filter((row) => row.admissionNo && !(memberByAdmission.get(row.admissionNo) ?? []).length)
      .map((row) => row.admissionNo),
  )];
  const membersWithoutDueRows = memberRows.filter(
    (row) => row.admissionNo && !(dueByAdmission.get(row.admissionNo) ?? []).length,
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    memberFile,
    duesFile,
    memberSheet: memberSheet.sheetName,
    duesSheet: duesSheet.sheetName,
    totalMemberRows: memberRows.length,
    totalDuePaymentRows: duesRows.length,
    uniqueOpenDueRows: openDues.length,
    duplicateOpenDueRowsSkippedFromTotals: openDueResult.duplicates.length,
    studentsMatchedByAdmissionNumber: new Set(matchedByAdmission.map((row) => row.admissionNo)).size,
    dueRowsMatchedByAdmissionNumber: matchedByAdmission.length,
    dueRowsMatchedByFallbackLogic: matchedByFallback.length,
    unmatchedDueRows: unmatchedDueRows.length,
    ambiguousFallbackRows: ambiguousFallbackRows.length,
    dueAdmissionsMissingFromMemberList: dueAdmissionsMissingFromMembers.length,
    memberRowsWithoutAnyDueReportRow: membersWithoutDueRows.length,
    duplicateAdmissionNumbersInMemberList: new Set(memberAdmissionDuplicates.map((row) => row.admissionNo)).size,
    duplicateAdmissionNumbersInDueReport: new Set(dueAdmissionDuplicates.map((row) => row.admissionNo)).size,
    sameMobileSiblingGroups: new Set(sameMobileGroups.map((row) => row.phone)).size,
    sameMobileSiblingRows: sameMobileGroups.length,
    ay2026_27DueTotal: sum(currentDues, "totalDueAmount"),
    previousSessionDueTotal: sum(previousDues, "totalDueAmount"),
    reviewSessionDueTotal: sum(reviewDues, "totalDueAmount"),
    totalDueAmount: sum(openDues, "totalDueAmount"),
    notPaidCount: notPaidRows.length,
    partiallyPaidCount: partialRows.length,
    fullyPaidNoDueCountExcluded: fullyPaidRows.length,
  };

  const duePreviewRows = openDues.map((row) => ({
    rowNumber: row.rowNumber,
    admissionNo: row.admissionNo,
    studentName: row.studentName,
    phone: row.phone,
    classLabel: row.classLabel,
    sessionLabel: row.sessionLabel,
    groupName: row.groupName,
    dueOn: row.dueOn,
    amountPaidTillDate: row.amountPaidTillDate,
    remainingAmount: row.remainingAmount,
    fineAmount: row.fineAmount,
    totalDueAmount: row.totalDueAmount,
    status: row.status,
  }));

  const anomalyRows = [
    ...unmatchedDueRows.map((row) => ({
      type: "unmatched_due_row",
      rowNumber: row.rowNumber,
      admissionNo: row.admissionNo,
      studentName: row.studentName,
      classLabel: row.classLabel,
      phone: row.phone,
      groupName: row.groupName,
      reason: row.admissionNo ? "Admission number not found in Member_List" : "Missing admission number and no safe fallback match",
    })),
    ...ambiguousFallbackRows.map((row) => ({
      type: "ambiguous_fallback_match",
      rowNumber: row.rowNumber,
      admissionNo: row.admissionNo,
      studentName: row.studentName,
      classLabel: row.classLabel,
      phone: row.phone,
      groupName: row.groupName,
      reason: "Multiple Member_List rows matched name + class + mobile",
    })),
    ...memberAdmissionDuplicates.map((row) => ({
      type: "duplicate_member_admission_number",
      rowNumber: row.rowNumber,
      admissionNo: row.admissionNo,
      studentName: row.studentName,
      classLabel: row.classLabel,
      phone: row.primaryMobile,
      groupName: row.groupName,
      reason: "Same admission number appears more than once in Member_List",
    })),
    ...openDueResult.duplicates.map((row) => ({
      type: "duplicate_open_due_row_skipped_from_totals",
      rowNumber: row.rowNumber,
      admissionNo: row.admissionNo,
      studentName: row.studentName,
      classLabel: row.classLabel,
      phone: row.phone,
      groupName: row.groupName,
      reason: "Same open due key repeated in the report",
    })),
  ];

  fs.writeFileSync(
    path.join(resolvedOutput, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(resolvedOutput, "normalized-preview.json"),
    `${JSON.stringify({ summary, members: memberRows, openDues: duePreviewRows }, null, 2)}\n`,
    "utf8",
  );
  writeCsv(path.join(resolvedOutput, "member-import-preview.csv"), memberRows);
  writeCsv(path.join(resolvedOutput, "due-import-preview.csv"), duePreviewRows);
  writeCsv(path.join(resolvedOutput, "anomalies.csv"), anomalyRows);
  writeCsv(path.join(resolvedOutput, "same-mobile-sibling-groups.csv"), sameMobileGroups);
  writeCsv(path.join(resolvedOutput, "members-without-due-report-rows.csv"), membersWithoutDueRows);

  const markdown = [
    "# Latest Excel Dry Run - 2026-05-14",
    "",
    `Member file: ${memberFile}`,
    `Dues/payment file: ${duesFile}`,
    "",
    "No database writes were performed by this dry run.",
    "",
    "## Summary",
    "",
    `- Member rows: ${summary.totalMemberRows}`,
    `- Dues/payment report rows: ${summary.totalDuePaymentRows}`,
    `- Unique open due rows: ${summary.uniqueOpenDueRows}`,
    `- Duplicate open due rows skipped from totals: ${summary.duplicateOpenDueRowsSkippedFromTotals}`,
    `- Due rows matched by admission number: ${summary.dueRowsMatchedByAdmissionNumber}`,
    `- Due rows matched by fallback logic: ${summary.dueRowsMatchedByFallbackLogic}`,
    `- Unmatched due rows: ${summary.unmatchedDueRows}`,
    `- Duplicate admission numbers in Member_List: ${summary.duplicateAdmissionNumbersInMemberList}`,
    `- Duplicate admission numbers in dues report: ${summary.duplicateAdmissionNumbersInDueReport}`,
    `- Same-mobile sibling groups: ${summary.sameMobileSiblingGroups}`,
    `- AY 2026-27 due total: INR ${summary.ay2026_27DueTotal}`,
    `- Previous session due total: INR ${summary.previousSessionDueTotal}`,
    `- Review-session due total: INR ${summary.reviewSessionDueTotal}`,
    `- Total open due amount: INR ${summary.totalDueAmount}`,
    `- Not paid count: ${summary.notPaidCount}`,
    `- Partially paid count: ${summary.partiallyPaidCount}`,
    `- Fully paid/no-due rows excluded from dues: ${summary.fullyPaidNoDueCountExcluded}`,
    "",
    "## Files Written",
    "",
    "- summary.json",
    "- normalized-preview.json",
    "- member-import-preview.csv",
    "- due-import-preview.csv",
    "- anomalies.csv",
    "- same-mobile-sibling-groups.csv",
    "- members-without-due-report-rows.csv",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(resolvedOutput, "README.md"), markdown, "utf8");

  console.log(JSON.stringify(summary, null, 2));
}

main();

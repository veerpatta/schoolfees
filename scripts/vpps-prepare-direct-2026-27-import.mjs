import fs from "node:fs";
import path from "node:path";

const PREVIEW_DIR = "docs/import-previews/2026-05-14-latest-excel-dry-run";
const NORMALIZED_PATH = path.join(PREVIEW_DIR, "normalized-preview.json");
const ANOMALIES_PATH = path.join(PREVIEW_DIR, "anomalies.csv");
const OUTPUT_PATH = path.join(PREVIEW_DIR, "direct-2026-27-import-payload.json");
const SQL_CHUNK_DIR = path.join(PREVIEW_DIR, "direct-2026-27-sql-chunks");
const CHUNK_SIZE = 100;

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
  ["11sci", "11 Science"],
  ["class11sci", "11 Science"],
  ["12arts", "12 Arts"],
  ["class12arts", "12 Arts"],
  ["xiiarts", "12 Arts"],
  ["12commerce", "12 Commerce"],
  ["class12commerce", "12 Commerce"],
  ["xiicommerce", "12 Commerce"],
  ["12science", "12 Science"],
  ["class12science", "12 Science"],
  ["xiiscience", "12 Science"],
  ["12sci", "12 Science"],
  ["class12sci", "12 Science"],
]);

function stringify(value) {
  if (value === null || value === undefined) return "";
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

function normalizePhone(value) {
  const digits = stringify(value).replace(/\D+/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function fallbackKey(name, classLabel, phone) {
  return `${normalizeName(name)}|${classLabel ?? ""}|${normalizePhone(phone)}`;
}

function parseDate(value) {
  const raw = stringify(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;
  const indian = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (indian) {
    const [, dd, mm, yyyy] = indian;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return null;
}

function extractCurrentClass(groupName) {
  const group = stringify(groupName);
  const currentParts = group
    .split(",")
    .map((part) => part.trim())
    .filter((part) => /AY\s*2026-?27/i.test(part));
  if (!currentParts.length) return null;

  for (const currentPart of currentParts) {
    const cleaned = currentPart
      .replace(/monthly\s+fees/gi, " ")
      .replace(/AY\s*2026-?27/gi, " ")
      .replace(/\band\b/gi, " ")
      .trim();

    const direct = CLASS_ALIASES.get(normalizeToken(cleaned));
    if (direct) return direct;

    for (const classLabel of CLASS_ORDER) {
      if (normalizeToken(cleaned).includes(normalizeToken(classLabel))) return classLabel;
    }
  }

  return null;
}

function csvRows(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const [headers, ...body] = rows.filter((entry) => entry.some((cell) => cell !== ""));
  return body.map((entry) => Object.fromEntries(headers.map((header, index) => [header, entry[index] ?? ""])));
}

function admissionForMember(member) {
  const admission = stringify(member.admissionNo);
  if (admission) return admission;
  return `DIRECT-20260514-M${String(member.rowNumber).padStart(4, "0")}`;
}

const normalized = JSON.parse(fs.readFileSync(NORMALIZED_PATH, "utf8"));
const anomalyRows = csvRows(ANOMALIES_PATH);
const anomalyOpenRowNumbers = new Set(
  anomalyRows
    .filter((row) => row.type === "unmatched_due_row")
    .map((row) => Number(row.rowNumber))
    .filter(Number.isFinite),
);
const duplicateOpenRowNumbers = new Set(
  anomalyRows
    .filter((row) => row.type === "duplicate_open_due_row_skipped_from_totals")
    .map((row) => Number(row.rowNumber))
    .filter(Number.isFinite),
);

const members = normalized.members.map((member) => ({
  ...member,
  currentClassLabel: member.classLabel ?? extractCurrentClass(member.groupName),
  importedAdmissionNo: admissionForMember(member),
  dateOfBirthIso: parseDate(member.dateOfBirth),
  primaryMobile: normalizePhone(member.primaryMobile),
  alternateMobile: normalizePhone(member.alternateMobile),
}));

const membersByAdmission = new Map();
for (const member of members) {
  if (member.admissionNo) membersByAdmission.set(member.admissionNo, member);
}

const membersByFallback = new Map();
for (const member of members) {
  const key = fallbackKey(member.studentName, member.currentClassLabel ?? "", member.primaryMobile);
  const entries = membersByFallback.get(key) ?? [];
  entries.push(member);
  membersByFallback.set(key, entries);
}

function findMemberForDue(due) {
  if (due.admissionNo && membersByAdmission.has(due.admissionNo)) {
    return { member: membersByAdmission.get(due.admissionNo), matchType: "admission_no" };
  }
  const classCandidates = [due.classLabel, ""].filter((value, index, values) => values.indexOf(value) === index);
  for (const classLabel of classCandidates) {
    const matches = membersByFallback.get(fallbackKey(due.studentName, classLabel ?? "", due.phone));
    if (matches?.length === 1) return { member: matches[0], matchType: "safe_fallback" };
  }
  return { member: null, matchType: "none" };
}

const studentCandidates = [];
const skippedStudentRows = [];
for (const member of members) {
  if (!member.currentClassLabel) {
    skippedStudentRows.push({
      source: "member",
      sourceRowNumber: member.rowNumber,
      admissionNo: member.admissionNo,
      studentName: member.studentName,
      groupName: member.groupName,
      reason: "no_current_2026_27_class",
    });
    continue;
  }

  studentCandidates.push({
    sourceRowNumber: member.rowNumber,
    admissionNo: member.importedAdmissionNo,
    originalAdmissionNo: member.admissionNo || null,
    studentName: member.studentName,
    classLabel: member.currentClassLabel,
    guardianName: member.guardianName || null,
    primaryMobile: member.primaryMobile || null,
    alternateMobile: member.alternateMobile || null,
    dateOfBirth: member.dateOfBirthIso,
    groupName: member.groupName,
    sourceKey: `Member_List_2026-05-14_084051.xlsx|${member.rowNumber}|${member.importedAdmissionNo}`,
  });
}

const dueCandidates = [];
const skippedDueRows = [];
for (const due of normalized.openDues) {
  if (anomalyOpenRowNumbers.has(due.rowNumber)) {
    skippedDueRows.push({
      source: "due",
      sourceRowNumber: due.rowNumber,
      admissionNo: due.admissionNo || null,
      studentName: due.studentName,
      classLabel: due.classLabel,
      sessionLabel: due.sessionLabel,
      groupName: due.groupName,
      totalDueAmount: due.totalDueAmount,
      status: "skipped_review_needed",
      reason: "unmatched_or_review_needed_from_dry_run",
    });
    continue;
  }
  if (duplicateOpenRowNumbers.has(due.rowNumber)) {
    skippedDueRows.push({
      source: "due",
      sourceRowNumber: due.rowNumber,
      admissionNo: due.admissionNo || null,
      studentName: due.studentName,
      classLabel: due.classLabel,
      sessionLabel: due.sessionLabel,
      groupName: due.groupName,
      totalDueAmount: due.totalDueAmount,
      status: "skipped_duplicate",
      reason: "duplicate_open_due_row_skipped_from_totals",
    });
    continue;
  }

  const { member, matchType } = findMemberForDue(due);
  const classLabel = member?.currentClassLabel ?? (due.sessionLabel === "2026-27" ? due.classLabel : null);

  if (!member || !classLabel) {
    skippedDueRows.push({
      source: "due",
      sourceRowNumber: due.rowNumber,
      admissionNo: due.admissionNo || null,
      studentName: due.studentName,
      classLabel,
      sessionLabel: due.sessionLabel,
      groupName: due.groupName,
      totalDueAmount: due.totalDueAmount,
      status: "skipped_no_current_2026_27_class",
      reason: member ? "matched_member_has_no_current_2026_27_class" : "no_safe_member_match",
    });
    continue;
  }

  const studentAdmissionNo = admissionForMember(member);
  const sourceKey = [
    "Custom_Report_2026-05-14_201835.xlsx",
    due.rowNumber,
    studentAdmissionNo,
    due.sessionLabel,
    due.groupName,
    due.dueOn,
    due.remainingAmount,
    due.fineAmount,
    due.status,
  ].join("|");

  dueCandidates.push({
    sourceRowNumber: due.rowNumber,
    admissionNo: studentAdmissionNo,
    originalDueAdmissionNo: due.admissionNo || null,
    studentName: due.studentName,
    classLabel,
    dueClassLabel: due.classLabel,
    matchType,
    sessionLabel: due.sessionLabel,
    groupName: due.groupName,
    dueOn: parseDate(due.dueOn) ?? (due.sessionLabel === "2026-27" ? "2026-04-20" : "2026-02-20"),
    amountPaidTillDate: due.amountPaidTillDate,
    remainingAmount: due.remainingAmount,
    fineAmount: due.fineAmount,
    totalDueAmount: due.totalDueAmount,
    paymentStatus: due.status,
    installmentNo: due.sessionLabel === "2026-27" ? 1 : 9000 + Number(due.rowNumber),
    installmentLabel:
      due.sessionLabel === "2026-27"
        ? "1st installment imported from latest Excel"
        : "Previous session 2025-26 dues imported from latest Excel",
    sourceKey,
  });
}

const summary = {
  generatedAt: new Date().toISOString(),
  importName: "latest-excel-import-2026-05-14-201835-direct-2026-27-safe-matched",
  targetSessionLabel: "2026-27",
  sourceFiles: [
    "Member_List_2026-05-14_084051.xlsx",
    "Custom_Report_2026-05-14_201835.xlsx",
  ],
  dryRunPreviewFolder: PREVIEW_DIR,
  memberRowsProcessed: normalized.summary.totalMemberRows,
  duePaymentReportRowsProcessed: normalized.summary.totalDuePaymentRows,
  uniqueOpenDueRows: normalized.summary.uniqueOpenDueRows,
  safeMatchedOpenDueRowsFromDryRun:
    normalized.summary.uniqueOpenDueRows -
    skippedDueRows.filter((row) => row.status === "skipped_review_needed").length,
  safeMatchedDueAmountFromDryRun: normalized.summary.totalDueAmount - skippedDueRows
    .filter((row) => row.status === "skipped_review_needed")
    .reduce((sum, row) => sum + Number(row.totalDueAmount || 0), 0),
  studentRowsReady: studentCandidates.length,
  studentRowsSkippedNoCurrentClass: skippedStudentRows.length,
  dueRowsReady: dueCandidates.length,
  dueAmountReady: dueCandidates.reduce((sum, row) => sum + row.totalDueAmount, 0),
  ay2026_27DueAmountReady: dueCandidates
    .filter((row) => row.sessionLabel === "2026-27")
    .reduce((sum, row) => sum + row.totalDueAmount, 0),
  previousSessionDueAmountReady: dueCandidates
    .filter((row) => row.sessionLabel === "2025-26")
    .reduce((sum, row) => sum + row.totalDueAmount, 0),
  notPaidCountReady: dueCandidates.filter((row) => row.paymentStatus === "not_paid").length,
  partiallyPaidCountReady: dueCandidates.filter((row) => row.paymentStatus === "partially_paid").length,
  reviewNeededOpenRowsSkipped: skippedDueRows.filter((row) => row.status === "skipped_review_needed").length,
  reviewNeededOpenAmountSkipped: skippedDueRows
    .filter((row) => row.status === "skipped_review_needed")
    .reduce((sum, row) => sum + Number(row.totalDueAmount || 0), 0),
  noCurrentClassOpenRowsSkipped: skippedDueRows.filter((row) => row.status === "skipped_no_current_2026_27_class").length,
  noCurrentClassOpenAmountSkipped: skippedDueRows
    .filter((row) => row.status === "skipped_no_current_2026_27_class")
    .reduce((sum, row) => sum + Number(row.totalDueAmount || 0), 0),
  duplicateOpenDueRowsSkipped: duplicateOpenRowNumbers.size,
  unmatchedAnomalyRows: anomalyRows.filter((row) => row.type === "unmatched_due_row").length,
  sameMobileSiblingGroups: normalized.summary.sameMobileSiblingGroups,
};

fs.writeFileSync(
  OUTPUT_PATH,
  JSON.stringify(
    {
      summary,
      students: studentCandidates,
      dues: dueCandidates,
      skippedStudentRows,
      skippedDueRows,
    },
    null,
    2,
  ),
);

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function dollarJson(value) {
  return `$vpps_json$${JSON.stringify(value)}$vpps_json$`;
}

function resetOutputDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function writeStageChunks(kind, rows, sqlFactory) {
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    const chunk = rows.slice(index, index + CHUNK_SIZE);
    const filename = `${String(index / CHUNK_SIZE + 1).padStart(2, "0")}-stage-${kind}.sql`;
    fs.writeFileSync(path.join(SQL_CHUNK_DIR, filename), sqlFactory(chunk));
  }
}

resetOutputDir(SQL_CHUNK_DIR);

writeStageChunks("students", studentCandidates, (chunk) => `insert into private.vpps_direct_import_stage_students (import_name, source_key, payload)
select ${sqlQuote(summary.importName)}, row->>'sourceKey', row
from jsonb_array_elements(${dollarJson(chunk)}::jsonb) as row
on conflict (import_name, source_key) do update
set payload = excluded.payload;
`);

writeStageChunks("dues", dueCandidates, (chunk) => `insert into private.vpps_direct_import_stage_dues (import_name, source_key, payload)
select ${sqlQuote(summary.importName)}, row->>'sourceKey', row
from jsonb_array_elements(${dollarJson(chunk)}::jsonb) as row
on conflict (import_name, source_key) do update
set payload = excluded.payload;
`);

const skippedRowsForStage = [
  ...skippedStudentRows,
  ...skippedDueRows,
].map((row) => ({
  ...row,
  source: row.source ?? "member",
  sourceRowNumber: Number(row.sourceRowNumber),
  status: row.status ?? "skipped_no_current_2026_27_class",
}));

writeStageChunks("skipped", skippedRowsForStage, (chunk) => `insert into private.vpps_direct_import_stage_skipped (import_name, source, source_row_number, status, payload)
select ${sqlQuote(summary.importName)}, row->>'source', (row->>'sourceRowNumber')::integer, row->>'status', row
from jsonb_array_elements(${dollarJson(chunk)}::jsonb) as row
on conflict (import_name, source, source_row_number, status) do update
set payload = excluded.payload;
`);

fs.writeFileSync(
  path.join(SQL_CHUNK_DIR, "README.txt"),
  [
    `Import name: ${summary.importName}`,
    `Student stage chunks: ${Math.ceil(studentCandidates.length / CHUNK_SIZE)}`,
    `Due stage chunks: ${Math.ceil(dueCandidates.length / CHUNK_SIZE)}`,
    `Skipped stage chunks: ${Math.ceil(skippedRowsForStage.length / CHUNK_SIZE)}`,
  ].join("\n"),
);

console.log(JSON.stringify(summary, null, 2));

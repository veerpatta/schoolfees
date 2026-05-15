#!/usr/bin/env node
/**
 * VPPS Apply 2026-05-15 — payload generator
 *
 * Reads the dry-run intent JSONs that were emitted by
 * scripts/vpps-import-latest-2026-05-15.mjs and joins them against
 * the live DB state exported into data/imports/backups/<stamp>/
 * (specifically students.json + classes.json + transport_routes.json)
 * to produce idempotent SQL statements.
 *
 * Output:
 *   docs/import-previews/2026-05-15-latest-vpps-import/apply-payloads/
 *     - 01-session-rename.sql
 *     - 02-import-batch-open.sql
 *     - 03-student-upserts-<NN>.sql (chunked)
 *     - 04-student-source-mapping-<NN>.sql (chunked)
 *     - 05-left-student-updates.sql
 *     - 06-stage-payments-<NN>.sql (chunked)
 *     - 07-stage-feelines-<NN>.sql (chunked)
 *     - 08-import-batch-close.sql
 *
 * The SQL is intended for execution via Supabase MCP execute_sql in order.
 * Every statement is idempotent under (import_name, source_key) keys or
 * ON CONFLICT clauses.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */

import fs from "node:fs";
import path from "node:path";

const REPORT_DIR = "docs/import-previews/2026-05-15-latest-vpps-import";
const OUT_DIR = path.join(REPORT_DIR, "apply-payloads");
const IMPORT_NAME = "vpps-latest-2026-05-15-fullbook";
const WORKBOOK_FILENAME = "VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx";
const PRODUCTION_SESSION_LABEL = "2026-27";
const TEST_LABEL = "TEST";
const TEST_ALIASES = ["TEST-2026-27", "UAT-2026-27", "DEMO-2026-27"];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const studentBackupFile = arg(
  "students-backup",
  null,
);
const classesBackupFile = arg("classes-backup", null);
const routesBackupFile = arg("routes-backup", null);

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function sqlString(value) {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlBool(v) {
  return v ? "true" : "false";
}

function sqlInt(v) {
  if (v === null || v === undefined || v === "") return "null";
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n)) : "null";
}

function sqlDate(v) {
  if (!v) return "null";
  return `'${v}'::date`;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function normalizeName(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\s*\.\s*/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function main() {
  ensureDir(OUT_DIR);

  const studentBundle = readJson(path.join(REPORT_DIR, "student-intents.json"));
  const paymentBundle = readJson(path.join(REPORT_DIR, "payment-intents.json"));
  const feeLineBundle = readJson(path.join(REPORT_DIR, "feeline-intents.json"));

  if (!studentBackupFile || !classesBackupFile || !routesBackupFile) {
    throw new Error(
      "Required: --students-backup --classes-backup --routes-backup (paths to JSON dumps).",
    );
  }
  const students = readJson(studentBackupFile);
  const classes = readJson(classesBackupFile);
  const routes = readJson(routesBackupFile);

  // Index classes for session 2026-27, prefer status='active'
  const classByName = new Map();
  for (const c of classes) {
    if (c.session_label !== PRODUCTION_SESSION_LABEL) continue;
    const existing = classByName.get(c.class_name);
    if (!existing || (c.status === "active" && existing.status !== "active")) {
      classByName.set(c.class_name, c);
    }
  }
  // Index routes case-insensitively
  const routeByName = new Map(routes.map((r) => [r.route_name.toLowerCase(), r]));

  // Index existing students by normalized admission_no and by normalized name+class_id
  const existingByAdmission = new Map(students.map((s) => [s.admission_no, s]));
  const existingByNameClass = new Map();
  for (const s of students) {
    const cls = classes.find((c) => c.id === s.class_id);
    if (!cls) continue;
    const key = `${normalizeName(s.full_name)}|${cls.class_name}`;
    const prior = existingByNameClass.get(key) ?? [];
    prior.push(s);
    existingByNameClass.set(key, prior);
  }

  // -----------------------------------------------------------------
  // 01 - session rename + verify
  // -----------------------------------------------------------------
  const sessionSql = [];
  sessionSql.push(`-- ${IMPORT_NAME}: session reconciliation`);
  // Ensure 2026-27 is active+current first
  sessionSql.push(`update public.academic_sessions set is_current = true, status = 'active', updated_at = now() where session_label = '${PRODUCTION_SESSION_LABEL}';`);
  sessionSql.push(`update public.academic_sessions set is_current = false, updated_at = now() where session_label <> '${PRODUCTION_SESSION_LABEL}' and is_current = true;`);
  // Rename TEST aliases to TEST (only if TEST doesn't already exist)
  for (const alias of TEST_ALIASES) {
    sessionSql.push(`do $$ begin
  if not exists (select 1 from public.academic_sessions where session_label = '${TEST_LABEL}')
     and exists (select 1 from public.academic_sessions where session_label = '${alias}') then
    update public.academic_sessions set session_label = '${TEST_LABEL}', is_current = false, updated_at = now() where session_label = '${alias}';
    update public.classes set session_label = '${TEST_LABEL}' where session_label = '${alias}';
  end if;
end $$;`);
  }
  fs.writeFileSync(path.join(OUT_DIR, "01-session-rename.sql"), sessionSql.join("\n") + "\n");

  // -----------------------------------------------------------------
  // 02 - import_batches open
  // -----------------------------------------------------------------
  const openBatchSql = `-- ${IMPORT_NAME}: open import batch
insert into public.import_batches (
  import_mode, target_session_label, filename, source_format, worksheet_name, status, detected_headers
) values (
  'update', '${PRODUCTION_SESSION_LABEL}', 'VPPS latest data import 2026-05-15', 'xlsx',
  'Supabase_Students_Active', 'importing',
  '["source_student_uid","sr_no","class_name","student_name"]'::jsonb
) returning id;
`;
  fs.writeFileSync(path.join(OUT_DIR, "02-import-batch-open.sql"), openBatchSql);

  // -----------------------------------------------------------------
  // 03/04 - student upserts + mapping
  // -----------------------------------------------------------------
  const studentRows = studentBundle.studentIntents;
  const studentResolved = [];
  const unresolvedClass = [];
  for (const intent of studentRows) {
    const klass = classByName.get(intent.classLabel);
    if (!klass) {
      unresolvedClass.push(intent);
      continue;
    }
    const routeInfo = intent.transportIsNone
      ? routeByName.get("no transport")
      : intent.transportRouteName
        ? routeByName.get(intent.transportRouteName.toLowerCase())
        : null;
    // Determine admission_no:
    // 1. existing admission_no = sr_no
    // 2. existing student matched by normalized name + class
    // 3. workbook sr_no if novel
    // 4. else VPPS-<source_uid>
    let admissionNo = null;
    let matchedExisting = null;
    let matchedVia = "created_new";

    if (intent.admissionCandidate && existingByAdmission.has(intent.admissionCandidate)) {
      matchedExisting = existingByAdmission.get(intent.admissionCandidate);
      admissionNo = matchedExisting.admission_no;
      matchedVia = "admission_no";
    } else {
      const nameKey = `${normalizeName(intent.fullName)}|${intent.classLabel}`;
      const candidates = existingByNameClass.get(nameKey) ?? [];
      if (candidates.length === 1) {
        matchedExisting = candidates[0];
        admissionNo = matchedExisting.admission_no;
        matchedVia = "name_class_phone_fallback";
      }
    }
    if (!admissionNo) {
      admissionNo = intent.admissionCandidate
        ? intent.admissionCandidate
        : intent.admissionPendingPrefix
          ? intent.admissionPendingPrefix
          : `VPPS-${intent.sourceStudentUid || `R${intent.sheetRow}`}`;
    }

    studentResolved.push({
      ...intent,
      admissionNo,
      classId: klass.id,
      transportRouteId: routeInfo?.id ?? null,
      matchedExistingId: matchedExisting?.id ?? null,
      matchedVia,
    });
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "_student-resolution.json"),
    JSON.stringify({
      total: studentRows.length,
      resolved: studentResolved.length,
      unresolvedClass: unresolvedClass.length,
      byMatch: studentResolved.reduce((acc, s) => {
        acc[s.matchedVia] = (acc[s.matchedVia] ?? 0) + 1;
        return acc;
      }, {}),
      details: studentResolved.map((s) => ({
        sheetRow: s.sheetRow,
        sourceStudentUid: s.sourceStudentUid,
        fullName: s.fullName,
        classLabel: s.classLabel,
        admissionNo: s.admissionNo,
        matchedExistingId: s.matchedExistingId,
        matchedVia: s.matchedVia,
      })),
    }, null, 2),
  );

  // Chunk student upserts (50 rows per statement)
  const CHUNK = 50;
  let chunkIdx = 0;
  for (let i = 0; i < studentResolved.length; i += CHUNK) {
    chunkIdx += 1;
    const chunk = studentResolved.slice(i, i + CHUNK);
    const values = chunk.map((s) => `(
  ${sqlString(s.admissionNo)},
  ${sqlString(s.fullName)},
  ${sqlDate(s.dateOfBirth)},
  ${sqlString(s.fatherName)},
  ${sqlString(s.motherName)},
  ${sqlString(s.primaryPhone)},
  ${sqlString(s.secondaryPhone)},
  ${sqlString(s.classId)}::uuid,
  ${s.transportRouteId ? sqlString(s.transportRouteId) + "::uuid" : "null"},
  ${sqlString(`source_student_uid:${s.sourceStudentUid}; review:${s.reviewStatus}; notes:${(s.notes || "").slice(0, 240)}`)}
)`).join(",\n");

    const sql = `-- ${IMPORT_NAME}: student upserts chunk ${chunkIdx}
insert into public.students (
  admission_no, full_name, date_of_birth, father_name, mother_name,
  primary_phone, secondary_phone, class_id, transport_route_id, notes
) values
${values}
on conflict (admission_no) do update
set
  full_name = excluded.full_name,
  class_id = excluded.class_id,
  transport_route_id = coalesce(excluded.transport_route_id, public.students.transport_route_id),
  date_of_birth = coalesce(excluded.date_of_birth, public.students.date_of_birth),
  father_name = coalesce(nullif(excluded.father_name, ''), public.students.father_name),
  mother_name = coalesce(nullif(excluded.mother_name, ''), public.students.mother_name),
  primary_phone = coalesce(nullif(excluded.primary_phone, ''), public.students.primary_phone),
  secondary_phone = coalesce(nullif(excluded.secondary_phone, ''), public.students.secondary_phone),
  notes = excluded.notes,
  updated_at = now();
`;
    fs.writeFileSync(path.join(OUT_DIR, `03-student-upserts-${String(chunkIdx).padStart(2, "0")}.sql`), sql);
  }

  // Mapping table population (per student)
  chunkIdx = 0;
  for (let i = 0; i < studentResolved.length; i += CHUNK) {
    chunkIdx += 1;
    const chunk = studentResolved.slice(i, i + CHUNK);
    const values = chunk
      .filter((s) => s.sourceStudentUid)
      .map((s) => `(
  ${sqlString(s.sourceStudentUid)},
  ${sqlString(IMPORT_NAME)},
  (select id from public.students where admission_no = ${sqlString(s.admissionNo)}),
  ${sqlString(WORKBOOK_FILENAME)},
  ${sqlString(s.matchedVia)},
  ${sqlString(`sheetRow=${s.sheetRow}; reviewStatus=${s.reviewStatus}`)}
)`).join(",\n");
    if (!values.length) continue;
    const sql = `-- ${IMPORT_NAME}: source mapping chunk ${chunkIdx}
insert into private.vpps_student_source_mapping (
  source_student_uid, import_name, student_id, workbook_filename, matched_via, notes
) values
${values}
on conflict (source_student_uid, import_name) do update
set student_id = excluded.student_id,
    matched_via = excluded.matched_via,
    notes = excluded.notes,
    updated_at = now();
`;
    fs.writeFileSync(path.join(OUT_DIR, `04-student-source-mapping-${String(chunkIdx).padStart(2, "0")}.sql`), sql);
  }

  // -----------------------------------------------------------------
  // 05 - left students
  // -----------------------------------------------------------------
  const leftIntents = studentBundle.leftIntents;
  const leftResolved = [];
  for (const intent of leftIntents) {
    let admissionNo = null;
    const sourceUid = intent.sourceStudentUid;
    if (sourceUid) {
      // try mapping table first (added in apply); else use existing students if name matches
      const cls = intent.previousClass ? classByName.get(intent.previousClass) : null;
      if (cls) {
        const key = `${normalizeName(intent.previousName)}|${cls.class_name}`;
        const candidates = existingByNameClass.get(key) ?? [];
        if (candidates.length === 1) {
          admissionNo = candidates[0].admission_no;
        }
      }
    }
    leftResolved.push({ ...intent, admissionNo });
  }
  fs.writeFileSync(
    path.join(OUT_DIR, "_left-resolution.json"),
    JSON.stringify({
      total: leftIntents.length,
      withAdmissionMatch: leftResolved.filter((l) => l.admissionNo).length,
      details: leftResolved,
    }, null, 2),
  );

  // Build single SQL with explicit per-row lookup via mapping table (preferred)
  // and admission_no fallback. Idempotent: only updates if status != 'left'.
  const leftSqlParts = [`-- ${IMPORT_NAME}: mark Left_Students status=left (never delete)`];
  for (const l of leftResolved) {
    if (l.sourceStudentUid) {
      leftSqlParts.push(`update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\\n[left ${IMPORT_NAME}] ' || ${sqlString(l.reason || "marked left from latest workbook")},
    updated_at = now()
where status <> 'left'
  and id in (
    select student_id from private.vpps_student_source_mapping
    where source_student_uid = ${sqlString(l.sourceStudentUid)}
      and import_name = ${sqlString(IMPORT_NAME)}
  );`);
    }
    if (l.admissionNo) {
      leftSqlParts.push(`update public.students
set status = 'left',
    notes = coalesce(notes, '') || E'\\n[left ${IMPORT_NAME}] ' || ${sqlString(l.reason || "marked left from latest workbook")},
    updated_at = now()
where status <> 'left'
  and admission_no = ${sqlString(l.admissionNo)};`);
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, "05-left-student-updates.sql"), leftSqlParts.join("\n") + "\n");

  // -----------------------------------------------------------------
  // 06 - stage payments
  // -----------------------------------------------------------------
  const payments = paymentBundle.paymentIntents;
  chunkIdx = 0;
  for (let i = 0; i < payments.length; i += CHUNK) {
    chunkIdx += 1;
    const chunk = payments.slice(i, i + CHUNK);
    const values = chunk.map((p) => {
      const payload = {
        sheet: p.sheet,
        sheetRow: p.sheetRow,
        sourceKey: p.sourceKey,
        sourceStudentUid: p.sourceStudentUid,
        activeUid: p.activeUid,
        paymentImportId: p.paymentImportId,
        paymentDate: p.paymentDate,
        amount: p.amount,
        paymentMode: p.paymentMode,
        paymentModeRaw: p.paymentModeRaw,
        paymentModeRequiresReview: p.paymentModeRequiresReview,
        receiptOrInvoiceNo: p.receiptOrInvoiceNo,
        sourceTransactionId: p.sourceTransactionId,
        feeGroupSessionLabel: p.feeGroupSessionLabel,
        feeGroupOrHead: p.feeGroupOrHead,
        remarks: p.remarks,
        admissionOrSr: p.admissionOrSr,
        studentName: p.studentName,
        classLabel: p.classLabel,
      };
      return `(${sqlString(IMPORT_NAME)}, ${sqlString(`PMT:${p.sourceKey}`)}, '${JSON.stringify(payload).replace(/'/g, "''")}'::jsonb)`;
    }).join(",\n");
    const sql = `-- ${IMPORT_NAME}: stage Payments_Current chunk ${chunkIdx}
insert into private.vpps_direct_import_stage_dues (import_name, source_key, payload) values
${values}
on conflict (import_name, source_key) do update set payload = excluded.payload;
`;
    fs.writeFileSync(path.join(OUT_DIR, `06-stage-payments-${String(chunkIdx).padStart(2, "0")}.sql`), sql);
  }

  // -----------------------------------------------------------------
  // 07 - stage fee lines
  // -----------------------------------------------------------------
  const feeLines = feeLineBundle.feeLineIntents;
  chunkIdx = 0;
  for (let i = 0; i < feeLines.length; i += CHUNK) {
    chunkIdx += 1;
    const chunk = feeLines.slice(i, i + CHUNK);
    const values = chunk.map((f) => {
      const payload = {
        sheet: f.sheet,
        sheetRow: f.sheetRow,
        sourceKey: f.sourceKey,
        sourceStudentUid: f.sourceStudentUid,
        classLabel: f.classLabel,
        feeHead: f.feeHead,
        groupName: f.groupName,
        dueOn: f.dueOn,
        totalAmount: f.totalAmount,
        amountPaid: f.amountPaid,
        amountPaidTillDate: f.amountPaidTillDate,
        remainingAmount: f.remainingAmount,
        fineAmount: f.fineAmount,
        status: f.status,
        reviewStatus: f.reviewStatus,
        reviewNotes: f.reviewNotes,
      };
      return `(${sqlString(IMPORT_NAME)}, ${sqlString(`FL:${f.sourceKey}`)}, '${JSON.stringify(payload).replace(/'/g, "''")}'::jsonb)`;
    }).join(",\n");
    const sql = `-- ${IMPORT_NAME}: stage FeeLines_Current chunk ${chunkIdx}
insert into private.vpps_direct_import_stage_dues (import_name, source_key, payload) values
${values}
on conflict (import_name, source_key) do update set payload = excluded.payload;
`;
    fs.writeFileSync(path.join(OUT_DIR, `07-stage-feelines-${String(chunkIdx).padStart(2, "0")}.sql`), sql);
  }

  // -----------------------------------------------------------------
  // 08 - import_batches close
  // -----------------------------------------------------------------
  fs.writeFileSync(
    path.join(OUT_DIR, "08-import-batch-close.sql"),
    `-- ${IMPORT_NAME}: close most recent importing batch
update public.import_batches
set status = 'completed', updated_at = now()
where status = 'importing'
  and filename = 'VPPS latest data import 2026-05-15';
`,
  );

  console.log(JSON.stringify({
    studentChunks: Math.ceil(studentResolved.length / CHUNK),
    mappingChunks: Math.ceil(studentResolved.length / CHUNK),
    paymentChunks: Math.ceil(payments.length / CHUNK),
    feeLineChunks: Math.ceil(feeLines.length / CHUNK),
    leftCount: leftResolved.length,
    unresolvedClass: unresolvedClass.length,
    studentMatchSummary: studentResolved.reduce((acc, s) => {
      acc[s.matchedVia] = (acc[s.matchedVia] ?? 0) + 1;
      return acc;
    }, {}),
  }, null, 2));
}

main();

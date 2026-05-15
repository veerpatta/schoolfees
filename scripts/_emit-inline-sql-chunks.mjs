#!/usr/bin/env node
// Splits each jsonb payload into N chunks and emits inline SQL files
// (jsonb literal pasted directly into the statement). Each file is a
// self-contained, idempotent statement ready to ship to MCP execute_sql.
//
// Output layout:
//   apply-payloads/inline/
//     students/01.sql .. NN.sql
//     mapping/01.sql .. NN.sql
//     payments/01.sql .. NN.sql
//     feelines/01.sql .. NN.sql
//     left.sql       (single)

import fs from "node:fs";
import path from "node:path";

const APPLY_DIR = "docs/import-previews/2026-05-15-latest-vpps-import/apply-payloads";
const JSONB_DIR = path.join(APPLY_DIR, "jsonb");
const OUT_DIR = path.join(APPLY_DIR, "inline");
const IMPORT_NAME = "vpps-latest-2026-05-15-fullbook";
const WORKBOOK_FILENAME = "VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx";
const ROWS_PER_CHUNK = 50;

fs.mkdirSync(OUT_DIR, { recursive: true });

function escapeJsonbForSqlLiteral(jsonObj) {
  return JSON.stringify(jsonObj).replace(/'/g, "''");
}

function writeChunkedSql(subdir, rows, sqlBuilder) {
  const outSub = path.join(OUT_DIR, subdir);
  fs.mkdirSync(outSub, { recursive: true });
  let chunkIdx = 0;
  for (let i = 0; i < rows.length; i += ROWS_PER_CHUNK) {
    chunkIdx += 1;
    const chunk = rows.slice(i, i + ROWS_PER_CHUNK);
    const sql = sqlBuilder(chunk);
    fs.writeFileSync(
      path.join(outSub, `${String(chunkIdx).padStart(2, "0")}.sql`),
      sql,
    );
  }
  return chunkIdx;
}

// 1. Students upsert
const studentRows = JSON.parse(fs.readFileSync(path.join(JSONB_DIR, "students-payload.json"), "utf8"));
const studentChunks = writeChunkedSql("students", studentRows, (chunk) => `insert into public.students (
  admission_no, full_name, date_of_birth, father_name, mother_name,
  primary_phone, secondary_phone, class_id, transport_route_id, notes
)
select
  r->>'admission_no',
  r->>'full_name',
  nullif(r->>'date_of_birth', '')::date,
  nullif(r->>'father_name', ''),
  nullif(r->>'mother_name', ''),
  nullif(r->>'primary_phone', ''),
  nullif(r->>'secondary_phone', ''),
  (r->>'class_id')::uuid,
  nullif(r->>'transport_route_id', '')::uuid,
  r->>'notes'
from jsonb_array_elements('${escapeJsonbForSqlLiteral(chunk)}'::jsonb) as r
on conflict (admission_no) do update
set full_name = excluded.full_name,
    class_id = excluded.class_id,
    transport_route_id = coalesce(excluded.transport_route_id, public.students.transport_route_id),
    date_of_birth = coalesce(excluded.date_of_birth, public.students.date_of_birth),
    father_name = coalesce(nullif(excluded.father_name, ''), public.students.father_name),
    mother_name = coalesce(nullif(excluded.mother_name, ''), public.students.mother_name),
    primary_phone = coalesce(nullif(excluded.primary_phone, ''), public.students.primary_phone),
    secondary_phone = coalesce(nullif(excluded.secondary_phone, ''), public.students.secondary_phone),
    notes = excluded.notes,
    updated_at = now();`);

// 2. Mapping
const mappingRows = JSON.parse(fs.readFileSync(path.join(JSONB_DIR, "mapping-payload.json"), "utf8"));
const mappingChunks = writeChunkedSql("mapping", mappingRows, (chunk) => `insert into private.vpps_student_source_mapping (
  source_student_uid, import_name, student_id, workbook_filename, matched_via, notes
)
select
  r->>'source_student_uid',
  '${IMPORT_NAME}',
  s.id,
  '${WORKBOOK_FILENAME}',
  r->>'matched_via',
  'review_status=' || (r->>'review_status')
from jsonb_array_elements('${escapeJsonbForSqlLiteral(chunk)}'::jsonb) as r
join public.students s on s.admission_no = (r->>'admission_no')
on conflict (source_student_uid, import_name) do update
set student_id = excluded.student_id,
    matched_via = excluded.matched_via,
    notes = excluded.notes,
    updated_at = now();`);

// 3. Payments staging
const paymentRows = JSON.parse(fs.readFileSync(path.join(JSONB_DIR, "payments-payload.json"), "utf8"));
const paymentChunks = writeChunkedSql("payments", paymentRows, (chunk) => `insert into private.vpps_direct_import_stage_dues (import_name, source_key, payload)
select '${IMPORT_NAME}', r->>'source_key', r->'payload'
from jsonb_array_elements('${escapeJsonbForSqlLiteral(chunk)}'::jsonb) as r
on conflict (import_name, source_key) do update set payload = excluded.payload;`);

// 4. Fee lines staging
const feeLineRows = JSON.parse(fs.readFileSync(path.join(JSONB_DIR, "feelines-payload.json"), "utf8"));
const feeLineChunks = writeChunkedSql("feelines", feeLineRows, (chunk) => `insert into private.vpps_direct_import_stage_dues (import_name, source_key, payload)
select '${IMPORT_NAME}', r->>'source_key', r->'payload'
from jsonb_array_elements('${escapeJsonbForSqlLiteral(chunk)}'::jsonb) as r
on conflict (import_name, source_key) do update set payload = excluded.payload;`);

// 5. Left students - one file (small)
const leftRows = JSON.parse(fs.readFileSync(path.join(JSONB_DIR, "left-payload.json"), "utf8"));
const leftSql = `update public.students s
set status = 'left',
    notes = coalesce(s.notes, '') || E'\\n[left ${IMPORT_NAME}] ' || (r->>'reason'),
    updated_at = now()
from jsonb_array_elements('${escapeJsonbForSqlLiteral(leftRows)}'::jsonb) as r
where s.status <> 'left'
  and (
    s.admission_no = nullif(r->>'admission_no', '')
    or s.id in (
      select student_id from private.vpps_student_source_mapping
      where source_student_uid = nullif(r->>'source_student_uid', '')
        and import_name = '${IMPORT_NAME}'
    )
  );`;
fs.writeFileSync(path.join(OUT_DIR, "left.sql"), leftSql);

const sizes = {};
for (const dir of ["students", "mapping", "payments", "feelines"]) {
  const files = fs.readdirSync(path.join(OUT_DIR, dir)).sort();
  sizes[dir] = files.map((f) => ({
    file: f,
    bytes: fs.statSync(path.join(OUT_DIR, dir, f)).size,
  }));
}
sizes.left = [{ file: "left.sql", bytes: fs.statSync(path.join(OUT_DIR, "left.sql")).size }];

console.log(JSON.stringify({
  chunks: { studentChunks, mappingChunks, paymentChunks, feeLineChunks },
  sizes,
}, null, 2));

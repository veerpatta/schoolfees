#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-unused-vars */
// Generates compact JSONB-driven upsert/staging SQL for the VPPS apply.
// Each output SQL file is a single statement that consumes a jsonb literal
// (array of row objects) via jsonb_array_elements + INSERT ... SELECT.
// This minimises payload-to-syntax overhead vs the row-per-VALUES format.

import fs from "node:fs";
import path from "node:path";

const IMPORT_NAME = "vpps-latest-2026-05-15-fullbook";
const WORKBOOK_FILENAME = "VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx";
const APPLY_DIR = "docs/import-previews/2026-05-15-latest-vpps-import/apply-payloads";
const OUT_DIR = path.join(APPLY_DIR, "jsonb");

fs.mkdirSync(OUT_DIR, { recursive: true });

const studentRes = JSON.parse(fs.readFileSync(path.join(APPLY_DIR, "_student-resolution.json"), "utf8"));
const studentBundle = JSON.parse(fs.readFileSync("docs/import-previews/2026-05-15-latest-vpps-import/student-intents.json", "utf8"));
const paymentBundle = JSON.parse(fs.readFileSync("docs/import-previews/2026-05-15-latest-vpps-import/payment-intents.json", "utf8"));
const feeLineBundle = JSON.parse(fs.readFileSync("docs/import-previews/2026-05-15-latest-vpps-import/feeline-intents.json", "utf8"));
const leftRes = JSON.parse(fs.readFileSync(path.join(APPLY_DIR, "_left-resolution.json"), "utf8"));

// Index intents by sourceStudentUid so we can attach resolved class/route/admission
const resolvedByUid = new Map(studentRes.details.map((d) => [d.sourceStudentUid, d]));

// Build a flat student payload with resolved values
const studentPayload = studentBundle.studentIntents.map((intent) => {
  const r = resolvedByUid.get(intent.sourceStudentUid);
  if (!r) return null;
  return {
    admission_no: r.admissionNo,
    full_name: intent.fullName,
    date_of_birth: intent.dateOfBirth,
    father_name: intent.fatherName || null,
    mother_name: intent.motherName || null,
    primary_phone: intent.primaryPhone || null,
    secondary_phone: intent.secondaryPhone || null,
    class_id: r.matchedExistingId ? null : null, // placeholder; class_id is in the payload below
  };
}).filter(Boolean);

// Use a richer payload that includes class_id and route_id directly so the
// SQL is a single insert ... select ... on conflict update.
const studentRows = studentBundle.studentIntents.map((intent) => {
  const r = resolvedByUid.get(intent.sourceStudentUid);
  if (!r) return null;
  // Look up class_id and route_id from the corresponding chunk-rendered values.
  // We re-read the existing SQL chunk files? Too brittle. Instead recompute here.
  return null;
}).filter(Boolean);

// Simpler: pull class_id / route_id directly from the apply-payloads/_student-resolution.json
// (already has them) — but actually _student-resolution.json from the apply generator
// did not include classId / routeId. So we need to enrich. Let's just re-derive from
// the dry-run student-intents.json fields (classLabel + transportRouteName) plus the
// class/route maps from the backup.
const classes = JSON.parse(fs.readFileSync("data/imports/backups/2026-05-15-pre-apply/classes.json", "utf8"));
const routes = JSON.parse(fs.readFileSync("data/imports/backups/2026-05-15-pre-apply/transport_routes.json", "utf8"));
const classByName = new Map();
for (const c of classes) {
  if (c.session_label !== "2026-27") continue;
  const prior = classByName.get(c.class_name);
  if (!prior || (c.status === "active" && prior.status !== "active")) {
    classByName.set(c.class_name, c);
  }
}
const routeByName = new Map(routes.map((r) => [r.route_name.toLowerCase(), r]));

const fullStudentPayload = studentBundle.studentIntents
  .map((intent) => {
    const resolved = resolvedByUid.get(intent.sourceStudentUid);
    if (!resolved) return null;
    const klass = classByName.get(intent.classLabel);
    if (!klass) return null;
    const route = intent.transportIsNone
      ? routeByName.get("no transport")
      : intent.transportRouteName
        ? routeByName.get(intent.transportRouteName.toLowerCase())
        : null;
    return {
      source_student_uid: intent.sourceStudentUid,
      admission_no: resolved.admissionNo,
      full_name: intent.fullName,
      date_of_birth: intent.dateOfBirth,
      father_name: intent.fatherName || null,
      mother_name: intent.motherName || null,
      primary_phone: intent.primaryPhone || null,
      secondary_phone: intent.secondaryPhone || null,
      class_id: klass.id,
      transport_route_id: route?.id ?? null,
      matched_via: resolved.matchedVia,
      review_status: intent.reviewStatus,
      notes: `source_student_uid:${intent.sourceStudentUid}; review:${intent.reviewStatus}; notes:${(intent.notes || "").replace(/\s+/g, " ").slice(0, 240)}`,
    };
  })
  .filter(Boolean);

fs.writeFileSync(
  path.join(OUT_DIR, "students-payload.json"),
  JSON.stringify(fullStudentPayload),
);

const studentSql = `with payload as (
  select jsonb_array_elements(:'p'::jsonb) as r
), upsert as (
  insert into public.students (
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
  from payload
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
      updated_at = now()
  returning admission_no, id, full_name
)
select count(*) as upserted from upsert;`;
fs.writeFileSync(path.join(OUT_DIR, "students-upsert-template.sql"), studentSql);

// Mapping payload
const mappingPayload = fullStudentPayload
  .filter((s) => s.source_student_uid)
  .map((s) => ({
    source_student_uid: s.source_student_uid,
    admission_no: s.admission_no,
    matched_via: s.matched_via,
    review_status: s.review_status,
  }));
fs.writeFileSync(path.join(OUT_DIR, "mapping-payload.json"), JSON.stringify(mappingPayload));

const mappingSql = `with payload as (
  select jsonb_array_elements(:'p'::jsonb) as r
)
insert into private.vpps_student_source_mapping (
  source_student_uid, import_name, student_id, workbook_filename, matched_via, notes
)
select
  r->>'source_student_uid',
  '${IMPORT_NAME}',
  s.id,
  '${WORKBOOK_FILENAME}',
  r->>'matched_via',
  'review_status=' || (r->>'review_status')
from payload p
join public.students s on s.admission_no = (r->>'admission_no')
on conflict (source_student_uid, import_name) do update
set student_id = excluded.student_id,
    matched_via = excluded.matched_via,
    notes = excluded.notes,
    updated_at = now();`;
fs.writeFileSync(path.join(OUT_DIR, "mapping-upsert-template.sql"), mappingSql);

// Payments staging payload
const paymentPayload = paymentBundle.paymentIntents.map((p) => ({
  source_key: `PMT:${p.sourceKey}`,
  payload: {
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
  },
}));
fs.writeFileSync(path.join(OUT_DIR, "payments-payload.json"), JSON.stringify(paymentPayload));

const stagingSql = `with payload as (
  select jsonb_array_elements(:'p'::jsonb) as r
)
insert into private.vpps_direct_import_stage_dues (import_name, source_key, payload)
select '${IMPORT_NAME}', r->>'source_key', r->'payload'
from payload
on conflict (import_name, source_key) do update set payload = excluded.payload;`;
fs.writeFileSync(path.join(OUT_DIR, "stage-dues-template.sql"), stagingSql);

// Fee lines staging payload
const feeLinePayload = feeLineBundle.feeLineIntents.map((f) => ({
  source_key: `FL:${f.sourceKey}`,
  payload: {
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
  },
}));
fs.writeFileSync(path.join(OUT_DIR, "feelines-payload.json"), JSON.stringify(feeLinePayload));

// Left students: for each left intent, attempt to mark status=left via
// admission_no fallback OR by source_uid via the new mapping table.
const leftPayload = leftRes.details.map((l) => ({
  source_student_uid: l.sourceStudentUid,
  admission_no: l.admissionNo,
  reason: (l.reason || "marked left from latest workbook").slice(0, 200),
})).filter((l) => l.admission_no || l.source_student_uid);
fs.writeFileSync(path.join(OUT_DIR, "left-payload.json"), JSON.stringify(leftPayload));

const leftSql = `with payload as (
  select jsonb_array_elements(:'p'::jsonb) as r
)
update public.students s
set status = 'left',
    notes = coalesce(s.notes, '') || E'\\n[left ${IMPORT_NAME}] ' || (r->>'reason'),
    updated_at = now()
from payload
where s.status <> 'left'
  and (
    s.admission_no = nullif(r->>'admission_no', '')
    or s.id in (
      select student_id from private.vpps_student_source_mapping
      where source_student_uid = nullif(r->>'source_student_uid', '')
        and import_name = '${IMPORT_NAME}'
    )
  );`;
fs.writeFileSync(path.join(OUT_DIR, "left-update-template.sql"), leftSql);

console.log(JSON.stringify({
  studentRows: fullStudentPayload.length,
  mappingRows: mappingPayload.length,
  paymentRows: paymentPayload.length,
  feeLineRows: feeLinePayload.length,
  leftRows: leftPayload.length,
  payloadBytes: {
    students: fs.statSync(path.join(OUT_DIR, "students-payload.json")).size,
    mapping: fs.statSync(path.join(OUT_DIR, "mapping-payload.json")).size,
    payments: fs.statSync(path.join(OUT_DIR, "payments-payload.json")).size,
    feelines: fs.statSync(path.join(OUT_DIR, "feelines-payload.json")).size,
    left: fs.statSync(path.join(OUT_DIR, "left-payload.json")).size,
  },
}, null, 2));

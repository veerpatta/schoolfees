#!/usr/bin/env node
/**
 * Tier 3 — Import 479 official AY 2026-27 students into live `2026-27`.
 * - Creates an import_batches row (mode=add, target_session_label='2026-27', status='completed')
 * - Creates one import_rows row per CSV row (status='imported' for inserted, 'invalid' for any holdback)
 * - Inserts students with class_id and transport_route_id resolved from the live 2026-27 skeleton.
 */
import fs from "node:fs";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CSV_PATH = "scripts/_revamp/out/students-live-2026-27.csv";

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = []; let row = [], field = "", inQ = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ""; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

console.log("[tier3] reading CSV...");
const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
const headers = rows[0];
const dataRows = rows.slice(1).filter((r) => r.some((c) => (c ?? "").trim() !== ""));
console.log(`[tier3] ${dataRows.length} student rows in CSV`);

const colIdx = (h) => headers.indexOf(h);
const H = {
  name: colIdx("Student name"), cls: colIdx("Class"), sr: colIdx("SR no"),
  dob: colIdx("DOB"), father: colIdx("Father name"), mother: colIdx("Mother name"),
  fp: colIdx("Father phone"), mp: colIdx("Mother phone"),
  route: colIdx("Route"), status: colIdx("New/Old"), notes: colIdx("Notes"),
};
for (const [k, v] of Object.entries(H)) if (v < 0) { console.error(`Missing header: ${k}`); process.exit(2); }

// Lookup tables
console.log("[tier3] loading class + route lookups...");
const { data: classes } = await sb.from("classes").select("id,class_name").eq("session_label", "2026-27");
const classByName = new Map(classes.map((c) => [c.class_name, c.id]));
console.log(`[tier3] loaded ${classes.length} live 2026-27 classes`);

const { data: routes } = await sb.from("transport_routes").select("id,route_name");
const routeByName = new Map(routes.map((r) => [r.route_name, r.id]));
console.log(`[tier3] loaded ${routes.length} global routes`);

// Create import_batches row
console.log("[tier3] creating import_batches row...");
const csvBytes = fs.statSync(CSV_PATH).size;
const { data: batch, error: batchErr } = await sb.from("import_batches").insert({
  import_mode: "add",
  target_session_label: "2026-27",
  filename: "students-live-2026-27.csv",
  source_format: "csv",
  file_size_bytes: csvBytes,
  status: "completed",
  total_rows: dataRows.length,
  valid_rows: dataRows.length,
  invalid_rows: 0,
  duplicate_rows: 0,
  imported_rows: dataRows.length,
  skipped_rows: 0,
  failed_rows: 0,
  summary: { source: "tier3 revamp 2026-05-24", note: "Bypassed UI for one-time official-data revamp" },
  detected_headers: headers,
  column_mapping: {
    fullName: "Student name", classLabel: "Class", admissionNo: "SR no",
    dateOfBirth: "DOB", fatherName: "Father name", motherName: "Mother name",
    fatherPhone: "Father phone", motherPhone: "Mother phone",
    transportRouteLabel: "Route", studentTypeOverride: "New/Old", notes: "Notes",
  },
  validation_completed_at: new Date().toISOString(),
  import_completed_at: new Date().toISOString(),
}).select("id").single();
if (batchErr) { console.error("batch insert failed:", batchErr); process.exit(3); }
console.log(`[tier3] batch id: ${batch.id}`);

// Insert students + import_rows
let importedCount = 0, invalidCount = 0;
const importRowsToInsert = [];
const studentsToInsert = [];

for (let i = 0; i < dataRows.length; i++) {
  const r = dataRows[i];
  const rowIndex = i + 1;
  const rawPayload = Object.fromEntries(headers.map((h, k) => [h, r[k] || null]));

  const name = (r[H.name] || "").trim();
  const cls = (r[H.cls] || "").trim();
  const sr = (r[H.sr] || "").trim();
  const dob = (r[H.dob] || "").trim() || null;
  const father = (r[H.father] || "").trim() || null;
  const mother = (r[H.mother] || "").trim() || null;
  const fp = (r[H.fp] || "").trim() || null;
  const mp = (r[H.mp] || "").trim() || null;
  const routeName = (r[H.route] || "").trim();
  const newOld = (r[H.status] || "").trim();
  const notes = (r[H.notes] || "").trim() || null;

  const classId = classByName.get(cls);
  const routeId = routeName ? (routeByName.get(routeName) || null) : null;

  // Compose joined_on from new/old (already produced by transform script's notes column if applicable)
  let joinedOn = null;
  if (newOld === "New") joinedOn = "2026-04-20";

  const studentRow = {
    admission_no: sr, full_name: name, date_of_birth: dob,
    father_name: father, mother_name: mother,
    primary_phone: fp, secondary_phone: mp,
    class_id: classId, transport_route_id: routeId,
    status: "active", joined_on: joinedOn, notes: notes,
  };
  studentsToInsert.push({ rowIndex, rawPayload, studentRow });
}

console.log(`[tier3] inserting ${studentsToInsert.length} students in batches of 100...`);
let insertedIds = new Map(); // adm_no -> id
for (let i = 0; i < studentsToInsert.length; i += 100) {
  const chunk = studentsToInsert.slice(i, i + 100);
  const { data, error } = await sb.from("students").insert(chunk.map((c) => c.studentRow)).select("id,admission_no");
  if (error) { console.error(`student insert failed at chunk ${i}:`, error); process.exit(4); }
  for (const s of data) insertedIds.set(s.admission_no, s.id);
  importedCount += data.length;
  process.stdout.write(`  inserted ${importedCount}/${studentsToInsert.length}\r`);
}
console.log("");

// Build import_rows now that we have student ids
for (const c of studentsToInsert) {
  const stuId = insertedIds.get(c.studentRow.admission_no);
  importRowsToInsert.push({
    batch_id: batch.id, row_index: c.rowIndex,
    raw_payload: c.rawPayload,
    normalized_payload: { ...c.studentRow, classLabel: c.rawPayload.Class, transportRouteLabel: c.rawPayload.Route },
    status: stuId ? "imported" : "invalid",
    import_operation: "create",
    imported_student_id: stuId || null,
    errors: [], warnings: [], anomaly_categories: [], changed_fields: [],
  });
}

console.log(`[tier3] inserting ${importRowsToInsert.length} import_rows audit entries...`);
for (let i = 0; i < importRowsToInsert.length; i += 200) {
  const chunk = importRowsToInsert.slice(i, i + 200);
  const { error } = await sb.from("import_rows").insert(chunk);
  if (error) { console.error(`import_rows insert failed:`, error); process.exit(5); }
  process.stdout.write(`  inserted ${Math.min(i + 200, importRowsToInsert.length)}/${importRowsToInsert.length}\r`);
}
console.log("");

// Update batch summary with actual counts
await sb.from("import_batches").update({
  valid_rows: importedCount, invalid_rows: invalidCount,
  imported_rows: importedCount,
}).eq("id", batch.id);

console.log(`[tier3] DONE. batch=${batch.id} imported=${importedCount} invalid=${invalidCount}`);

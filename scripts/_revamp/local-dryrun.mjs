#!/usr/bin/env node
/**
 * VPPS — Tier 0 local dry-run validator
 *
 * Simulates what the live import UI (app/protected/imports) will do BEFORE you
 * upload, by:
 *   1. running the SAME auto-column-mapping logic as lib/import/mapping.ts
 *      against the CSV headers, and confirming every expected field auto-maps
 *   2. row-scanning the CSV for: missing required fields, duplicate admission_no,
 *      unmapped class names, malformed dates, missing parent contact info
 *   3. reporting in the same shape the live validation report uses
 *
 * Usage:
 *   node scripts/_revamp/local-dryrun.mjs --csv scripts/_revamp/out/students-rehearsal-test-2026-27.csv
 *
 * Exits 0 if the live UI dry-run would pass without manual mapping fixes.
 * Exits non-zero otherwise; the error list is the live-UI work queue.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const FIELD_DEFS = [
  { key: "fullName",           required: true,  aliases: ["student name", "name", "full name", "student"] },
  { key: "classLabel",         required: true,  aliases: ["class", "class name", "grade", "standard"] },
  { key: "admissionNo",        required: false, aliases: ["sr no", "sr number", "admission no", "admission number", "adm no"] },
  { key: "dateOfBirth",        required: false, aliases: ["dob", "date of birth", "birth date"] },
  { key: "fatherName",         required: false, aliases: ["father name", "father", "father's name", "fathers name"] },
  { key: "motherName",         required: false, aliases: ["mother name", "mother", "mother's name", "mothers name"] },
  { key: "fatherPhone",        required: false, aliases: ["father phone", "primary phone", "phone 1", "father mobile"] },
  { key: "motherPhone",        required: false, aliases: ["mother phone", "secondary phone", "phone 2", "mother mobile"] },
  { key: "transportRouteLabel",required: false, aliases: ["transport route", "route", "bus route", "transport"] },
  { key: "studentTypeOverride",required: false, aliases: ["student type override", "student type", "student status", "new old", "status new old"] },
  { key: "notes",              required: false, aliases: ["notes", "remarks", "comment", "comments"] },
];

const CANONICAL_CLASS_LABELS = new Set([
  "Nursery", "JKG", "SKG",
  "Class 1","Class 2","Class 3","Class 4","Class 5","Class 6","Class 7","Class 8","Class 9","Class 10",
  "11 Arts","11 Commerce","11 Science","12 Arts","12 Commerce","12 Science",
]);

function normalizeImportKey(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildAutoColumnMapping(headers) {
  const mapping = {};
  const unused = new Set(headers);
  for (const field of FIELD_DEFS) {
    const match = headers.find((h) => {
      if (!unused.has(h)) return false;
      const nh = normalizeImportKey(h);
      return field.aliases.some((a) => normalizeImportKey(a) === nh);
    });
    if (match) {
      mapping[field.key] = match;
      unused.delete(match);
    }
  }
  return { mapping, unusedHeaders: Array.from(unused) };
}

function parseCsv(text) {
  // RFC-4180 minimal parser: handles BOM, quoted fields, commas, CRLF
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], field = "", inQ = false, i = 0;
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

function parseArgs() {
  const args = process.argv.slice(2);
  let csv = "scripts/_revamp/out/students-rehearsal-test-2026-27.csv";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--csv" && args[i + 1]) csv = args[++i];
  }
  return { csv };
}

function main() {
  const { csv } = parseArgs();
  const abs = path.resolve(csv);
  if (!fs.existsSync(abs)) {
    console.error(`[dryrun] CSV not found: ${abs}`);
    process.exit(2);
  }
  const text = fs.readFileSync(abs, "utf8");
  const rows = parseCsv(text);
  if (rows.length < 2) {
    console.error(`[dryrun] CSV has no data rows`);
    process.exit(2);
  }
  const headers = rows[0];
  const dataRows = rows.slice(1).filter((r) => r.some((c) => (c ?? "").trim() !== ""));

  // 1. Auto-mapping check
  const { mapping, unusedHeaders } = buildAutoColumnMapping(headers);
  const missingRequired = FIELD_DEFS.filter((f) => f.required && !mapping[f.key]).map((f) => f.key);

  // 2. Row scans
  const errors = [];
  const warnings = [];
  const seenAdm = new Map();
  const hAdm = headers.indexOf(mapping.admissionNo);
  const hCls = headers.indexOf(mapping.classLabel);
  const hName = headers.indexOf(mapping.fullName);
  const hDob = headers.indexOf(mapping.dateOfBirth);
  const hFp = headers.indexOf(mapping.fatherPhone);
  const hMp = headers.indexOf(mapping.motherPhone);
  const hStatus = headers.indexOf(mapping.studentTypeOverride);

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const rowNum = i + 2; // CSV header is row 1
    const name = (hName >= 0 ? r[hName] : "").trim();
    const cls = (hCls >= 0 ? r[hCls] : "").trim();
    const adm = (hAdm >= 0 ? r[hAdm] : "").trim();
    const dob = (hDob >= 0 ? r[hDob] : "").trim();
    const fp = (hFp >= 0 ? r[hFp] : "").trim();
    const mp = (hMp >= 0 ? r[hMp] : "").trim();
    const stat = (hStatus >= 0 ? r[hStatus] : "").trim();

    if (!name) errors.push({ row: rowNum, code: "missing-name" });
    if (!cls) errors.push({ row: rowNum, code: "missing-class" });
    else if (!CANONICAL_CLASS_LABELS.has(cls)) errors.push({ row: rowNum, code: "unmapped-class", detail: cls });
    if (!adm) errors.push({ row: rowNum, code: "missing-admission" });
    else {
      if (seenAdm.has(adm)) errors.push({ row: rowNum, code: "duplicate-admission", detail: adm, otherRow: seenAdm.get(adm) });
      else seenAdm.set(adm, rowNum);
      if (adm.startsWith("PENDING-")) warnings.push({ row: rowNum, code: "pending-sr-placeholder", detail: adm });
    }
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) errors.push({ row: rowNum, code: "invalid-dob", detail: dob });
    if (!dob) warnings.push({ row: rowNum, code: "missing-dob" });
    if (!fp && !mp) warnings.push({ row: rowNum, code: "no-parent-phone" });
    if (stat && !["New", "Existing", "Old"].includes(stat)) warnings.push({ row: rowNum, code: "unmapped-status", detail: stat });
  }

  // 3. Report
  const report = {
    csv: abs,
    totalRows: dataRows.length,
    headers,
    autoColumnMapping: mapping,
    missingRequiredFields: missingRequired,
    unusedHeaders,
    errorCount: errors.length,
    warningCount: warnings.length,
    errorsByCode: errors.reduce((acc, e) => { acc[e.code] = (acc[e.code] ?? 0) + 1; return acc; }, {}),
    warningsByCode: warnings.reduce((acc, w) => { acc[w.code] = (acc[w.code] ?? 0) + 1; return acc; }, {}),
    sampleErrors: errors.slice(0, 20),
  };

  const outPath = path.resolve(path.dirname(abs), "local-dryrun-" + path.basename(abs, ".csv") + ".json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`[dryrun] csv=${abs}`);
  console.log(`[dryrun] rows=${dataRows.length}`);
  console.log(`[dryrun] auto-map: ${Object.keys(mapping).length}/${FIELD_DEFS.length} fields matched`);
  console.log(`[dryrun] missing required: ${missingRequired.length ? missingRequired.join(",") : "(none)"}`);
  console.log(`[dryrun] unused headers: ${unusedHeaders.length ? unusedHeaders.join(",") : "(none)"}`);
  console.log(`[dryrun] errors=${errors.length} warnings=${warnings.length}`);
  console.log(`[dryrun] errors by code: ${JSON.stringify(report.errorsByCode)}`);
  console.log(`[dryrun] warnings by code: ${JSON.stringify(report.warningsByCode)}`);
  console.log(`[dryrun] report -> ${outPath}`);

  if (missingRequired.length || errors.length) {
    console.error(`[dryrun] EXIT 4 because required-field or row-level errors exist. Fix in source Excel before live import.`);
    process.exit(4);
  }
}

main();

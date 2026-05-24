#!/usr/bin/env node
/**
 * VPPS — Tier 0/3 transform: Official AY 2026-27 Excel → Bulk-Add import CSV
 *
 * Reads `Students_Master` from the official workbook and produces:
 *   - out/students-rehearsal-test-2026-27.csv  (admission_no prefixed `TEST-` for the Tier-0 rehearsal in TEST-2026-27)
 *   - out/students-live-2026-27.csv            (no prefix, for Tier-3 live import into 2026-27)
 *   - out/discount-plan.json                    (sidecar consumed by Tier-4 discount assignment)
 *   - out/route-inventory.json                 (every distinct route in Students_Master + count; consumed by Tier-2 to seed routes)
 *   - out/transform-report.md                  (human-readable summary)
 *
 * Usage:
 *   node scripts/_revamp/transform-excel-to-import-csv.mjs \
 *     --excel "C:/path/to/Fees_Excel_Official_AY_2026-27_UPDATED_WITH_NEW_STUDENTS.xlsx" \
 *     --out scripts/_revamp/out
 *
 * Both flags are optional. Defaults below.
 *
 * NOTE: This script reads only. It never connects to Supabase or writes to your DB.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";

// --- defaults -------------------------------------------------------------------------------
const DEFAULT_EXCEL =
  "C:/Users/janme/AppData/Roaming/Claude/local-agent-mode-sessions/da5dffa7-ffdf-46fe-984d-6fa21d3a9206/326f2d34-66b3-4eef-a8ff-0fc99e89291c/local_821dd859-068a-4e4e-a02b-4f699392ef05/uploads/Fees_Excel_Official_AY_2026-27_UPDATED_WITH_NEW_STUDENTS.xlsx";
const DEFAULT_OUT_DIR = "scripts/_revamp/out";

// --- canonical reference data (from supabase/schema.sql:2843-2861) --------------------------
const CANONICAL_CLASSES = [
  { label: "Nursery", tuition: 16000 },
  { label: "JKG", tuition: 17000 },
  { label: "SKG", tuition: 17000 },
  { label: "Class 1", tuition: 18000 },
  { label: "Class 2", tuition: 18500 },
  { label: "Class 3", tuition: 19000 },
  { label: "Class 4", tuition: 19500 },
  { label: "Class 5", tuition: 20000 },
  { label: "Class 6", tuition: 21000 },
  { label: "Class 7", tuition: 22000 },
  { label: "Class 8", tuition: 23000 },
  { label: "Class 9", tuition: 24000 },
  { label: "Class 10", tuition: 25000 },
  { label: "11 Arts", tuition: 30000 },
  { label: "11 Commerce", tuition: 30000 },
  { label: "11 Science", tuition: 35000 },
  { label: "12 Arts", tuition: 32000 },
  { label: "12 Commerce", tuition: 32000 },
  { label: "12 Science", tuition: 38000 },
];
const CLASS_BY_LABEL = new Map(CANONICAL_CLASSES.map((c) => [c.label, c]));

// alias map mirrors scripts/vpps-latest-excel-dry-run.mjs (Tier 0 reuse rule)
const CLASS_ALIASES = new Map();
const seedAlias = (k, v) => CLASS_ALIASES.set(k.toLowerCase().replace(/[^a-z0-9]/g, ""), v);
for (const c of CANONICAL_CLASSES) seedAlias(c.label, c.label);
seedAlias("lkg", "JKG");
seedAlias("ukg", "SKG");
for (let i = 1; i <= 10; i++) {
  seedAlias(`class${i}`, `Class ${i}`);
  seedAlias(`${i}`, `Class ${i}`);
}
for (const stream of ["Arts", "Commerce", "Science"]) {
  for (const grade of [11, 12]) {
    seedAlias(`${grade}${stream}`, `${grade} ${stream}`);
    seedAlias(`class${grade}${stream}`, `${grade} ${stream}`);
  }
}

function resolveClassLabel(rawValue) {
  if (rawValue === null || rawValue === undefined) return null;
  const key = String(rawValue).toLowerCase().replace(/[^a-z0-9]/g, "");
  return CLASS_ALIASES.get(key) ?? null;
}

// --- arg parsing ----------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { excel: DEFAULT_EXCEL, out: DEFAULT_OUT_DIR };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--excel" && args[i + 1]) {
      opts.excel = args[++i];
    } else if (args[i] === "--out" && args[i + 1]) {
      opts.out = args[++i];
    }
  }
  return opts;
}

// --- CSV writer (RFC-4180, handles commas/quotes/newlines/UTF-8 BOM) -----------------------
function csvCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function writeCsv(filePath, headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(","));
  }
  fs.writeFileSync(filePath, "﻿" + lines.join("\r\n") + "\r\n", "utf8");
}

// --- date coercion --------------------------------------------------------------------------
function excelDateToIso(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    // Excel serial date (1900-based, days since 1899-12-30)
    const ms = (value - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s) return null;
  // try yyyy-mm-dd
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

// --- discount decoder -----------------------------------------------------------------------
function decodeTuitionOverride(classLabel, overrideValue) {
  if (overrideValue === null || overrideValue === undefined || overrideValue === "") return null;
  // Excel sometimes renders blanks/zeros as "-" or empty strings even with raw:true after string coercion
  if (typeof overrideValue === "string") {
    const cleaned = overrideValue.replace(/[₹,\s]/g, "").trim();
    if (cleaned === "" || cleaned === "-") return null;
    overrideValue = cleaned;
  }
  const amount = Number(overrideValue);
  if (!Number.isFinite(amount)) return { policyCode: null, reason: `non-numeric override "${overrideValue}"` };
  if (amount === 0) return { policyCode: "rte", expectedTuition: 0, reason: "override=0 → RTE" };
  if (amount === 6000) return { policyCode: "3rd_child", expectedTuition: 6000, reason: "override=6000 → 3rd Child Policy" };
  const cls = CLASS_BY_LABEL.get(classLabel);
  if (!cls) return { policyCode: null, reason: `class "${classLabel}" not in canonical map; cannot verify Staff Child rule` };
  if (amount === cls.tuition / 2) {
    return { policyCode: "staff_child", expectedTuition: cls.tuition / 2, reason: `override=${amount} equals 50% of ${classLabel} default (${cls.tuition}) → Staff Child` };
  }
  return { policyCode: null, reason: `override=${amount} does not match RTE/3rd-Child/Staff-Child for ${classLabel} (default=${cls.tuition}, 50%=${cls.tuition / 2})` };
}

// --- phone normalizer -----------------------------------------------------------------------
function normalizePhone(value) {
  if (value === null || value === undefined || value === "") return null;
  const digits = String(value).replace(/\D+/g, "");
  if (!digits) return null;
  // keep last 10 digits if longer (handles +91 prefix)
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// --- name normalizer ------------------------------------------------------------------------
function trimOrNull(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

// --- status mapper --------------------------------------------------------------------------
function mapStatus(value) {
  if (!value) return { newOld: null, joinedOn: null };
  const v = String(value).trim().toLowerCase();
  if (v === "new") return { newOld: "New", joinedOn: "2026-04-20" }; // tentative AY start; owner confirms in Tier 6
  if (v === "old") return { newOld: "Existing", joinedOn: null };
  return { newOld: null, joinedOn: null };
}

// --- main ----------------------------------------------------------------------------------
function main() {
  const opts = parseArgs();
  const outDir = path.resolve(opts.out);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`[transform] reading: ${opts.excel}`);
  if (!fs.existsSync(opts.excel)) {
    console.error(`[transform] ERROR: Excel file not found at ${opts.excel}`);
    process.exit(2);
  }

  const wb = XLSX.readFile(opts.excel, { cellDates: true });
  const sheet = wb.Sheets["Students_Master"];
  if (!sheet) {
    console.error(`[transform] ERROR: sheet "Students_Master" not found. Available: ${wb.SheetNames.join(", ")}`);
    process.exit(2);
  }

  // Headers are on row 4 (1-indexed); data starts row 5.
  // Convert sheet → array of arrays for stable index-based access.
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true, blankrows: false });
  // The Excel has banner rows 1-3, header row 4, data rows 5+.
  // After sheet_to_json (blankrows:false) we get: [banner, instructions, headers, data...]
  // Be defensive: find the row whose first cell equals "Student Name".
  let headerRowIdx = aoa.findIndex((row) => Array.isArray(row) && row[0] && String(row[0]).trim().toLowerCase() === "student name");
  if (headerRowIdx < 0) {
    console.error(`[transform] ERROR: could not find header row containing "Student Name" in column A.`);
    process.exit(2);
  }
  const headers = aoa[headerRowIdx];
  const COL = {
    name: headers.indexOf("Student Name"),
    cls: headers.indexOf("Class"),
    sr: headers.indexOf("SR No."),
    dob: headers.indexOf("DOB"),
    father: headers.indexOf("Father Name"),
    mother: headers.indexOf("Mother Name"),
    fphone: headers.indexOf("Father Phone"),
    mphone: headers.indexOf("Mother Phone"),
    status: headers.indexOf("Student Status"),
    route: headers.indexOf("Transport Route"),
    otherHead: headers.indexOf("Other Fee / Adj. Head"),
    otherAmt: headers.indexOf("Other Fee / Adj. Amount (₹)"),
    tuitOvr: headers.indexOf("Tuition Override (₹)"),
    transOvr: headers.indexOf("Transport Override (₹)"),
  };
  for (const [k, v] of Object.entries(COL)) {
    if (v < 0) {
      console.error(`[transform] ERROR: column "${k}" missing from header row.`);
      process.exit(2);
    }
  }

  const dataRows = aoa.slice(headerRowIdx + 1).filter((r) => Array.isArray(r) && r[COL.name]);
  console.log(`[transform] found ${dataRows.length} student data rows (header row index ${headerRowIdx + 1})`);

  // Output schemas
  const REHEARSAL_HEADERS = [
    "Student name", "Class", "SR no", "DOB",
    "Father name", "Mother name", "Father phone", "Mother phone",
    "Route", "New/Old", "Notes",
  ];
  const LIVE_HEADERS = [...REHEARSAL_HEADERS];

  const rehearsalRows = [];
  const liveRows = [];
  const discountPlan = [];
  const routeCounts = new Map();
  const issues = [];

  let pendingSrCounter = 0;
  let dupePendingCounter = 0;
  const seenAdmissionInLive = new Set();
  const seenAdmissionInRehearsal = new Set();

  dataRows.forEach((row, idx) => {
    const rowNum = headerRowIdx + 1 + idx + 1; // 1-indexed Excel row
    const name = trimOrNull(row[COL.name]);
    const clsRaw = trimOrNull(row[COL.cls]);
    const cls = resolveClassLabel(clsRaw);
    if (!cls) {
      issues.push({ row: rowNum, level: "error", code: "unmapped-class", message: `class "${clsRaw}" did not resolve` });
    }

    const sr = trimOrNull(row[COL.sr]);
    let admissionLive;
    if (sr) {
      admissionLive = sr;
    } else {
      pendingSrCounter += 1;
      admissionLive = `PENDING-2026-${String(pendingSrCounter).padStart(4, "0")}`;
      issues.push({ row: rowNum, level: "warn", code: "missing-sr-placeholder", message: `blank SR; assigned ${admissionLive}` });
    }
    // Owner instruction: keep first occurrence with its SR; later duplicates get PENDING-2026-DUPE-NNNN.
    if (seenAdmissionInLive.has(admissionLive)) {
      const original = admissionLive;
      dupePendingCounter += 1;
      admissionLive = `PENDING-2026-DUPE-${String(dupePendingCounter).padStart(4, "0")}`;
      issues.push({ row: rowNum, level: "warn", code: "duplicate-renumbered", message: `duplicate SR "${original}" -> renumbered to ${admissionLive}` });
    }
    const admissionRehearsal = `TEST-${admissionLive}`;
    seenAdmissionInLive.add(admissionLive);
    seenAdmissionInRehearsal.add(admissionRehearsal);

    const dob = excelDateToIso(row[COL.dob]);
    const father = trimOrNull(row[COL.father]);
    const mother = trimOrNull(row[COL.mother]);
    const fphone = normalizePhone(row[COL.fphone]);
    const mphone = normalizePhone(row[COL.mphone]);
    if (fphone && fphone.length !== 10) {
      issues.push({ row: rowNum, level: "warn", code: "phone-length", message: `father phone "${row[COL.fphone]}" → ${fphone.length} digits` });
    }
    if (mphone && mphone.length !== 10) {
      issues.push({ row: rowNum, level: "warn", code: "phone-length", message: `mother phone "${row[COL.mphone]}" → ${mphone.length} digits` });
    }

    const routeRaw = trimOrNull(row[COL.route]);
    const route = (!routeRaw || routeRaw.toLowerCase() === "no transport") ? "" : routeRaw;
    if (route) routeCounts.set(route, (routeCounts.get(route) ?? 0) + 1);

    const statusMap = mapStatus(row[COL.status]);
    if (!statusMap.newOld && row[COL.status]) {
      issues.push({ row: rowNum, level: "warn", code: "status-unmapped", message: `status "${row[COL.status]}" not "New" or "Old"` });
    }

    // discount decoding (sidecar, NOT written into the CSV in Tier 0)
    const normalizeOverrideCell = (v) => {
      if (v === null || v === undefined) return null;
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      const cleaned = String(v).replace(/[₹,\s]/g, "").trim();
      if (cleaned === "" || cleaned === "-") return null;
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : cleaned;
    };
    const tuitOvr = normalizeOverrideCell(row[COL.tuitOvr]);
    const transOvr = normalizeOverrideCell(row[COL.transOvr]);
    if (tuitOvr !== null) {
      const decoded = decodeTuitionOverride(cls, tuitOvr);
      if (decoded && decoded.policyCode) {
        discountPlan.push({
          row: rowNum,
          admission_no_live: admissionLive,
          admission_no_rehearsal: admissionRehearsal,
          full_name: name,
          class: cls,
          override_value: Number(tuitOvr),
          policy_code: decoded.policyCode,
          expected_tuition_after: decoded.expectedTuition,
          reason: decoded.reason,
        });
      } else if (decoded) {
        issues.push({ row: rowNum, level: "error", code: "discount-unclassified", message: decoded.reason });
      }
    }
    if (transOvr !== null) {
      discountPlan.push({
        row: rowNum,
        admission_no_live: admissionLive,
        admission_no_rehearsal: admissionRehearsal,
        full_name: name,
        class: cls,
        transport_override_annual: transOvr,
        note: "Transport override — OWNER CONFIRMATION REQUIRED in Tier 4",
      });
    }

    const notesParts = [];
    if (sr === null) notesParts.push("SR placeholder — owner to assign real SR");
    if (statusMap.newOld === "New" && statusMap.joinedOn) notesParts.push(`joined_on=${statusMap.joinedOn} (tentative AY start)`);
    const notes = notesParts.join("; ");

    const rehearsalRow = {
      "Student name": name,
      "Class": cls ?? clsRaw ?? "",
      "SR no": admissionRehearsal,
      "DOB": dob ?? "",
      "Father name": father ?? "",
      "Mother name": mother ?? "",
      "Father phone": fphone ?? "",
      "Mother phone": mphone ?? "",
      "Route": route,
      "New/Old": statusMap.newOld ?? "",
      "Notes": notes,
    };
    const liveRow = { ...rehearsalRow, "SR no": admissionLive };

    rehearsalRows.push(rehearsalRow);
    liveRows.push(liveRow);
  });

  // Write outputs
  const rehearsalPath = path.join(outDir, "students-rehearsal-test-2026-27.csv");
  const livePath = path.join(outDir, "students-live-2026-27.csv");
  const discountPath = path.join(outDir, "discount-plan.json");
  const routePath = path.join(outDir, "route-inventory.json");
  const reportPath = path.join(outDir, "transform-report.md");

  writeCsv(rehearsalPath, REHEARSAL_HEADERS, rehearsalRows);
  writeCsv(livePath, LIVE_HEADERS, liveRows);
  fs.writeFileSync(discountPath, JSON.stringify(discountPlan, null, 2), "utf8");
  fs.writeFileSync(
    routePath,
    JSON.stringify(
      Array.from(routeCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([route, count]) => ({ route, count })),
      null,
      2,
    ),
    "utf8",
  );

  // Report
  const classBreakdown = new Map();
  for (const r of liveRows) classBreakdown.set(r["Class"], (classBreakdown.get(r["Class"]) ?? 0) + 1);
  const statusBreakdown = new Map();
  for (const r of liveRows) statusBreakdown.set(r["New/Old"] || "(blank)", (statusBreakdown.get(r["New/Old"] || "(blank)") ?? 0) + 1);
  const policyBreakdown = new Map();
  for (const p of discountPlan) {
    if (p.policy_code) policyBreakdown.set(p.policy_code, (policyBreakdown.get(p.policy_code) ?? 0) + 1);
  }

  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");

  const report = `# Tier-0/3 transform report

**Source:** \`${opts.excel}\`
**Generated:** ${new Date().toISOString()}
**Total rows in:** ${dataRows.length}
**Rows out (rehearsal):** ${rehearsalRows.length}
**Rows out (live):** ${liveRows.length}
**Errors:** ${errors.length}
**Warnings:** ${warns.length}
**Pending SR placeholders generated:** ${pendingSrCounter}

## Class breakdown
${Array.from(classBreakdown.entries()).sort().map(([k, v]) => `- ${k}: ${v}`).join("\n")}

## Status breakdown (New/Old)
${Array.from(statusBreakdown.entries()).sort().map(([k, v]) => `- ${k}: ${v}`).join("\n")}

## Discount plan (sidecar, not in CSV)
${Array.from(policyBreakdown.entries()).sort().map(([k, v]) => `- ${k}: ${v}`).join("\n")}
- transport overrides: ${discountPlan.filter((p) => p.transport_override_annual !== undefined).length}

## Routes seen in Students_Master
${Array.from(routeCounts.entries()).sort((a, b) => b[1] - a[1]).map(([r, c]) => `- ${r}: ${c}`).join("\n")}

## Errors
${errors.length === 0 ? "(none)" : errors.map((e) => `- row ${e.row}: [${e.code}] ${e.message}`).join("\n")}

## Warnings (first 40)
${warns.length === 0 ? "(none)" : warns.slice(0, 40).map((w) => `- row ${w.row}: [${w.code}] ${w.message}`).join("\n")}
${warns.length > 40 ? `\n…and ${warns.length - 40} more warnings` : ""}

## Outputs
- \`${path.relative(process.cwd(), rehearsalPath)}\`
- \`${path.relative(process.cwd(), livePath)}\`
- \`${path.relative(process.cwd(), discountPath)}\`
- \`${path.relative(process.cwd(), routePath)}\`
- \`${path.relative(process.cwd(), reportPath)}\`
`;
  fs.writeFileSync(reportPath, report, "utf8");


  console.log(`[transform] wrote ${rehearsalRows.length} rehearsal rows -> ${rehearsalPath}`);
  console.log(`[transform] wrote ${liveRows.length} live rows -> ${livePath}`);
  console.log(`[transform] wrote ${discountPlan.length} discount entries -> ${discountPath}`);
  console.log(`[transform] wrote ${routeCounts.size} routes -> ${routePath}`);
  console.log(`[transform] report -> ${reportPath}`);
  console.log(`[transform] errors=${errors.length} warnings=${warns.length}`);

  if (errors.length > 0) {
    console.error(`[transform] EXIT 3 because ${errors.length} blocking errors were found. See report.`);
    process.exit(3);
  }
}

main();

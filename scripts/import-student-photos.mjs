import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

import { cropToFace } from "./lib/face-crop.mjs";

/**
 * Import student photos out of a Sampark export workbook.
 *
 * The export carries each child's photo as an image ANCHORED to their row in
 * the "Photo" column, not as a cell value — the cell itself is empty (or reads
 * "no photo"). So the identity of a photo is its anchor: sheet + row. This
 * reads the anchors out of the xlsx package directly, joins each image to the
 * student row it sits on, matches on SR No -> students.admission_no, uploads to
 * the `student-photos` bucket and sets `students.photo_path`.
 *
 *   node scripts/import-student-photos.mjs --file <workbook.xlsx>
 *   node scripts/import-student-photos.mjs --file <workbook.xlsx> --apply
 *
 * Dry run by default, the same shape as scripts/bulk-apply.mjs: read with the
 * service role, print the whole diff, write nothing unless asked twice.
 *
 * Why this is not a bulk-apply plan: `photo_path` is not a writable column in
 * any bulk-apply operation, and it cannot sensibly be one — the value is
 * meaningless without the storage object it points at, so the upload and the
 * column have to move together or the row points at nothing. It is also not a
 * screen: components/students/student-photo-upload.tsx uploads exactly one
 * photo, from a browser, resizing on a canvas.
 *
 * Every write lands an `audit_logs` row. `recordActivity()` is deliberately not
 * called: it no-ops without a signed-in staff member, so a headless path has to
 * lay its own trail (see docs/maps/danger-zones.md).
 */

function loadEnvFile(envPath) {
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

function readFlag(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const filePath = readFlag("file");
const apply = process.argv.includes("--apply");
const overwrite = process.argv.includes("--overwrite");
const noCrop = process.argv.includes("--no-crop");
const contactSheetPath = readFlag("contact-sheet");
const actor = readFlag("actor", process.env.BULK_APPLY_ACTOR ?? "agent");

const BUCKET = "student-photos";
const UPLOAD_CONCURRENCY = 6;

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (!filePath || process.argv.includes("--help")) {
  console.log(`
Import student photos from a Sampark export — dry run by default.

  node scripts/import-student-photos.mjs --file <workbook.xlsx> [--apply]

  --file        the Sampark .xlsx export (required)
  --apply       actually upload and write. Without it, nothing changes.
  --overwrite   replace a photo on a student who already has one
                (default: those students are skipped and listed)
  --no-crop     store the export's own framing instead of a face-anchored
                600x800 crop. The export ships four different aspect ratios, so
                this makes the photo viewer a different shape per child.
  --contact-sheet <file.jpg>
                write every crop as one reviewable image. Worth doing before
                --apply: no automatic check separates a good crop from a bad one
                here (see below), but a person can see 80 of them at a glance.
  --actor       recorded in the audit trail (default "agent")
`);
  process.exit(filePath ? 0 : 1);
}

if (!existsSync(filePath)) fail(`No such file: ${filePath}`);

// ---------------------------------------------------------------------------
// Minimal zip reader. The xlsx package can read cells but not drawing anchors,
// and the anchors are the whole point here.
// ---------------------------------------------------------------------------

function readZipEntries(buffer) {
  // Locate the end-of-central-directory record, scanning back over any comment.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 22 - 65536; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail("Not a zip file (no end-of-central-directory record).");

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let pointer = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let n = 0; n < entryCount; n += 1) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString("utf8", pointer + 46, pointer + 46 + nameLength);

    // The local header repeats the name and extra fields at its own lengths.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    entries.set(name, method === 0 ? raw : inflateRawSync(raw));
    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

const text = (buffer) => buffer.toString("utf8");

function relsFor(entries, part) {
  const relPath = `${path.posix.dirname(part)}/_rels/${path.posix.basename(part)}.rels`;
  const raw = entries.get(relPath);
  if (!raw) return new Map();
  const map = new Map();
  for (const match of text(raw).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(match[0])?.[1];
    const target = /Target="([^"]+)"/.exec(match[0])?.[1];
    if (id && target) map.set(id, target);
  }
  return map;
}

const resolvePart = (basePart, target) =>
  path.posix.normalize(path.posix.join(path.posix.dirname(basePart), target));

/** Every image in the workbook, with the sheet and 0-indexed row it is anchored to. */
function readAnchoredImages(entries) {
  const workbook = text(entries.get("xl/workbook.xml") ?? Buffer.alloc(0));
  const workbookRels = relsFor(entries, "xl/workbook.xml");

  const sheets = [];
  for (const match of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(match[0])?.[1];
    const rid = /r:id="([^"]+)"/.exec(match[0])?.[1];
    if (!name || !rid) continue;
    let target = workbookRels.get(rid) ?? "";
    target = target.replace(/^\//, "");
    sheets.push({ name, part: target.startsWith("xl/") ? target : `xl/${target}` });
  }

  const anchored = [];
  for (const sheet of sheets) {
    const sheetXml = entries.get(sheet.part);
    if (!sheetXml) continue;
    const drawingRid = /<drawing\b[^>]*r:id="([^"]+)"/.exec(text(sheetXml))?.[1];
    if (!drawingRid) continue;

    const drawingPart = resolvePart(sheet.part, relsFor(entries, sheet.part).get(drawingRid) ?? "");
    const drawingXml = entries.get(drawingPart);
    if (!drawingXml) continue;
    const drawingRels = relsFor(entries, drawingPart);

    // One anchor per picture; <xdr:from> carries the cell it is pinned to.
    for (const anchor of text(drawingXml).split(/<xdr:(?:oneCellAnchor|twoCellAnchor|absoluteAnchor)\b/).slice(1)) {
      const row = /<xdr:row>(\d+)<\/xdr:row>/.exec(anchor)?.[1];
      const col = /<xdr:col>(\d+)<\/xdr:col>/.exec(anchor)?.[1];
      const embed = /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(anchor)?.[1];
      if (row === undefined || col === undefined || !embed) continue;
      const imagePart = resolvePart(drawingPart, drawingRels.get(embed) ?? "");
      const bytes = entries.get(imagePart);
      if (!bytes) continue;
      anchored.push({
        sheet: sheet.name,
        row0: Number(row),
        col0: Number(col),
        imagePart,
        bytes,
      });
    }
  }

  return anchored;
}

// ---------------------------------------------------------------------------

function contentTypeFor(imagePart) {
  const extension = path.posix.extname(imagePart).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function extensionFor(imagePart) {
  const extension = path.posix.extname(imagePart).toLowerCase();
  return extension === ".png" || extension === ".webp" ? extension : ".jpg";
}

const normalizeName = (value) =>
  value.toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Does the name on the sheet row describe the same child as the name on the
 * student the SR No matched?
 *
 * This guard is the reason this script is safe to point at a live roll. The
 * export's `PENDING-SR-NNNN` values are placeholders the office generates for a
 * child with no admission number yet — they are positional, not identifying, so
 * the same placeholder can name a different child in a later export. On the
 * first real run one of them did: the sheet said "VIHA BHANDARI" where the
 * database said "VANSHITA BHANDARI", and without this check that photo would
 * have been written onto another child's record, where nobody would ever
 * notice it was wrong.
 *
 * Token overlap rather than string equality, because the office legitimately
 * writes "BHANU PRATAP SINGH" one place and "Bhanu Pratap" another, and a
 * strict compare would refuse every one of those.
 */
function namesAgree(sheetName, studentName) {
  const a = new Set(normalizeName(sheetName).split(" ").filter((token) => token.length > 1));
  const b = new Set(normalizeName(studentName).split(" ").filter((token) => token.length > 1));
  if (!a.size || !b.size) return false;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared >= Math.min(a.size, b.size);
}

/**
 * Every crop about to be written, as one image a person can scan.
 *
 * This exists because the obvious automatic check does not work. Three were
 * tried — the centroid of all skin, the widest skin row, the amount of skin in
 * the top of the frame — and each confidently flagged between 19 and 56
 * perfectly good crops while missing genuinely headless ones, because a
 * washed-out photo of a pale child and a photo of a shirt look much the same to
 * a threshold. A contact sheet is not a clever check; it is the only one here
 * that is actually reliable.
 */
async function writeContactSheet(rows, destination) {
  const { createRequire } = await import("node:module");
  const sharp = createRequire(import.meta.url)("sharp");

  const CW = 108, CH = 144, COLS = 8;
  const tiles = await Promise.all(rows.map(async (row, index) => ({
    input: await sharp(row.bytes).resize(CW, CH).toBuffer(),
    left: (index % COLS) * CW,
    top: Math.floor(index / COLS) * CH,
  })));

  await sharp({
    create: {
      width: CW * COLS,
      height: CH * Math.ceil(rows.length / COLS),
      channels: 3,
      background: "#111",
    },
  }).composite(tiles).jpeg({ quality: 82 }).toFile(destination);

  console.log(`  contact sheet: ${destination} — ${rows.length} crop(s). Look at it before --apply.`);
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const { default: XLSX } = await import("xlsx");

  const buffer = readFileSync(filePath);
  const entries = readZipEntries(buffer);
  const anchored = readAnchoredImages(entries);

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const rowsBySheet = new Map(
    workbook.SheetNames.map((name) => [
      name,
      XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: null }),
    ]),
  );

  const cell = (row, key) => (row?.[key] == null ? "" : String(row[key]).trim());

  const candidates = [];
  const noStudentRow = [];
  for (const image of anchored) {
    // Row 0 is the header, so an anchor at row0 = N sits on data row N - 1.
    const row = rowsBySheet.get(image.sheet)?.[image.row0 - 1];
    if (!row) {
      noStudentRow.push(image);
      continue;
    }
    candidates.push({
      ...image,
      sheetRow: image.row0 + 1,
      admissionNo: cell(row, "SR No") || cell(row, "Admission No"),
      name: cell(row, "Name"),
    });
  }

  console.log(`\nSource: ${filePath}`);
  console.log(`  ${anchored.length} anchored image(s), ${candidates.length} sitting on a student row.`);
  if (noStudentRow.length) {
    console.log(`  ${noStudentRow.length} anchored to a row with no student under it — skipped.`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local).");
  }
  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  const admissionNumbers = [...new Set(candidates.map((c) => c.admissionNo).filter(Boolean))];
  const { data: studentRows, error: studentsError } = await supabase
    .from("students")
    .select("id, admission_no, full_name, photo_path")
    .in("admission_no", admissionNumbers);
  if (studentsError) fail(`Could not read students: ${studentsError.message}`);

  const byAdmissionNo = new Map((studentRows ?? []).map((row) => [row.admission_no, row]));

  const toUpload = [];
  const unmatched = [];
  const nameDisagrees = [];
  const alreadyHavePhoto = [];

  for (const candidate of candidates) {
    const student = candidate.admissionNo ? byAdmissionNo.get(candidate.admissionNo) : null;
    if (!student) {
      unmatched.push(candidate);
      continue;
    }
    if (!namesAgree(candidate.name, student.full_name)) {
      nameDisagrees.push({ ...candidate, student });
      continue;
    }
    if (student.photo_path && !overwrite) {
      alreadyHavePhoto.push({ ...candidate, student });
      continue;
    }
    toUpload.push({ ...candidate, student });
  }

  console.log(`\n  matched on SR No     : ${toUpload.length + alreadyHavePhoto.length + nameDisagrees.length}`);
  console.log(`  will be uploaded     : ${toUpload.length}`);
  console.log(`  already has a photo  : ${alreadyHavePhoto.length}${overwrite ? " (overwriting)" : " (skipped; pass --overwrite to replace)"}`);
  console.log(`  name disagrees       : ${nameDisagrees.length} (refused — see below)`);
  console.log(`  no matching student  : ${unmatched.length}`);

  if (nameDisagrees.length) {
    console.log("\n  REFUSED — the SR No matched a student with a different name.");
    console.log("  A photo written here lands on the wrong child, where nobody would see it.");
    console.log("  Fix the admission number in the export or in the app, then re-run:");
    for (const row of nameDisagrees) {
      console.log(`    SR ${String(row.admissionNo).padEnd(16)} sheet="${row.name}"  app="${row.student.full_name}"  (${row.sheet} row ${row.sheetRow})`);
    }
  }

  if (unmatched.length) {
    console.log("\n  Unmatched — no student carries this SR No:");
    for (const row of unmatched) {
      console.log(`    ${row.sheet} row ${row.sheetRow}  SR ${row.admissionNo || "(blank)"}  ${row.name}`);
    }
  }

  if (!toUpload.length) {
    console.log("\nNothing to do.\n");
    return;
  }

  /**
   * Normalise every photo to one face-anchored 3:4 frame.
   *
   * Done here rather than at display time because the shape is a property of
   * the photo, not of the surface showing it: once every stored image is
   * 600x800 with the face where a face goes, the list avatar, the pop-out and
   * any future document all agree without each re-deciding how to crop.
   */
  if (!noCrop) {
    process.stdout.write("  cropping to faces… ");
    let fallbacks = 0;
    for (const row of toUpload) {
      const cropped = await cropToFace(row.bytes);
      row.bytes = cropped.buffer;
      row.cropped = true;
      if (cropped.how !== "face") fallbacks += 1;
    }
    console.log(`${toUpload.length} done` + (fallbacks ? `, ${fallbacks} by fallback framing` : ""));
  }

  if (contactSheetPath) {
    await writeContactSheet(toUpload, contactSheetPath);
  }

  if (!apply) {
    console.log("\n  Sample of what would be written:");
    for (const row of toUpload.slice(0, 5)) {
      console.log(`    ${row.student.admission_no.padEnd(10)} ${row.student.full_name} <- ${row.imagePart} (${row.bytes.length} bytes)`);
    }
    console.log(`\nDry run. Nothing was uploaded or written. Re-run with --apply.\n`);
    return;
  }

  const runId = randomUUID();
  console.log(`\nApplying — run ${runId}\n`);

  const outcomes = await mapWithConcurrency(toUpload, UPLOAD_CONCURRENCY, async (row) => {
    // A cropped photo is always a jpeg, whatever the export shipped.
    const extension = row.cropped ? ".jpg" : extensionFor(row.imagePart);
    const objectName = `${row.student.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(objectName, row.bytes, {
        contentType: row.cropped ? "image/jpeg" : contentTypeFor(row.imagePart),
        upsert: false,
      });
    if (uploadError) {
      return { admissionNo: row.student.admission_no, ok: false, why: `upload failed: ${uploadError.message}` };
    }

    const { error: updateError } = await supabase
      .from("students")
      .update({ photo_path: objectName })
      .eq("id", row.student.id);
    if (updateError) {
      // Leave the object in place rather than deleting it: an orphan in the
      // bucket is inert, and removing it would destroy the only copy if the
      // update failed for a transient reason.
      return { admissionNo: row.student.admission_no, ok: false, why: `photo_path not set: ${updateError.message}` };
    }

    // The row now points at the new object, so the old one is unreferenced.
    // Remove it, or every re-import leaves another copy of every child behind.
    // Deliberately after the update and never before: an orphan in the bucket is
    // inert, whereas deleting first would destroy the only copy if the update
    // then failed. A failure to tidy up is reported, not fatal.
    let cleanupNote = null;
    if (row.student.photo_path && row.student.photo_path !== objectName) {
      const { error: removeError } = await supabase.storage
        .from(BUCKET)
        .remove([row.student.photo_path]);
      if (removeError) cleanupNote = removeError.message;
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      table_name: "students",
      record_id: row.student.id,
      action: "update",
      before_data: { photo_path: row.student.photo_path ?? null },
      after_data: {
        photo_path: objectName,
        _photo_import: {
          runId,
          actor,
          source: path.basename(filePath),
          sheet: row.sheet,
          sheetRow: row.sheetRow,
          bytes: row.bytes.length,
        },
      },
      changed_by: null,
    });
    if (auditError) {
      return { admissionNo: row.student.admission_no, ok: false, why: `written, but audit failed: ${auditError.message}` };
    }

    return { admissionNo: row.student.admission_no, ok: true, cleanupNote };
  });

  const failed = outcomes.filter((outcome) => !outcome.ok);
  console.log(`Uploaded and linked ${outcomes.length - failed.length} of ${outcomes.length}.`);
  for (const outcome of failed) {
    console.log(`  FAILED ${outcome.admissionNo}: ${outcome.why}`);
  }

  const notTidied = outcomes.filter((outcome) => outcome.ok && outcome.cleanupNote);
  if (notTidied.length) {
    console.log(`
${notTidied.length} replaced photo(s) left their old object in the bucket:`);
    for (const outcome of notTidied) {
      console.log(`  ${outcome.admissionNo}: ${outcome.cleanupNote}`);
    }
    console.log("  Harmless — the student record points at the new photo either way.");
  }
  console.log("");
}

main().catch((error) => fail(error instanceof Error ? error.stack ?? error.message : String(error)));

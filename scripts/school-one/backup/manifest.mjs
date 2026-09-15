/**
 * Write the manifest, then encrypt everything else.
 *
 *   node manifest.mjs ./out/2026-09-16
 *
 * The manifest is the only file that stays readable. That is deliberate: it
 * carries no student data — sizes, checksums, row counts and the migration SHA —
 * and it is what somebody needs to answer "is there a good backup of last
 * Tuesday" without holding the decryption key. Every file that does carry data
 * is `age`-encrypted to two recipients and the plaintext is removed.
 *
 * Two recipients, not one:
 *
 *   BACKUP_AGE_RECIPIENT        the school's recovery key. Its private half
 *                               lives in a password manager and on paper in the
 *                               school safe, and never in CI.
 *   BACKUP_DRILL_AGE_RECIPIENT  the drill key, whose private half IS a GitHub
 *                               secret so the monthly restore drill can run
 *                               unattended.
 *
 * Splitting them means the automated drill can prove the backup restores
 * without CI ever holding the key that opens the school's real recovery copy.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2];

if (!outDir) {
  console.error("Usage: node manifest.mjs <out-dir>");
  process.exit(1);
}

const recipients = [
  process.env.BACKUP_AGE_RECIPIENT,
  process.env.BACKUP_DRILL_AGE_RECIPIENT,
].filter(Boolean);

if (recipients.length !== 2) {
  console.error(
    "Both BACKUP_AGE_RECIPIENT and BACKUP_DRILL_AGE_RECIPIENT must be set.\n" +
      "Encrypting to one of them would mean either the school cannot open its own\n" +
      "backup, or the drill cannot run. Refusing to continue.",
  );
  process.exit(1);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** The invariants CSV, as rows the drill can compare one by one. */
function readInvariants(path) {
  if (!existsSync(path)) return [];

  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/).filter(Boolean);
  const rows = [];

  for (const line of lines) {
    // psql --csv over several statements emits a header per result set; those
    // repeat the literal column names, which is how they are recognised.
    const cells = line.split(",").map((cell) => cell.replace(/^"|"$/g, ""));
    if (cells[0] === "kind") continue;
    if (cells.length < 3) continue;
    rows.push({ kind: cells[0], label: cells[1], value: Number(cells[2]) });
  }

  return rows;
}

/** The migrations directory's tree SHA — which schema this backup belongs to. */
function migrationsSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD:supabase/migrations"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

const startedAt = process.env.BACKUP_STARTED_AT ?? new Date().toISOString();

const dataFiles = readdirSync(outDir)
  .filter((name) => !name.startsWith("."))
  .filter((name) => name !== "manifest.json")
  .filter((name) => !name.endsWith(".age"))
  .sort();

const scopeFile = join(outDir, ".schema-scope");
const schemaScope = existsSync(scopeFile) ? readFileSync(scopeFile, "utf8").trim() : "unknown";

const files = dataFiles.map((name) => {
  const path = join(outDir, name);
  return { name, bytes: statSync(path).size, sha256: sha256(path) };
});

const manifest = {
  kind: "nightly",
  date: outDir.split(/[\\/]/).filter(Boolean).at(-1),
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  // Named so restore day does not have to guess whether auth and storage are in
  // here. "We have a backup" and "we have a backup of the application tables
  // only" are different sentences.
  schema_scope: schemaScope,
  migrations_sha: migrationsSha(),
  dump_bytes: files.reduce((total, file) => total + file.bytes, 0),
  files,
  invariants: readInvariants(join(outDir, "invariants.csv")),
};

writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

// Encrypt, verify the ciphertext exists and is non-trivial, THEN delete the
// plaintext. Deleting first and discovering age failed would destroy the backup
// this script exists to create.
for (const file of files) {
  const plain = join(outDir, file.name);
  const encrypted = `${plain}.age`;

  execFileSync(
    "age",
    ["-r", recipients[0], "-r", recipients[1], "-o", encrypted, plain],
    { stdio: "inherit" },
  );

  if (!existsSync(encrypted) || statSync(encrypted).size === 0) {
    console.error(`age produced nothing for ${file.name}; keeping the plaintext.`);
    process.exit(1);
  }

  rmSync(plain);
}

rmSync(scopeFile, { force: true });

console.log(
  `manifest.json written: ${files.length} file(s), ` +
    `${(manifest.dump_bytes / 1024 / 1024).toFixed(1)} MB, ` +
    `${manifest.invariants.length} invariant row(s), scope ${schemaScope}`,
);

/**
 * Did the numbers come back?
 *
 *   node compare-invariants.mjs ./drill/manifest.json ./drill/restored-invariants.csv
 *
 * This is the step that turns "pg_restore exited 0" into "the backup is good".
 * A restore can complete cleanly and still be missing a table, a session's
 * worth of payments, or every row written after some silent truncation. The
 * manifest recorded what was true when the dump was taken; this compares it
 * with what is true in the restored database, row by row.
 *
 * Any difference is a failure. Not a warning — the entire point of a drill is
 * that its result is trusted without anybody reading the log, and a check that
 * sometimes says "close enough" is a check nobody reads.
 */
import { readFileSync } from "node:fs";

const [manifestPath, restoredCsvPath] = process.argv.slice(2);

if (!manifestPath || !restoredCsvPath) {
  console.error("Usage: node compare-invariants.mjs <manifest.json> <restored-invariants.csv>");
  process.exit(1);
}

function parseCsv(path) {
  const rows = new Map();

  for (const line of readFileSync(path, "utf8").trim().split(/\r?\n/)) {
    if (!line) continue;
    const cells = line.split(",").map((cell) => cell.replace(/^"|"$/g, ""));
    if (cells[0] === "kind" || cells.length < 3) continue;
    rows.set(`${cells[0]}:${cells[1]}`, Number(cells[2]));
  }

  return rows;
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const expected = new Map(
  (manifest.invariants ?? []).map((row) => [`${row.kind}:${row.label}`, Number(row.value)]),
);
const actual = parseCsv(restoredCsvPath);

if (expected.size === 0) {
  console.error(
    "The manifest carries no invariants, so this drill would pass by having nothing\n" +
      "to check. That is a failure, not a pass.",
  );
  process.exit(1);
}

const mismatches = [];

for (const [key, expectedValue] of expected) {
  if (!actual.has(key)) {
    mismatches.push({ key, expected: expectedValue, actual: "missing" });
    continue;
  }

  const actualValue = actual.get(key);
  if (actualValue !== expectedValue) {
    mismatches.push({ key, expected: expectedValue, actual: actualValue });
  }
}

// Rows that exist only in the restored copy matter too: a table that gained
// rows during a restore means something ran that should not have.
for (const key of actual.keys()) {
  if (!expected.has(key)) {
    mismatches.push({ key, expected: "absent at dump time", actual: actual.get(key) });
  }
}

console.log(`Compared ${expected.size} invariant(s) from ${manifest.date ?? "the manifest"}.`);

if (mismatches.length === 0) {
  console.log("All invariants match. The backup restores.");
  process.exit(0);
}

console.error(`\n${mismatches.length} mismatch(es):\n`);
console.error(
  ["invariant".padEnd(44), "at dump".padStart(16), "restored".padStart(16)].join(""),
);
console.error("-".repeat(76));

for (const row of mismatches) {
  console.error(
    [
      String(row.key).padEnd(44),
      String(row.expected).padStart(16),
      String(row.actual).padStart(16),
    ].join(""),
  );
}

console.error("\nThe restored database does not match what was backed up.");
process.exit(1);

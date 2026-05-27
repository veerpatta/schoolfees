import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const budgets = JSON.parse(await readFile("quality/office-quality-budgets.json", "utf8"));

const files = [
  {
    label: "Payment Desk client",
    path: "components/payments/payment-desk-mobile.tsx",
    maxLines: budgets.performance.sourceBudgets.paymentDeskClientMaxLines,
  },
  {
    label: "Student form",
    path: "components/students/student-form.tsx",
    maxLines: budgets.performance.sourceBudgets.studentFormMaxLines,
  },
];

const failures = [];

for (const file of files) {
  const contents = await readFile(file.path, "utf8");
  const lines = contents.split(/\r?\n/).length;

  if (lines > file.maxLines) {
    failures.push(`${file.label} has ${lines} lines; budget is ${file.maxLines}.`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Quality budgets passed.");

// Money-formatting clarity gate — every money figure must flow through the
// canonical helpers in lib/helpers/currency.ts + lib/helpers/date.ts.
// scripts/audit-money-formatting.mjs exits non-zero on violation; we run it
// as a sub-step so the quality-budget check is the single CI gate for both
// source-size and money-formatting health.
const moneyAudit = spawnSync(process.execPath, ["scripts/audit-money-formatting.mjs"], {
  stdio: "inherit",
});

if (moneyAudit.status !== 0) {
  console.error("\nMoney-formatting audit failed — see violations above.");
  process.exit(moneyAudit.status ?? 1);
}

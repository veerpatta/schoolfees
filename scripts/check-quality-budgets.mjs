import { readFile } from "node:fs/promises";

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

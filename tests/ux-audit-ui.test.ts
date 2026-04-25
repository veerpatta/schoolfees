import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("read-only UX audit implementation", () => {
  it("students filters auto-submit and default to active status", () => {
    const page = readRepoFile("app/protected/students/page.tsx");
    const filters = readRepoFile("components/students/student-filters.tsx");
    const bulkDialog = readRepoFile("components/students/student-bulk-import-dialog.tsx");

    expect(filters).toContain("AutoSubmitForm");
    expect(filters).not.toContain("Apply filters");
    expect(page).toContain('("active" as StudentListFilters["status"])');
    expect(page).toContain("Add Student");
    expect(bulkDialog).toContain("Bulk Add Students");
    expect(bulkDialog).toContain("Bulk Update Existing Students");
    expect(page).toContain("Download Template");
  });

  it("read-only finance filters no longer need manual apply buttons", () => {
    const transactions = readRepoFile("app/protected/transactions/page.tsx");
    const reports = readRepoFile("app/protected/reports/page.tsx");
    const defaulters = readRepoFile("components/defaulters/defaulter-filters.tsx");
    const receipts = readRepoFile("app/protected/receipts/page.tsx");

    expect(transactions).toContain("AutoSubmitForm");
    expect(transactions).not.toContain("Apply filters");
    expect(transactions).toContain("Academic year");
    expect(reports).toContain("AutoSubmitForm");
    expect(reports).not.toContain("Update view");
    expect(defaulters).toContain("AutoSubmitForm");
    expect(defaulters).not.toContain("Apply filters");
    expect(receipts).toContain("AutoSubmitForm");
    expect(receipts).not.toContain(">Search</button>");
  });

  it("payment desk and ledger open selected students without extra load buttons", () => {
    const paymentDesk = readRepoFile("components/payments/payment-entry-client.tsx");
    const paymentData = readRepoFile("lib/payments/data.ts");
    const ledger = readRepoFile("components/ledger/ledger-client.tsx");

    expect(paymentDesk).toContain("AutoSubmitForm");
    expect(paymentDesk).not.toContain("Continue with this student");
    expect(paymentData).toContain("tryAutoPrepareSelectedStudentDues");
    expect(paymentData).toContain("Prepare dues again");
    expect(paymentDesk).toContain("/protected/payments/preview");
    expect(ledger).toContain("AutoSubmitForm");
    expect(ledger).not.toContain("Open ledger");
    expect(ledger).not.toContain("Apply filters");
  });

  it("dashboard hides repair console and Admin Tools owns fee data troubleshooting", () => {
    const dashboard = readRepoFile("app/protected/dashboard/page.tsx");
    const advanced = readRepoFile("app/protected/advanced/page.tsx");
    const navigation = readRepoFile("lib/config/navigation.ts");

    expect(dashboard).not.toContain("System Sync Health");
    expect(dashboard).not.toContain("Generate Missing Dues");
    expect(dashboard).toContain("Open Fee Data Troubleshooting");
    expect(advanced).toContain("Fee Data Troubleshooting");
    expect(advanced).toContain("Prepare missing dues");
    expect(advanced).toContain("Update fee records for this year");
    expect(advanced).toContain("Fix Payment Desk dues");
    expect(navigation).toContain("Fee Data Troubleshooting");
  });

  it("uses office-friendly wording on daily pages", () => {
    const dailyFiles = [
      "app/protected/dashboard/page.tsx",
      "app/protected/students/page.tsx",
      "app/protected/transactions/page.tsx",
      "app/protected/defaulters/page.tsx",
      "app/protected/receipts/page.tsx",
      "components/payments/payment-entry-client.tsx",
      "components/students/student-list-table.tsx",
      "components/students/student-form.tsx",
      "components/ledger/ledger-client.tsx",
      "components/fees/fee-setup-client.tsx",
    ];
    const combined = dailyFiles.map(readRepoFile).join("\n");

    expect(combined).toContain("Dues not prepared");
    expect(combined).toContain("Publish Fee Setup");
    expect(combined).not.toContain("Publish & Sync All");
    expect(combined).not.toContain("Computed Fee Snapshot");
    expect(combined).not.toContain("Policy-driven");
    expect(combined).not.toContain("RPC");
    expect(combined).not.toContain("schema");
    expect(combined).not.toContain("migration");
  });

  it("write actions still revalidate finance surfaces", () => {
    expect(readRepoFile("app/protected/payments/actions.ts")).toContain(
      "revalidateCoreFinancePaths([studentId])",
    );
    expect(readRepoFile("app/protected/fee-setup/actions.ts")).toContain(
      "revalidateCoreFinancePaths()",
    );
    expect(readRepoFile("app/protected/imports/actions.ts")).toContain(
      "revalidateImportPostCommit",
    );
    expect(readRepoFile("app/protected/students/actions.ts")).toContain(
      "revalidateFinanceSurfaces({ studentIds: [studentId] })",
    );
  });
});

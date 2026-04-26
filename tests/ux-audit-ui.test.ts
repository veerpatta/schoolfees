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
    expect(page).toContain("More");
    expect(bulkDialog).toContain("Bulk Add Students");
    expect(bulkDialog).toContain("Bulk Update Existing Students");
    expect(page).toContain("Download Add Template");
    expect(page).not.toContain("Import column names");
  });

  it("login stays minimal and staff-safe", () => {
    const layout = readRepoFile("app/auth/layout.tsx");
    const login = readRepoFile("components/login-form.tsx");
    const notice = readRepoFile("components/auth/auth-config-notice.tsx");
    const authError = readRepoFile("app/auth/error.tsx");
    const combined = [layout, login, notice, authError].join("\n");

    expect(layout).toContain("Shri Veer Patta Senior Secondary School");
    expect(layout).toContain("Fee Management System");
    expect(layout).toContain("For school office use only");
    expect(login).toContain("Email / Username");
    expect(login).toContain("Forgot password?");
    expect(combined).toContain("Sign-in is temporarily unavailable");
    expect(combined).not.toContain("Back to overview");
    expect(combined).not.toContain("Supabase");
    expect(combined).not.toContain("NEXT_PUBLIC");
    expect(combined).not.toContain("Vercel");
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
    expect(receipts).toContain("ReceiptsQuickLoad");
    expect(receipts).not.toContain(">Search</button>");
  });

  it("payment desk and ledger open selected students without extra load buttons", () => {
    const paymentDesk = readRepoFile("components/payments/payment-entry-client.tsx");
    const paymentData = readRepoFile("lib/payments/data.ts");
    const ledger = readRepoFile("components/ledger/ledger-client.tsx");

    expect(paymentDesk).not.toContain("AutoSubmitForm");
    expect(paymentDesk).not.toContain("Continue with this student");
    expect(paymentData).toContain("tryAutoPrepareSelectedStudentDues");
    expect(paymentData).toContain("Prepare dues again");
    expect(paymentDesk).toContain("/protected/payments/student-summary");
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
    expect(navigation).toContain('requiredPermission: "fees:write"');
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
    expect(combined).not.toContain("append-only");
  });

  it("daily tables expose compact default columns", () => {
    const studentsTable = readRepoFile("components/students/student-list-table.tsx");
    const transactions = readRepoFile("app/protected/transactions/page.tsx");
    const defaulters = readRepoFile("app/protected/defaulters/page.tsx");

    expect(studentsTable).toContain("SR no");
    expect(studentsTable).toContain("Student name");
    expect(transactions).toContain("Receipt no");
    expect(transactions).not.toContain("Receipt / Ref");
    expect(defaulters).toContain("Oldest due");
    expect(defaulters).toContain("Phone-ready overdue list for");
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

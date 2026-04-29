import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("source of truth audit fixes", () => {
  it("reports_outstanding_uses_workbook_balances", () => {
    const reportsData = readRepoFile("lib/reports/data.ts");

    expect(reportsData).toContain('.from("v_workbook_installment_balances")');
    expect(reportsData).toContain("pending_amount");
    expect(reportsData).toContain("missing_dues");
    expect(reportsData).not.toContain('.from("v_installment_balances")');
    expect(reportsData).not.toContain("outstanding_amount\",");
  });

  it("student_ledger_current_outstanding_matches_payment_desk", () => {
    const reportsData = readRepoFile("lib/reports/data.ts");
    const paymentsData = readRepoFile("lib/payments/data.ts");

    expect(reportsData).toContain('.from("v_workbook_installment_balances")');
    expect(reportsData).toContain('.select("pending_amount")');
    expect(paymentsData).toContain("getPaymentDateAwareInstallmentBalances");
    expect(paymentsData).toContain("pending_amount");
  });

  it("defaulters_shows_missing_dues_warning_for_active_students_without_financial_rows", () => {
    const defaultersData = readRepoFile("lib/defaulters/data.ts");
    const defaultersPage = readRepoFile("app/protected/defaulters/page.tsx");

    expect(defaultersData).toContain("getActiveSessionStudents");
    expect(defaultersData).toContain("missingDuesRows");
    expect(defaultersData).toContain("!generatedStudentIds.has(row.studentId)");
    expect(defaultersPage).toContain("Students whose dues are not prepared");
    expect(defaultersPage).toContain("Dues not prepared");
  });

  it("import_status_change_to_active_generates_dues", () => {
    const importData = readRepoFile("lib/import/data.ts");

    expect(importData).toContain("shouldSyncStudentDuesForChange");
    expect(importData).toContain("studentsToRegenerate.add(importedStudentId)");
    expect(importData).not.toContain("routeOrClassChanged || feeProfileChanged");
  });

  it("payment_desk_pending_matches_rpc_for_payment_date", () => {
    const paymentData = readRepoFile("lib/payments/data.ts");
    const previewRoute = readRepoFile("app/protected/payments/preview/route.ts");
    const paymentClient = readRepoFile("components/payments/payment-entry-client.tsx");
    const migration = readRepoFile("supabase/migrations/20260425090000_payment_date_workbook_preview.sql");

    expect(paymentData).toContain("preview_workbook_payment_allocation");
    expect(paymentData).toContain("Payment preview needs a database update.");
    expect(previewRoute).toContain("getPaymentDateAwareInstallmentBalances");
    expect(paymentClient).toContain("/protected/payments/student-summary");
    expect(paymentClient).toContain("previewUnavailable");
    expect(paymentClient).toContain("previewTotalPending");
    expect(migration).toContain("private.workbook_installment_snapshot(p_student_id, p_payment_date, true)");
  });

  it("transactions_class_register_exports_missing_dues", () => {
    const officeDues = readRepoFile("lib/office/dues.ts");
    const transactionsExport = readRepoFile("app/protected/transactions/export/route.ts");

    expect(officeDues).toContain('"missing_dues" as const');
    expect(officeDues).toContain('"Dues not prepared"');
    expect(transactionsExport).toContain('"Dues status"');
    expect(transactionsExport).toContain("row.duesStatusLabel");
  });

  it("active_session_consistency_across_students_dashboard_payment", () => {
    const financialSync = readRepoFile("lib/system-sync/financial-sync.ts");
    const dashboardPage = readRepoFile("app/protected/dashboard/page.tsx");
    const dashboardActions = readRepoFile("app/protected/dashboard/actions.ts");
    const dashboardData = readRepoFile("lib/dashboard/data.ts");

    expect(financialSync).toContain("activeStudentsBySession");
    expect(financialSync).toContain("generateMissingSessionDues");
    expect(financialSync).toContain("workbookFinancialRowsBySession");
    expect(financialSync).toContain("importBatchesByTargetSessionStatus");
    expect(financialSync).toContain("classSessionMismatchStudents");
    expect(financialSync).toContain("requiredDatabaseObjectsStatus");
    expect(financialSync).toContain("alignAcademicCurrentSessionWithFeeSetup");
    expect(dashboardPage).toContain("Open Fee Data Troubleshooting");
    expect(dashboardPage).not.toContain("Live Data Health");
    expect(dashboardActions).toContain("alignWorkingSessionWithFeeSetupAction");
    expect(dashboardData).toContain("systemSyncHealth: null");
    expect(dashboardData).not.toContain('optionalLoad("system sync health", getSystemSyncHealth, null, warnings)');
  });

  it("repair_actions_preserve_student_session_and_payment_history", () => {
    const financialSync = readRepoFile("lib/system-sync/financial-sync.ts");
    const dashboardActions = readRepoFile("app/protected/dashboard/actions.ts");
    const verifyScript = readRepoFile("scripts/verify-live-fee-health.mjs");

    const alignFunction = financialSync.slice(
      financialSync.indexOf("export async function alignAcademicCurrentSessionWithFeeSetup"),
    );

    expect(alignFunction).toContain('.from("academic_sessions")');
    expect(alignFunction).not.toContain('.from("students").update');
    expect(alignFunction).not.toContain('.from("classes").update');
    expect(alignFunction).not.toContain('.from("payments")');
    expect(alignFunction).not.toContain('.from("receipts")');
    expect(alignFunction).not.toContain('.from("audit_logs")');
    expect(financialSync).toContain("studentsMissingInstallments.map((row) => row.studentId)");
    expect(financialSync).toContain("scopedStudentIds: studentIds");
    expect(financialSync).toContain("useAdminClient: payload.useSystemClient");
    expect(dashboardActions).toContain("a database update is pending");
    expect(verifyScript).not.toContain(".insert(");
    expect(verifyScript).not.toContain(".update(");
    expect(verifyScript).not.toContain(".delete(");
  });
});

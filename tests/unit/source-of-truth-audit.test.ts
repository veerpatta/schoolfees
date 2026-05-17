import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("source of truth audit fixes", () => {
  it("active_session_label_is_the_only_active_session_read_source", () => {
    const filesToAudit = [
      "lib/session/resolver.ts",
      "lib/fees/policy.ts",
      "lib/master-data/data.ts",
      "lib/students/data.ts",
      "lib/system-sync/financial-sync.ts",
      "lib/setup/data.ts",
      "lib/import/data.ts",
      "lib/payments/data.ts",
      "lib/dashboard/data.ts",
      "lib/defaulters/data.ts",
      "app/protected/session/actions.ts",
    ];

    for (const file of filesToAudit) {
      const source = readRepoFile(file);

      expect(source, file).not.toMatch(
        /\.from\(["']fee_policy_configs["'][\s\S]{0,260}\.eq\(["']is_active["'],\s*true\)/,
      );
      expect(source, file).not.toMatch(
        /\.from\(["']academic_sessions["'][\s\S]{0,260}\.eq\(["']is_current["'],\s*true\)/,
      );
    }

    const setActive = readRepoFile("lib/session/set-active.ts");
    const feePolicy = readRepoFile("lib/fees/policy.ts");

    expect(setActive).not.toContain(".from(\"fee_policy_configs\")");
    expect(setActive).toContain(".from(\"academic_sessions\")");
    expect(setActive).toContain("is_current: true");
    expect(feePolicy).toContain(".from(\"fee_policy_configs\")");
    expect(feePolicy).toContain(".neq(\"academic_session_label\", values.academic_session_label)");
    expect(feePolicy).toContain("await setActiveSessionLabel(values.academic_session_label)");
  });

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
    const paymentClient = readRepoFile("components/payments/payment-desk-mobile.tsx");
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
    expect(financialSync).toContain("autoReconcileSessionIfSafe");
    expect(financialSync).toContain("workbookFinancialRowsBySession");
    expect(financialSync).toContain("importBatchesByTargetSessionStatus");
    expect(financialSync).toContain("classSessionMismatchStudents");
    expect(financialSync).toContain("requiredDatabaseObjectsStatus");
    expect(financialSync).toContain("alignAcademicCurrentSessionWithFeeSetup");
    expect(dashboardPage).toContain("Open Fee Data Troubleshooting");
    expect(dashboardPage).not.toContain("Live Data Health");
    expect(dashboardActions).toContain("alignWorkingSessionWithFeeSetupAction");
    expect(dashboardData).toContain('optionalLoad(');
    expect(dashboardData).toContain('"dashboard sync health"');
    expect(dashboardData).toContain("getDashboardSyncHealth(sessionLabel)");
  });

  it("repair_actions_preserve_student_session_and_payment_history", () => {
    const financialSync = readRepoFile("lib/system-sync/financial-sync.ts");
    const dashboardActions = readRepoFile("app/protected/dashboard/actions.ts");
    const verifyScript = readRepoFile("scripts/verify-live-fee-health.mjs");

    const alignFunction = financialSync.slice(
      financialSync.indexOf("export async function alignAcademicCurrentSessionWithFeeSetup"),
    );

    expect(alignFunction).toContain("setActiveSessionLabel(activeSession)");
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

  it("workbook_fee_setup_saves_selected_session_without_switching_default", () => {
    const workbookSetupChange = readRepoFile("lib/fees/workbook-setup-change.ts");
    const feePolicy = readRepoFile("lib/fees/policy.ts");

    expect(workbookSetupChange).toContain("activateSession: false");
    expect(workbookSetupChange).toMatch(/getFeeSetupPageData\(\{\s+sessionLabel: payload\.academicSessionLabel/);
    expect(workbookSetupChange).toMatch(/getFeeSetupPageData\(\{\s+sessionLabel: currentFormPayload\.academicSessionLabel/);
    expect(feePolicy).toContain("activateSession?: boolean");
    expect(feePolicy).toContain("const shouldActivateSession = payload.activateSession ?? true");
    expect(feePolicy).toMatch(/if \(shouldActivateSession\) \{\s+await setActiveSessionLabel/);
  });

  it("workbook_financial_views_are_session_scoped_not_live_policy_only", () => {
    const schema = readRepoFile("supabase/schema.sql");
    const migration = readRepoFile(
      "supabase/migrations/20260517120000_session_scoped_workbook_financials.sql",
    );
    const snapshotFunction = schema.slice(
      schema.lastIndexOf("create or replace function private.workbook_installment_snapshot"),
      schema.lastIndexOf("create or replace view public.v_workbook_installment_balances"),
    );
    const studentFinancialView = schema.slice(
      schema.lastIndexOf("create or replace view public.v_workbook_student_financials"),
      schema.lastIndexOf("create or replace view public.v_student_financial_state"),
    );
    const paymentFunction = schema.slice(
      schema.lastIndexOf("create or replace function public.post_student_payment"),
    );

    expect(snapshotFunction).toContain("select distinct on (academic_session_label)");
    expect(snapshotFunction).toContain("join session_policy as policy_row");
    expect(snapshotFunction).not.toContain(
      "where is_active = true\n      and calculation_model = 'workbook_v1'",
    );
    expect(studentFinancialView).toContain("with session_policy as");
    expect(studentFinancialView).toContain("order by academic_session_label, updated_at desc");
    expect(studentFinancialView).not.toContain(
      "where is_active = true\n    and calculation_model = 'workbook_v1'",
    );
    expect(paymentFunction).toContain("where fpc.academic_session_label = student_session_label");
    expect(paymentFunction).toContain("use_workbook_mode := active_policy_model = 'workbook_v1'");
    expect(migration).toContain("Make workbook financial projections session-scoped");
  });

  it("server_actions_do_not_export_runtime_type_only_session_values", () => {
    const sessionActions = readRepoFile("app/protected/session/actions.ts");
    const sessionPill = readRepoFile("components/admin/session-pill.tsx");
    const mobileSessionPill = readRepoFile("components/admin/mobile-session-pill.tsx");

    expect(sessionActions).not.toContain("export type { AvailableSessionRow }");
    expect(sessionPill).toContain(
      'import type { AvailableSessionRow } from "@/lib/session/available-sessions";',
    );
    expect(mobileSessionPill).toContain(
      'import type { AvailableSessionRow } from "@/lib/session/available-sessions";',
    );
  });

  it("fee_setup_keeps_each_selected_session_admin_editable", () => {
    const feeSetupPage = readRepoFile("app/protected/fee-setup/page.tsx");

    expect(feeSetupPage).toContain('hasStaffPermission(staff, "fees:write")');
    expect(feeSetupPage).not.toContain(
      'viewSession.sessionLabel === data.globalPolicy.academicSessionLabel',
    );
  });
});

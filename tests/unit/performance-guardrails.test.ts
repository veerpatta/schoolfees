import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("office performance guardrails", () => {
  it("keeps dashboard overdue counts on the already-loaded installment rows", () => {
    const dashboardData = readRepoFile("lib/dashboard/data.ts");

    expect(dashboardData).not.toContain("overdue workbook installments");
    expect(dashboardData).not.toContain('"active students"');
    expect(dashboardData).toContain("getDashboardAboveFoldData");
    expect(dashboardData).toContain('supabase.rpc("get_dashboard_summary"');
    expect(dashboardData).toContain("p_session_label: sessionLabel");
    expect(dashboardData).toContain("overdueInstallmentCount: result.overdueInstallmentCount");
    expect(dashboardData).not.toContain("buildDashboardSummary({");
  });

  it("keeps dashboard health checks scoped to the dashboard path", () => {
    const dashboardData = readRepoFile("lib/dashboard/data.ts");
    const dashboardPage = readRepoFile("app/protected/dashboard/page.tsx");

    expect(dashboardData).toContain("getDashboardSyncHealth(sessionLabel)");
    expect(dashboardData).toContain('"dashboard sync health"');
    expect(dashboardData).not.toContain("getSystemSyncHealth(sessionLabel)");
    expect(dashboardData).toContain('row.recordStatus === "active"');
    expect(dashboardPage).toContain("CriticalAlerts");
    expect(dashboardPage).toContain("getCollectionRateHealth");
    expect(dashboardPage).toContain("CollectionFunnelBar");
    expect(dashboardPage).toContain("QuickJumpLinks");
    expect(dashboardPage).not.toContain("FollowUpQueue");
    expect(dashboardPage).not.toContain("RecentReceipts");
    expect(dashboardPage).toContain("Show all classes");
    expect(dashboardPage).toContain("md:hidden");
  });

  it("keeps interactive Transactions limited while allowing full exports", () => {
    const officeDues = readRepoFile("lib/transactions/dues.ts");
    const exportRoute = readRepoFile("app/protected/transactions/export/route.ts");

    expect(officeDues).toContain("exportAll?: boolean");
    expect(officeDues).toContain("limit: filters.exportAll ? null : undefined");
    expect(exportRoute).toContain("exportAll: true");
  });

  it("scopes workbook reads to the active office session and visible receipts", () => {
    const dashboardData = readRepoFile("lib/dashboard/data.ts");
    const officeData = readRepoFile("lib/office/data.ts");
    const workbookData = readRepoFile("lib/workbook/data.ts");

    expect(dashboardData).toContain(
      "getWorkbookStudentFinancials({ sessionLabel, activeOnly: true })",
    );
    expect(dashboardData).toContain(
      "getWorkbookInstallmentRows({ sessionLabel })",
    );
    expect(officeData).toContain("const sessionLabel = policy.academicSessionLabel");
    expect(officeData).toContain("getWorkbookInstallmentRows({ pendingOnly: true, sessionLabel })");
    expect(workbookData).toContain("studentIds?: readonly string[]");
    expect(workbookData).toContain("query = query.in(\"student_id\", studentIds)");
    expect(workbookData).toContain("const receiptStudentIds =");
    expect(workbookData).toContain("loadTransactionStudentIds");
    expect(workbookData).toContain("query = query.in(\"student_id\", scopedStudentIds)");
    expect(workbookData).toContain("query = query.or(receiptSearchParts.join(\",\"))");
  });

  it("documents additive indexes for common office filters", () => {
    const migration = [
      "supabase/migrations/20260503143000_office_performance_indexes.sql",
      "supabase/migrations/20260506120000_transaction_filter_performance.sql",
    ]
      .map(readRepoFile)
      .join("\n");
    const schema = readRepoFile("supabase/schema.sql");
    const expectedIndexes = [
      "idx_classes_session_status_sort",
      "idx_students_active_class_name",
      "idx_students_active_route_name",
      "idx_students_admission_no_lookup",
      "idx_receipts_payment_date_created_at",
      "idx_receipts_student_payment_date_created_at",
      "idx_receipts_duplicate_guard_lookup",
      "idx_installments_student_status_due_date",
      "idx_installments_class_status_due_date",
    ];

    for (const indexName of expectedIndexes) {
      expect(migration).toContain(`create index if not exists ${indexName}`);
      expect(schema).toContain(`create index if not exists ${indexName}`);
    }

    expect(migration).not.toContain("drop index");
    expect(migration).not.toContain("drop constraint");
  });

  it("keeps Payment Desk dues loading scoped to the selected student", () => {
    const paymentsData = readRepoFile("lib/payments/data.ts");
    const paymentsPage = readRepoFile("app/protected/payments/page.tsx");
    const paymentClient = readRepoFile("components/payments/payment-desk-mobile.tsx");
    const mobileSheet = readRepoFile("components/payments/mobile-payment-flow-sheet.tsx");

    expect(paymentsData).toContain("getPaymentDeskStudentIndex(payload:");
    expect(paymentsData).toContain("getPaymentDeskStudentIndex({ sessionLabel })");
    expect(paymentsData).toContain("payload.studentId");
    expect(paymentsData).toContain("const [studentIndex, recentReceipts, todayCollection, summary] = await Promise.all");
    expect(paymentsData).toContain("getPaymentDeskStudentSummary({");
    expect(paymentsData).toContain("studentId: payload.studentId");
    expect(paymentsData).toContain("getWorkbookStudentFinancials({");
    expect(paymentsData).toContain("studentId: payload.studentId");
    expect(paymentsData).not.toContain("getWorkbookStudentFinancials({\n      classId");
    expect(paymentsData).not.toContain(".sort((left, right) => left.fullName.localeCompare(right.fullName))");
    expect(paymentsPage).toContain("getPaymentDeskClassOptions(viewSession.sessionLabel)");
    expect(paymentsPage).toContain("getPaymentDeskReadiness({");
    expect(paymentsPage).not.toContain("getSetupWizardData()");
    expect(paymentsPage).not.toContain("getStudentFormOptions()");
    expect(paymentClient).toContain("readPaymentDeskStudentIndexCache");
    expect(paymentClient).toContain("writePaymentDeskStudentIndexCache");
    expect(paymentClient).toContain("studentIndex.length === 0");
    expect(paymentClient).toContain("prefetchStudentSummary");
    expect(paymentClient).toContain("onPrefetchStudent={(id, full) => prefetchStudentSummary(id, full)}");
    expect(mobileSheet).toContain("onMouseEnter={() => onPrefetchStudent");
    expect(mobileSheet).toContain("onTouchStart={() => onPrefetchStudent");
    expect(paymentClient).toContain("clearPaymentDeskStudentIndexCache");
  });

  it("keeps Tier 1 performance quick wins in place", () => {
    const revalidation = readRepoFile("lib/system-sync/finance-revalidation.ts");
    const parser = readRepoFile("lib/import/parser.ts");
    const templates = readRepoFile("lib/import/templates.ts");
    const dashboardData = readRepoFile("lib/dashboard/data.ts");
    const sidebarNav = readRepoFile("components/admin/sidebar-nav.tsx");
    const paymentsData = readRepoFile("lib/payments/data.ts");

    expect(revalidation).toContain("const PAYMENT_AFFECTED_PATHS = [");
    expect(revalidation).toContain("const FULL_FINANCE_PATHS = [");
    expect(revalidation).not.toContain("CORE_FINANCE_PATHS");
    expect(revalidation).toContain('"/protected/dashboard"');
    expect(revalidation).toContain('"/protected/transactions"');
    expect(revalidation).toContain('"/protected/receipts"');
    expect(revalidation).toContain('"/protected/defaulters"');
    expect(revalidation).not.toContain('"/protected/imports",');
    expect(revalidation).not.toContain('"/protected/fee-setup/generate",');

    expect(parser).not.toContain('import * as XLSX from "xlsx"');
    expect(parser).toContain('const XLSX = await import("xlsx")');
    expect(templates).not.toContain('import * as XLSX from "xlsx"');
    expect(templates).toContain('const XLSX = await import("xlsx")');

    expect(dashboardData).toContain('supabase.rpc("get_dashboard_summary"');
    expect(dashboardData).not.toContain('["dashboard-financials-active", sessionLabel]');
    expect(dashboardData).not.toContain('["dashboard-installments", sessionLabel]');
    expect(dashboardData).not.toContain("cacheSafeUnstableCache(");

    expect(sidebarNav).toContain("const eagerPrefetchHrefs = new Set");
    expect(sidebarNav).toContain('"/protected/payments"');
    expect(sidebarNav).toContain('"/protected/dashboard"');
    expect(sidebarNav).toContain('"/protected/students"');
    expect(sidebarNav).toContain("prefetch={eagerPrefetchHrefs.has(item.href)}");

    expect(paymentsData).toContain("const [policy, hasActiveClass] = await Promise.all");
    expect(paymentsData).toContain("[payment-entry-page-data] loaded in");
  });

  it("keeps payment desk student index privately cacheable within the staff session", () => {
    const route = readRepoFile("app/protected/students/index/route.ts");

    expect(route).toContain('"Cache-Control": "private, max-age=300, stale-while-revalidate=900"');
  });

  it("keeps payment posting revalidation focused", () => {
    const paymentActions = readRepoFile("app/protected/payments/actions.ts");
    const revalidation = readRepoFile("lib/system-sync/finance-revalidation.ts");
    const syncFacade = readRepoFile("lib/system-sync/finance-sync.ts");
    const dashboardData = readRepoFile("lib/dashboard/data.ts");

    expect(paymentActions).toContain("revalidateSessionFinance(");
    expect(paymentActions).not.toContain("revalidateCoreFinancePaths([studentId])");
    expect(revalidation).toContain("export function revalidateSessionFinance");
    expect(revalidation).toContain("revalidateTag(`session:${sessionLabel}`");
    expect(revalidation).toContain("export function revalidateAfterPaymentPosting");
    expect(dashboardData).toContain('supabase.rpc("get_dashboard_summary"');
    expect(syncFacade).toContain("revalidateAfterPaymentPosting");
  });
});

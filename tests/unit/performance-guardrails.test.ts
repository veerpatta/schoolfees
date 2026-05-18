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
    expect(dashboardData).toContain("financialRows.map((row) => ({");
    expect(dashboardData).toContain("getDashboardAboveFoldData");
    expect(dashboardData).toContain('row.balanceStatus === "overdue"');
    expect(dashboardData).toContain("row.pendingAmount > 0");
    expect(dashboardData).toContain('.gt("refundable_amount", 0)');
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
    expect(dashboardPage).toContain("classId=${row.classId}");
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
    expect(paymentClient).toContain("paymentDeskStudentIndexCacheKey");
    expect(paymentClient).toContain("studentIndex.length === 0");
    expect(paymentClient).toContain("prefetchStudentSummary");
    expect(paymentClient).toContain("onMouseEnter={() => prefetchStudentSummary");
    expect(paymentClient).toContain("onTouchStart={() => prefetchStudentSummary");
    expect(paymentClient).toContain("sessionStorage.removeItem(`${paymentDeskStudentIndexCacheKey}:${paymentSessionLabel}`)");
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
    expect(dashboardData).toContain("unstable_cache");
    expect(syncFacade).toContain("revalidateAfterPaymentPosting");
  });
});

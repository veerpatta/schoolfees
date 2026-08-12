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
    // The hero KPI stack and the funnel bar were folded into <MoneyBand> and
    // the boards when the dashboard moved from one long scroll to five views.
    expect(dashboardPage).toContain("MoneyBand");
    expect(dashboardPage).toContain("ViewSwitcher");
    expect(dashboardPage).toContain("QuickJumpLinks");
    expect(dashboardPage).not.toContain("FollowUpQueue");
    expect(dashboardPage).not.toContain("RecentReceipts");
    expect(dashboardPage).toContain("Show all classes");
    expect(dashboardPage).toContain("md:hidden");
  });

  it("keeps interactive Transactions limited while allowing full exports", () => {
    const officeDues = readRepoFile("lib/transactions/dues.ts");
    const exportRoute = readRepoFile("app/protected/transactions/export/route.ts");
    const workbookData = readRepoFile("lib/workbook/data.ts");
    const transactionsShell = readRepoFile("components/transactions/transactions-client-shell.tsx");

    expect(officeDues).toContain("exportAll?: boolean");
    expect(officeDues).toContain("const OFFICE_WORKBOOK_PAGE_SIZE = 100");
    expect(officeDues).toContain("limit: filters.exportAll ? null : paginationInput.pageSize + 1");
    expect(officeDues).toContain("offset: filters.exportAll ? undefined : paginationInput.offset");
    expect(officeDues).toContain("pagination: page.pagination");
    // Paging is pushed to the DB on the unchunked path; when the session receipt-id
    // filter has to be batched the same window is re-applied in JS after merging.
    expect(workbookData).toContain("query.range(rowOffset, rowOffset + explicitLimit - 1)");
    expect(workbookData).toContain("rowCap === null ? undefined : rowCap");
    expect(transactionsShell).toContain("PaginationControls");
    expect(transactionsShell).toContain("handlePageChange");
    expect(exportRoute).toContain("exportAll: true");
  });

  it("keeps Tier 3 database refreshes queued and indexed", () => {
    const migration = readRepoFile("supabase/migrations/20260523213000_tier3_finance_performance.sql");
    const schema = readRepoFile("supabase/schema.sql");

    for (const source of [migration, schema]) {
      expect(source).toContain("create extension if not exists pg_cron");
      expect(source).toContain("idx_v_workbook_financials_session_status");
      expect(source).toContain("idx_v_workbook_installments_session");
      expect(source).toContain("workbook_materialized_view_refresh_queue");
      expect(source).toContain("refresh_workbook_materialized_views_if_requested");
      expect(source).toContain("refresh_financial_materialized_views(true)");
      expect(source).toContain("cron.schedule");
      expect(source).toContain("'*/2 * * * *'");
      expect(source).not.toContain("perform public.refresh_financial_materialized_views(false)");
    }

    // The Tier 3 migration introduced the async queue trigger. The live schema
    // (and 20260530073353_refresh_backstop_on_skip) has since evolved to a
    // synchronous refresh with the queue + 2-min cron kept as a self-healing
    // backstop when a contended refresh is skipped.
    expect(migration).toContain("queue_workbook_materialized_view_refresh");
    // Lives in the migration, not the catalog: it is a comment outside the
    // function body, and schema.sql is now generated from pg_catalog.
    expect(readRepoFile("supabase/migrations/20260530073353_refresh_backstop_on_skip.sql")).toContain(
      "deferred to 2-min backstop",
    );
  });

  it("keeps Defaulters bounded: session-scoped fetch, single pass, short call queue render", () => {
    const defaultersData = readRepoFile("lib/defaulters/data.ts");
    const defaultersTypes = readRepoFile("lib/defaulters/types.ts");
    const defaultersPage = readRepoFile("app/protected/defaulters/page.tsx");
    const defaultersWorkspace = readRepoFile("components/defaulters/defaulters-workspace.tsx");

    // Pagination metadata type is retained (drives the listed-count badge).
    expect(defaultersTypes).toContain("export type DefaultersPagination");
    expect(defaultersData).toContain("[defaulters-page-data] loaded");
    expect(defaultersData).toContain("pagination: buildPagination(");
    // The query is scoped to a single academic session (not every session).
    expect(defaultersData).toContain("resolvedSessionLabel");
    // Single pass: contact summaries are fetched once inside data.ts, so the
    // page must not re-fetch them separately (the old two-pass pattern).
    expect(defaultersPage).not.toContain("getContactSummariesForStudents");
    expect(defaultersPage).toContain("data.contactSummaries");
    expect(defaultersPage).toContain("data.pagination.visibleStart");
    // Filters remain list-wide; the DOM stays light because the default view
    // renders the already-ranked short call queue instead of the whole list.
    expect(defaultersWorkspace).toContain("buildRecoveryDesk");
    expect(defaultersWorkspace).toContain("recoveryDesk.nextBestRows");
  });

  it("keeps Defaulters reads free of blocking writes and duplicated payload", () => {
    const defaultersData = readRepoFile("lib/defaulters/data.ts");
    const defaultersActions = readRepoFile("app/protected/defaulters/actions.ts");
    const defaultersPage = readRepoFile("app/protected/defaulters/page.tsx");

    // refresh_defaulter_recovery_state is a WRITE. It used to be awaited in the
    // middle of the page loader, between two Promise.all batches, which forced
    // them to run in series on every render. It belongs on the write path.
    expect(defaultersData).not.toContain("await refreshDefaulterRecoveryState(");
    expect(defaultersData).toContain("after(() => {");
    expect(defaultersActions).toContain("await refreshDefaulterRecoveryState(");

    // The session-label fallback is not worth a blocking round trip when the
    // caller already named a session — which every real caller does.
    expect(defaultersData).not.toContain("const policy = await getFeePolicySummary();");
    expect(defaultersData).toContain(
      "sessionLabel ?? (await getFeePolicySummary()).academicSessionLabel",
    );

    // One array reference to both client components, so the row set is
    // serialized into the flight payload once rather than twice.
    expect(defaultersPage).not.toContain("rows={data.rows.map(");
    expect(defaultersPage).toContain("rows={data.rows}");
  });

  it("fetches workbook pages in a window without weakening the short-page stop", () => {
    const chunk = readRepoFile("lib/helpers/chunk.ts");

    // Page 0 stays a lone request: most queries fit in one page, and
    // speculating there would triple the traffic of the common case.
    expect(chunk).toContain("const firstResult = await fetchPage(0, pageSize - 1);");
    expect(chunk).toContain("await Promise.all(");
    // The end-of-data signal must remain a short page, never an assumed row
    // count — a cap-keyed loop is what silently truncated the dashboard before.
    expect(chunk).toContain("if (page.length < pageSize)");
    expect(chunk).not.toMatch(/page\.length\s*<\s*\d+/);
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
    // scopedStudentIds (class/route) is now intersected with an explicit id
    // list (segment filters) before it reaches the query.
    expect(workbookData).toContain("query = query.in(\"student_id\", effectiveStudentIds)");
    expect(workbookData).toContain("const effectiveStudentIds =");
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
    // The two per-query caches the consolidated summary replaced must stay gone.
    expect(dashboardData).not.toContain('["dashboard-financials-active", sessionLabel]');
    expect(dashboardData).not.toContain('["dashboard-installments", sessionLabel]');

    // Caching the consolidated summary itself IS wanted -- it is what makes
    // switching dashboard boards cheap, since every ?view= click is a fresh
    // server navigation that this call blocks (177ms against live 2026-27).
    // The guardrail is that it stays tied to the tag every money path busts,
    // and keyed by the school day so it rolls over on its own.
    expect(dashboardData).toContain('["dashboard-summary", sessionLabel, today]');
    expect(dashboardData).toContain("tags: [`session:${sessionLabel}`]");
    // And a refund has to bust that tag too, or the cache serves pre-refund
    // numbers until the next posting happens to clear it.
    expect(readRepoFile("app/protected/finance-controls/actions.ts")).toContain(
      "revalidateSessionFinance(sessionLabel)",
    );

    expect(sidebarNav).toContain("const eagerPrefetchHrefs = new Set");
    expect(sidebarNav).toContain('"/protected/payments"');
    expect(sidebarNav).toContain('"/protected/dashboard"');
    expect(sidebarNav).toContain('"/protected/students"');
    // eagerPrefetchHrefs.has(item.href) is now bound to the local `isEager`
    // const and reused for the prefetch prop. Either form keeps the eager set
    // wired up.
    expect(sidebarNav).toMatch(
      /prefetch=\{(?:eagerPrefetchHrefs\.has\(item\.href\)|isEager)\}/,
    );
    expect(sidebarNav).toContain("eagerPrefetchHrefs.has(item.href)");

    expect(paymentsData).toContain("const [policy, hasActiveClass] = await Promise.all");
    expect(paymentsData).toContain("[payment-entry-page-data] loaded in");
  });

  it("keeps Tier 2 architecture wins in place", () => {
    const dashboardData = readRepoFile("lib/dashboard/data.ts");
    const dashboardPage = readRepoFile("app/protected/dashboard/page.tsx");
    const dashboardPrefetcher = readRepoFile("components/dashboard/dashboard-prefetcher.tsx");
    const transactionsShell = readRepoFile("components/transactions/transactions-client-shell.tsx");
    const transactionsLazyTables = readRepoFile("components/transactions/transactions-lazy-tables.tsx");
    const paymentClient = readRepoFile("components/payments/payment-desk-mobile.tsx");
    const feePolicy = readRepoFile("lib/fees/policy.ts");
    const staffSession = readRepoFile("lib/supabase/session.ts");

    expect(dashboardData).toContain('supabase.rpc("get_dashboard_summary"');
    expect(feePolicy).toContain('import { cache } from "react"');
    expect(feePolicy).toContain("getFeePolicySummaryForRequest = cache(");
    expect(feePolicy).toContain("getFeePolicyForSessionForRequest = cache(");
    expect(staffSession).toContain('import { cache } from "react"');
    expect(staffSession).toContain("const _getAuthenticatedStaffOnce = cache(");

    expect(transactionsShell).toContain('import dynamic from "next/dynamic"');
    expect(transactionsShell).toContain('import("./transactions-lazy-tables")');
    expect(transactionsShell).not.toContain("function InstallmentTrackerTable");
    expect(transactionsShell).not.toContain("function DefaultersTable");
    expect(transactionsLazyTables).toContain("export function InstallmentTrackerTable");
    expect(transactionsLazyTables).toContain("export function DefaultersTable");

    expect(paymentClient).toContain("window.history.replaceState");
    expect(paymentClient).toContain('url.searchParams.set("studentId", studentId)');
    expect(paymentClient).toContain("/protected/payments/student-summary");

    expect(dashboardPage).toContain("<DashboardPrefetcher");
    expect(dashboardPrefetcher).toContain("router.prefetch");
    expect(dashboardPrefetcher).toContain('"/protected/payments"');
    expect(dashboardPrefetcher).toContain('"/protected/defaulters"');
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
    expect(revalidation).toContain("safeRevalidateTag(`session:${sessionLabel}`");
    expect(revalidation).toContain("export function revalidateAfterPaymentPosting");
    expect(dashboardData).toContain('supabase.rpc("get_dashboard_summary"');
    expect(syncFacade).toContain("revalidateAfterPaymentPosting");
  });
});

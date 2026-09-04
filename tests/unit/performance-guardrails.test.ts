import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("office performance guardrails", () => {
  it("keeps dashboard overdue counts on the already-loaded installment rows", () => {
    const dashboardData = readRepoFile("src/modules/dashboard/data/queries.ts");

    expect(dashboardData).not.toContain("overdue workbook installments");
    expect(dashboardData).not.toContain('"active students"');
    expect(dashboardData).toContain("getDashboardAboveFoldData");
    expect(dashboardData).toContain('supabase.rpc("get_dashboard_summary"');
    expect(dashboardData).toContain("p_session_label: sessionLabel");
    expect(dashboardData).toContain("overdueInstallmentCount: result.overdueInstallmentCount");
    expect(dashboardData).not.toContain("buildDashboardSummary({");
  });

  it("keeps dashboard health checks scoped to the dashboard path", () => {
    const dashboardData = readRepoFile("src/modules/dashboard/data/queries.ts");
    const dashboardPage = readRepoFile("src/app/protected/dashboard/page.tsx");

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
    const officeDues = readRepoFile("src/modules/transactions/data/dues.ts");
    const exportRoute = readRepoFile("src/app/protected/transactions/export/route.ts");
    const workbookData = readRepoFile("src/modules/fees/data/queries.ts");
    const transactionsShell = readRepoFile("src/modules/transactions/ui/transactions-client-shell.tsx");

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
    // Lowercased: schema.sql is generated from pg_catalog, and Postgres emits
  // its own casing (CREATE OR REPLACE FUNCTION, SELECT DISTINCT ON). These
  // assertions describe the schema, not its capitalisation.
  const schema = readRepoFile("supabase/schema.sql").toLowerCase();

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
    const defaultersData = readRepoFile("src/modules/defaulters/data/queries.ts");
    const defaultersTypes = readRepoFile("src/modules/defaulters/domain/types.ts");
    const defaultersPage = readRepoFile("src/app/protected/defaulters/page.tsx");
    const defaultersWorkspace = readRepoFile("src/modules/defaulters/ui/defaulters-workspace.tsx");

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
    const defaultersData = readRepoFile("src/modules/defaulters/data/queries.ts");
    const defaultersActions = readRepoFile("src/app/protected/defaulters/actions.ts");
    const defaultersPage = readRepoFile("src/app/protected/defaulters/page.tsx");

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
    const chunk = readRepoFile("src/platform/helpers/chunk.ts");

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
    const dashboardData = readRepoFile("src/modules/dashboard/data/queries.ts");
    const officeData = readRepoFile("src/modules/fees/data/office-home.ts");
    const workbookData = readRepoFile("src/modules/fees/data/queries.ts");

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
    // Lowercased: schema.sql is generated from pg_catalog, and Postgres emits
  // its own casing (CREATE OR REPLACE FUNCTION, SELECT DISTINCT ON). These
  // assertions describe the schema, not its capitalisation.
  const schema = readRepoFile("supabase/schema.sql").toLowerCase();
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
    const paymentsData = readRepoFile("src/modules/payments/data/queries.ts");
    const paymentsPage = readRepoFile("src/app/protected/payments/page.tsx");
    const paymentClient = readRepoFile("src/modules/payments/ui/payment-desk-mobile.tsx");
    const mobileSheet = readRepoFile("src/modules/payments/ui/mobile-payment-flow-sheet.tsx");

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
    const revalidation = readRepoFile("src/modules/system-sync/domain/finance-revalidation.ts");
    const parser = readRepoFile("src/modules/imports/domain/parser.ts");
    const templates = readRepoFile("src/modules/imports/domain/templates.ts");
    const dashboardData = readRepoFile("src/modules/dashboard/data/queries.ts");
    const sidebarNav = readRepoFile("src/ui/shell/sidebar-nav.tsx");
    const paymentsData = readRepoFile("src/modules/payments/data/queries.ts");

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
    expect(readRepoFile("src/app/protected/finance-controls/actions.ts")).toContain(
      "revalidateSessionFinance(sessionLabel)",
    );

    expect(sidebarNav).toContain("const eagerPrefetchHrefs = new Set");
    expect(sidebarNav).toContain('"/protected/payments"');
    expect(sidebarNav).toContain('"/protected/dashboard"');
    expect(sidebarNav).toContain('"/protected/students"');
    // The eager set is no longer wired to Link's `prefetch` prop. On a
    // force-dynamic route `prefetch={true}` makes Link fetch the fully rendered
    // page, so the three daily routes were three complete server renders fired
    // during every page load. They are warmed on idle instead; `isEager` still
    // decides which links skip hover-warming because they are already covered.
    expect(sidebarNav).toContain("useIdlePrefetch(EAGER_PREFETCH_HREFS)");
    expect(sidebarNav).toContain("eagerPrefetchHrefs.has(item.href)");
    expect(sidebarNav).not.toMatch(/prefetch=\{(?:eagerPrefetchHrefs\.has\(item\.href\)|isEager)\}/);

    expect(paymentsData).toContain("const [policy, hasActiveClass] = await Promise.all");
    expect(paymentsData).toContain("[payment-entry-page-data] loaded in");
  });

  it("keeps Tier 2 architecture wins in place", () => {
    const dashboardData = readRepoFile("src/modules/dashboard/data/queries.ts");
    const dashboardPage = readRepoFile("src/app/protected/dashboard/page.tsx");
    const dashboardPrefetcher = readRepoFile("src/modules/dashboard/ui/dashboard-prefetcher.tsx");
    const transactionsShell = readRepoFile("src/modules/transactions/ui/transactions-client-shell.tsx");
    const transactionsLazyTables = readRepoFile("src/modules/transactions/ui/transactions-lazy-tables.tsx");
    const paymentClient = readRepoFile("src/modules/payments/ui/payment-desk-mobile.tsx");
    const feePolicy = readRepoFile("src/modules/fees/data/policy.ts");
    const staffSession = readRepoFile("src/platform/supabase/session.ts");

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

    // The dashboard still warms the two screens the office reaches for next,
    // but `router.prefetch` moved into useIdlePrefetch: both targets are
    // force-dynamic, so prefetching them from a mount effect meant two extra
    // full server renders competing with the dashboard's own read.
    expect(dashboardPage).toContain("<DashboardPrefetcher");
    expect(dashboardPrefetcher).toContain("useIdlePrefetch");
    expect(dashboardPrefetcher).toContain('"/protected/payments"');
    expect(dashboardPrefetcher).toContain('"/protected/defaulters"');

    const idlePrefetch = readRepoFile("src/ui/hooks/use-idle-prefetch.ts");
    expect(idlePrefetch).toContain("router.prefetch");
    // Waiting for idle is the whole point; so is not firing N at once.
    expect(idlePrefetch).toContain("requestIdleCallback");
    expect(idlePrefetch).toContain("STAGGER_MS");

    // The sidebar's three daily routes are warmed the same way. `prefetch` on a
    // force-dynamic Link fetches the fully rendered page, so leaving it true
    // put three complete server renders on every page load.
    const sidebarNav = readRepoFile("src/ui/shell/sidebar-nav.tsx");
    expect(sidebarNav).toContain("useIdlePrefetch(EAGER_PREFETCH_HREFS)");
    expect(sidebarNav).not.toContain("prefetch={isEager}");
  });

  it("keeps payment desk student index privately cacheable within the staff session", () => {
    const route = readRepoFile("src/app/protected/students/index/route.ts");

    expect(route).toContain('"Cache-Control": "private, max-age=300, stale-while-revalidate=900"');
  });

  it("keeps the workspace shell from blocking the first paint", () => {
    const shell = readRepoFile("src/ui/shell/dashboard-shell.tsx");

    // DashboardShell used to `await Promise.all([...])` on fee policy, the
    // session list and the shell pulse before emitting a single byte of
    // chrome. Because the layout was blocked, the child route's loading.tsx
    // could not paint either — so on a cold PWA launch nothing at all was on
    // screen until three database reads came back, and getShellPulse is tagged
    // `session:{label}`, which every payment posting busts.
    //
    // It is a plain function now: it starts those reads, hands the promises to
    // Suspense boundaries, and returns.
    expect(shell).toContain("export function DashboardShell(");
    expect(shell).not.toContain("export async function DashboardShell(");
    expect(shell).not.toMatch(/const \[policy, sessionSwitcher, pulse\] = await/);

    // An unawaited promise that rejects is an unhandled rejection, and a
    // failed shell read used to take down the whole workspace. A missing "Day
    // so far" figure is not a reason nobody can reach the Payment Desk.
    expect(shell).toContain("getShellPulse(viewSessionLabel).catch(() => EMPTY_SHELL_PULSE)");
    expect(shell).toContain("getSessionSwitcherData().catch(");
    expect(shell).toContain("<Suspense fallback={<ShellDayCardSkeleton />}>");

    // Same rule as before on the phone bar: only the follow-up count. A badge
    // on Collect would read as "3 payments waiting", which is not a thing.
    expect(shell).toContain("countsPromise={mobileNavCountsPromise}");
    expect(shell).toContain("countsPromise={navCountsPromise}");
  });

  it("keeps the client router cache on so a re-visit is not a fresh server render", () => {
    const config = readRepoFile("next.config.ts");

    // Next ships staleTimes.dynamic at 0: a page you were looking at ten
    // seconds ago is refetched in full when you come back to it, and on this
    // app "in full" is a complete server render because every route is
    // force-dynamic (docs/design/design-system.md §5.6 and §5.9).
    //
    // 60s is safe for money: a posting is a Server Action, and revalidatePath
    // purges this cache outright, so the cashier who posted never sees a
    // pre-receipt figure; a colleague's posting invalidates it through
    // OfficeSyncListener's router.refresh() within seconds.
    expect(config).toContain("staleTimes: {");
    expect(config).toContain("dynamic: 60");
  });

  it("keeps payment posting revalidation focused", () => {
    const paymentActions = readRepoFile("src/app/protected/payments/actions.ts");
    const revalidation = readRepoFile("src/modules/system-sync/domain/finance-revalidation.ts");
    const syncFacade = readRepoFile("src/modules/system-sync/domain/finance-sync.ts");
    const dashboardData = readRepoFile("src/modules/dashboard/data/queries.ts");

    expect(paymentActions).toContain("revalidateSessionFinance(");
    expect(paymentActions).not.toContain("revalidateCoreFinancePaths([studentId])");
    expect(revalidation).toContain("export function revalidateSessionFinance");
    expect(revalidation).toContain("safeRevalidateTag(`session:${sessionLabel}`");
    expect(revalidation).toContain("export function revalidateAfterPaymentPosting");
    expect(dashboardData).toContain('supabase.rpc("get_dashboard_summary"');
    expect(syncFacade).toContain("revalidateAfterPaymentPosting");
  });
});

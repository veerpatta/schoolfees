import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("read-only UX audit implementation", () => {
  it("students filters default to active status from one shared normalizer", () => {
    const page = readRepoFile("src/app/protected/students/page.tsx");
    const indexRoute = readRepoFile("src/app/protected/students/index/route.ts");
    const normalizer = readRepoFile("src/lib/students/filter-params.ts");
    const bulkDialog = readRepoFile("src/components/students/student-bulk-import-dialog.tsx");
    // Students chrome copy now lives in the next-intl Students namespace.
    const englishMessages = JSON.parse(readRepoFile("src/messages/en.json")) as {
      Students: Record<string, string>;
    };

    // The default lives in exactly one place. It used to live in two, and they
    // disagreed: the page rendered the active roll and the route's first
    // refetch silently widened to every student who ever attended.
    expect(normalizer).toContain('("active" as StudentListFilters["status"])');
    for (const entryPoint of [page, indexRoute]) {
      expect(entryPoint).toContain("normalizeStudentFilters");
      expect(entryPoint).not.toContain('("active" as StudentListFilters["status"])');
    }
    expect(englishMessages.Students.addStudent).toBe("Add Student");
    expect(englishMessages.Students.templatesMenuAria).toContain("More");
    expect(bulkDialog).toContain("Bulk Add Students");
    expect(bulkDialog).toContain("Bulk Update Existing Students");
    expect(englishMessages.Students.downloadAddTemplate).toBe("Download Add Template");
    expect(page).not.toContain("Import column names");
  });

  it("login stays minimal and staff-safe", () => {
    const layout = readRepoFile("src/app/auth/layout.tsx");
    const login = readRepoFile("src/ui/auth/login-form.tsx");
    const notice = readRepoFile("src/ui/auth/auth-config-notice.tsx");
    const authError = readRepoFile("src/app/auth/error.tsx");
    const combined = [layout, login, notice, authError].join("\n");

    expect(layout).toContain("Shri Veer Patta Senior Secondary School");
    expect(layout).toContain("Fee Management System");
    expect(layout).toContain("For school office use only");
    expect(login).toContain("Email");
    expect(login).toContain("Forgot password?");
    expect(combined).toContain("Sign-in is temporarily unavailable");
    expect(combined).not.toContain("Back to overview");
    expect(combined).not.toContain("Supabase");
    expect(combined).not.toContain("NEXT_PUBLIC");
    expect(combined).not.toContain("Vercel");
  });

  it("read-only finance filters no longer need manual apply buttons", () => {
    const transactions = readRepoFile("src/components/transactions/transactions-client-shell.tsx");
    const reports = readRepoFile("src/app/protected/reports/page.tsx");
    const defaulters = readRepoFile("src/components/defaulters/defaulter-filters.tsx");
    const defaultersPage = readRepoFile("src/app/protected/defaulters/page.tsx");
    const defaultersWorkspace = readRepoFile("src/components/defaulters/defaulters-workspace.tsx");
    const receipts = readRepoFile("src/app/protected/receipts/page.tsx");
    // Transactions filter labels now live in the Transactions namespace.
    const englishMessages = JSON.parse(readRepoFile("src/messages/en.json")) as {
      Transactions: Record<string, string>;
    };

    expect(transactions).toContain("handleFilterChange");
    expect(transactions).not.toContain("Apply filters");
    expect(englishMessages.Transactions.filterAcademicYearLabel).toBe("Academic year");
    expect(reports).toContain("AutoSubmitForm");
    expect(reports).not.toContain("Update view");
    expect(defaulters).toContain("AutoSubmitForm");
    expect(defaulters).not.toContain("Apply filters");
    expect(defaultersPage).toContain("<details className=");
    expect(defaultersWorkspace).toContain("callQueueWhatsappModeHint");
    expect(receipts).toContain("ReceiptsQuickLoad");
    expect(receipts).not.toContain(">Search</button>");
  });

  it("payment desk and ledger open selected students without extra load buttons", () => {
    const paymentDesk = readRepoFile("src/components/payments/payment-desk-mobile.tsx");
    const mobileSheet = readRepoFile("src/components/payments/mobile-payment-flow-sheet.tsx");
    const paymentData = readRepoFile("src/lib/payments/data.ts");
    const ledger = readRepoFile("src/components/ledger/ledger-client.tsx");

    expect(paymentDesk).not.toContain("AutoSubmitForm");
    expect(paymentDesk).not.toContain("Continue with this student");
    expect(paymentData).toContain("tryAutoPrepareSelectedStudentDues");
    expect(paymentData).toContain("Prepare dues again");
    expect(paymentDesk).toContain("/protected/payments/student-summary");
    expect(paymentDesk).toContain("<MobilePaymentFlowSheet");
    expect(mobileSheet).toContain('type="text"');
    expect(mobileSheet).toContain("onAmountChange(sanitizeDecimalInput(e.target.value))");
    expect(mobileSheet).not.toContain("<MobileNumPad");
    expect(ledger).toContain("AutoSubmitForm");
    expect(ledger).not.toContain("Open ledger");
    expect(ledger).not.toContain("Apply filters");
  });

  it("mobile payment layout avoids stacked bottom bars", () => {
    const paymentDesk = readRepoFile("src/components/payments/payment-desk-mobile.tsx");
    const mobileSheet = readRepoFile("src/components/payments/mobile-payment-flow-sheet.tsx");
    const topbar = readRepoFile("src/ui/shell/app-topbar.tsx");
    const shell = readRepoFile("src/ui/shell/dashboard-shell.tsx");
    const mobileNav = readRepoFile("src/ui/shell/mobile-bottom-nav.tsx");
    const globals = readRepoFile("src/app/globals.css");

    expect(topbar).not.toContain("hideMobileBottomNav");
    expect(topbar).toContain("hidden border-b");
    expect(topbar).toContain("md:flex");
    // Mobile v2: there is no phone app bar. Every screen renders its own
    // header, so the shell must NOT reintroduce a sticky one — and the
    // controls it used to carry have to live somewhere reachable.
    expect(shell).not.toContain("<MobileHeader");
    expect(readRepoFile("src/components/dashboard/mobile-dashboard-screen.tsx")).toContain(
      "MobileSessionPill",
    );
    expect(readRepoFile("src/app/protected/settings/page.tsx")).toContain("MobileAccountCard");
    expect(topbar).not.toContain("fixed inset-x-0 bottom-0");
    expect(shell).toContain("<MobileBottomNav");
    expect(shell).toContain("staffRole={staffRole}");
    expect(mobileNav).toContain("fixed inset-x-0 bottom-0");
    expect(mobileNav).toContain("getMobileBottomNavigation(staffRole)");
    expect(paymentDesk).toContain("<MobilePaymentFlowSheet");
    expect(mobileSheet).toContain("fixed inset-0 z-[45] md:hidden");
    expect(paymentDesk).toContain("--keyboard-offset");
    expect(paymentDesk).not.toContain("mobile-payment-cta-clearance");
    expect(globals).toContain("--mobile-safe-area-bottom");
    expect(globals).toContain("--mobile-payment-cta-offset");
    expect(globals).toContain("--mobile-payment-with-nav-offset");
  });

  it("accountant and read-only roles do not get technical diagnostics by default", () => {
    const paymentsPage = readRepoFile("src/app/protected/payments/page.tsx");

    expect(paymentsPage).toContain("canViewDiagnostics={staff.appRole === \"admin\"}");
    expect(paymentsPage).not.toContain("canViewDiagnostics={true}");
  });

  it("dashboard hides repair console and Admin Tools shows automatic sync status", () => {
    const dashboard = readRepoFile("src/app/protected/dashboard/page.tsx");
    const advanced = readRepoFile("src/app/protected/admin-tools/page.tsx");
    const navigation = readRepoFile("src/platform/config/navigation.ts");
    // Admin Tools / Dashboard wording now lives in the next-intl AdminTools
    // and Dashboard namespaces.
    const englishMessages = JSON.parse(readRepoFile("src/messages/en.json")) as {
      AdminTools: Record<string, string>;
      Dashboard: Record<string, string>;
    };

    expect(dashboard).not.toContain("System Sync Health");
    expect(dashboard).not.toContain("Generate Missing Dues");
    expect(englishMessages.Dashboard.feeRecordsAttentionAction).toBe("Open Fee Data Troubleshooting");
    expect(englishMessages.AdminTools.noticeAutoOnTitle).toBe("Automatic sync is on");
    // Admin Tools now reads health passively (no render-time reconcile).
    // Reconcile is an explicit user action via reconcileSessionAction.
    expect(advanced).toContain("getSystemSyncHealth");
    expect(advanced).not.toContain("autoReconcileSessionIfSafe");
    expect(advanced).toContain("reconcileSessionAction");
    expect(englishMessages.AdminTools.sessionStatusOpenHealth).toBe("Open Session Health");
    expect(advanced).not.toContain("Legacy repair actions");
    expect(advanced).not.toContain("Prepare missing dues");
    expect(advanced).not.toContain("Update fee records for this year");
    expect(advanced).not.toContain("Align year with Fee Setup");
    expect(advanced).not.toContain("Fix Payment Desk dues");
    expect(advanced).not.toContain("Refresh Dashboard totals");
    // Session Health is reached from the live System Status card now, not a
    // separate hub item — but its reconcile action stays fees:write gated.
    const sessionHealthActions = readRepoFile(
      "src/app/protected/admin-tools/session-health/actions.ts",
    );
    expect(sessionHealthActions).toContain('requireStaffPermission("fees:write")');
    expect(navigation).not.toContain('title: "System Readiness"');
  });

  it("uses office-friendly wording on daily pages", () => {
    const dailyFiles = [
      "src/app/protected/dashboard/page.tsx",
      "src/app/protected/students/page.tsx",
      "src/app/protected/transactions/page.tsx",
      "src/app/protected/defaulters/page.tsx",
      "src/app/protected/receipts/page.tsx",
      "src/components/payments/payment-desk-mobile.tsx",
      "src/components/students/student-list-table.tsx",
      "src/components/students/student-form.tsx",
      "src/components/ledger/ledger-client.tsx",
      "src/components/fees/fee-setup-client.tsx",
    ];
    const combined = dailyFiles.map(readRepoFile).join("\n");
    // Fee Setup / Students wording now lives in their next-intl namespaces.
    const englishMessages = JSON.parse(readRepoFile("src/messages/en.json")) as {
      FeeSetup: Record<string, string>;
      Students: Record<string, string>;
    };

    expect(englishMessages.Students.duesNotPrepared).toBe("Dues not prepared");
    expect(englishMessages.FeeSetup.topbarSave).toBe("Save Fee Setup");
    expect(englishMessages.FeeSetup.savingInfoNotice).toContain(
      "Saving updates future or unpaid dues automatically.",
    );
    expect(combined).not.toContain("Publish Fee Setup");
    expect(combined).not.toContain("Publish & Sync All");
    expect(combined).not.toContain("Computed Fee Snapshot");
    expect(combined).not.toContain("Policy-driven");
    expect(combined).not.toContain("RPC");
    expect(combined).not.toContain("schema");
    expect(combined).not.toContain("migration");
    expect(combined).not.toContain("append-only");
  });

  it("daily tables expose compact default columns", () => {
    const studentsTable = readRepoFile("src/components/students/student-list-table.tsx");
    const transactions = readRepoFile("src/components/transactions/transactions-client-shell.tsx");
    const transactionLazyTables = readRepoFile("src/components/transactions/transactions-lazy-tables.tsx");
    const defaulters = readRepoFile("src/app/protected/defaulters/page.tsx");
    const dashboard = readRepoFile("src/app/protected/dashboard/page.tsx");
    // Defaulters labels now live in the next-intl Defaulters namespace;
    // Dashboard KPI labels live in the Dashboard namespace;
    // Transactions column headers live in the Transactions namespace;
    // Students table headers live in the Students namespace.
    const englishMessages = JSON.parse(readRepoFile("src/messages/en.json")) as {
      Defaulters: Record<string, string>;
      Dashboard: Record<string, string>;
      Transactions: Record<string, string>;
      Students: Record<string, string>;
    };

    expect(englishMessages.Students.tableSrNo).toBe("SR no");
    expect(englishMessages.Students.tableStudentName).toBe("Student name");
    // The wide student table is desktop-only; the phone gets MobileStudentList
    // out of the same file (mobile v2 §STUDENTS), not a narrowed table.
    expect(studentsTable).toContain("md:table");
    expect(studentsTable).toContain("md:block");
    expect(studentsTable).toContain("MobileStudentList");
    expect(englishMessages.Transactions.tableHeaderReceiptNo).toBe("Receipt no");
    expect(transactionLazyTables).toContain("tracker-mobile-");
    expect(transactions).not.toContain("Receipt / Ref");
    expect(englishMessages.Defaulters.tableOldestDue).toBe("Oldest due");
    // Missing-dues rows now render as a responsive grid with a stable
    // missing- prefix per row (no separate mobile/desktop tables).
    expect(defaulters).toContain("missing-");
    expect(englishMessages.Defaulters.callQueueDescription).toContain(
      "Call queue for",
    );
    expect(englishMessages.Dashboard.todayCollection).toBe("Today collection");
    expect(dashboard).toContain("MoneyBand");
  });

  it("write actions still revalidate finance surfaces", () => {
    expect(readRepoFile("src/app/protected/payments/actions.ts")).toContain(
      "revalidateSessionFinance(",
    );
    expect(readRepoFile("src/app/protected/fee-setup/actions.ts")).toContain(
      "revalidateCoreFinancePaths()",
    );
    expect(readRepoFile("src/app/protected/imports/actions.ts")).toContain(
      "revalidateImportPostCommit",
    );
    expect(readRepoFile("src/app/protected/students/actions.ts")).toContain(
      "revalidateFinanceSurfaces({ studentIds: [studentId] })",
    );
  });
});

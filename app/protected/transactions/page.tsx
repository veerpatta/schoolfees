import { PageHeader } from "@/components/admin/page-header";
import { OfficeNotice, WorkflowGuard } from "@/components/office/office-ui";
import { TransactionsClientShell } from "@/components/transactions/transactions-client-shell";
import { getOfficeWorkbookData } from "@/lib/transactions/dues";
import { resolveOfficeWorkbookView } from "@/lib/transactions/workbook";
import { getOfficeWorkflowReadiness } from "@/lib/office/readiness";
import { getFeePolicySummary } from "@/lib/fees/data";
import { getSetupWizardData } from "@/lib/setup/data";
import { getStudentFormOptions } from "@/lib/students/data";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { requireAnyStaffPermission } from "@/lib/supabase/session";

type TransactionsPageProps = {
  searchParams?: Promise<{
    view?: string;
    classId?: string;
    fromDate?: string;
    paymentMode?: string;
    query?: string;
    routeId?: string;
    session?: string;
    sessionLabel?: string;
    toDate?: string;
  }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeClassId(value: string | undefined) {
  const normalized = (value ?? "").trim();
  return UUID_PATTERN.test(normalized) ? normalized : "";
}

function normalizeDate(value: string | undefined) {
  const normalized = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function normalizePaymentMode(value: string | undefined) {
  const normalized = (value ?? "").trim();
  return ["cash", "upi", "bank_transfer", "cheque"].includes(normalized)
    ? normalized
    : "";
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const staff = await requireAnyStaffPermission(
    ["receipts:view", "defaulters:view", "reports:view", "finance:view"],
    { onDenied: "redirect" },
  );

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const resolvedView = resolveOfficeWorkbookView(resolvedSearchParams?.view);
  const activeView = resolvedView.view;
  const classId = normalizeClassId(resolvedSearchParams?.classId);
  const routeId = normalizeClassId(resolvedSearchParams?.routeId);
  const viewSession = await resolveViewSession({
    searchParamSession: resolvedSearchParams?.session ?? resolvedSearchParams?.sessionLabel,
    cookieSession: await getViewSessionCookie(),
  });
  const sessionLabel = viewSession.sessionLabel;
  const searchQuery = (resolvedSearchParams?.query ?? "").trim();
  const fromDate = normalizeDate(resolvedSearchParams?.fromDate);
  const toDate = normalizeDate(resolvedSearchParams?.toDate);
  const paymentMode = normalizePaymentMode(resolvedSearchParams?.paymentMode);

  const [workbook, setup, { routeOptions, sessionOptions }, policy] = await Promise.all([
    getOfficeWorkbookData({
      view: activeView,
      classId,
      fromDate,
      paymentMode,
      routeId,
      searchQuery,
      sessionLabel,
      toDate,
      // Skip financial enrichment for the initial display render — exports still use the full route
      skipFinancials: true,
    }),
    getSetupWizardData(),
    getStudentFormOptions({ sessionLabel }),
    getFeePolicySummary(),
  ]);

  const readiness = getOfficeWorkflowReadiness(setup, staff.appRole);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance records"
        title="Transactions"
        description="Read-only receipts, dues, class register, and payment history."
      />

      {!readiness.reports.isReady ? (
        <WorkflowGuard
          title={readiness.reports.title}
          detail={readiness.reports.detail}
          actionLabel={readiness.reports.actionLabel}
          actionHref={readiness.reports.actionHref}
        />
      ) : null}

      {!resolvedView.wasRecognized ? (
        <OfficeNotice tone="warning" title="Unknown view">
          Unknown view &apos;{resolvedView.rawValue}&apos; — showing default view.
        </OfficeNotice>
      ) : null}

      <TransactionsClientShell
        activeView={activeView}
        initialFilters={{
          classId,
          query: searchQuery,
          fromDate,
          toDate,
          paymentMode,
          routeId,
          sessionLabel,
        }}
        initialWorkbook={workbook}
        classOptions={workbook.classOptions}
        sessionOptions={sessionOptions.map((s) => ({ value: s.value, label: s.label }))}
        routeOptions={routeOptions.map((r) => ({ id: r.id, label: r.label }))}
        paymentModeOptions={policy.acceptedPaymentModes.map((m) => ({ value: m.value, label: m.label }))}
        resolvedSessionLabel={sessionLabel}
      />
    </div>
  );
}

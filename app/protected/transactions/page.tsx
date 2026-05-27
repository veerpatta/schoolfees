import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { OfficeNotice, WorkflowGuard } from "@/components/office/office-ui";
import { TransactionsClientShell } from "@/components/transactions/transactions-client-shell";
import { TrustBadge } from "@/components/trust/trust-badge";
import { MoneyGlossaryLink } from "@/components/ui/money-glossary";
import { getOfficeWorkbookData } from "@/lib/transactions/dues";
import { resolveOfficeWorkbookView } from "@/lib/transactions/workbook";
import { getOfficeWorkflowReadiness } from "@/lib/office/readiness";
import { getFeePolicySummary } from "@/lib/fees/data";
import { getSetupWizardDataLight } from "@/lib/setup/data";
import { getStudentFormOptions } from "@/lib/students/data";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { hasStaffPermission, requireAnyStaffPermission } from "@/lib/supabase/session";
import { listWhatsappTemplates } from "@/lib/whatsapp-templates/data";
import { getTodayReceiptSnapshot } from "@/lib/workbook/data";

type TransactionsPageProps = {
  searchParams?: Promise<{
    view?: string;
    classId?: string;
    fromDate?: string;
    paymentMode?: string;
    page?: string;
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

function normalizePage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const t = await getTranslations("Transactions");
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
  const page = normalizePage(resolvedSearchParams?.page);

  const [
    workbook,
    setup,
    { routeOptions, sessionOptions },
    policy,
    todaySnapshot,
    whatsappTemplates,
  ] = await Promise.all([
    getOfficeWorkbookData({
      view: activeView,
      classId,
      fromDate,
      paymentMode,
      page,
      routeId,
      searchQuery,
      sessionLabel,
      toDate,
      // Skip financial enrichment for the initial display render — exports still use the full route
      skipFinancials: true,
    }),
    getSetupWizardDataLight(),
    getStudentFormOptions({ sessionLabel }),
    getFeePolicySummary(),
    // Lean aggregate query: only payment_mode + total_amount for today's
    // receipts. Previously this used getWorkbookTransactions with the full
    // 4-table nested embed (students > classes + routes) just to sum mode
    // totals — dropped the per-row join entirely.
    getTodayReceiptSnapshot({ sessionLabel }),
    // Templates power the bulk-WhatsApp draft on the Defaulters view inside
    // the Transactions tab. Cheap query (small table) — load alongside.
    listWhatsappTemplates({ onlyActive: true }).catch(() => []),
  ]);

  const readiness = getOfficeWorkflowReadiness(setup, staff.appRole);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TrustBadge source={t("trustBadgeSource")}>
              {t("trustBadgeBody")}
            </TrustBadge>
            <MoneyGlossaryLink />
          </div>
        }
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
        <OfficeNotice tone="warning" title={t("unknownViewTitle")}>
          {t("unknownViewBody", { value: resolvedView.rawValue })}
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
          page,
          routeId,
          sessionLabel,
        }}
        initialWorkbook={workbook}
        classOptions={workbook.classOptions}
        sessionOptions={sessionOptions.map((s) => ({ value: s.value, label: s.label }))}
        routeOptions={routeOptions.map((r) => ({ id: r.id, label: r.label }))}
        paymentModeOptions={policy.acceptedPaymentModes.map((m) => ({ value: m.value, label: m.label }))}
        resolvedSessionLabel={sessionLabel}
        todaySnapshot={todaySnapshot}
        canCloseBalance={hasStaffPermission(staff, "finance:write")}
        whatsappTemplates={whatsappTemplates}
      />
    </div>
  );
}

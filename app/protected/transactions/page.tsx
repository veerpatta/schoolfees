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
import { normalizePaymentModeFilter } from "@/lib/transactions/payment-modes";
import { parseSegments } from "@/lib/segments/student-segments";
import {
  searchParamInteger,
  searchParamIsoDate,
  searchParamString,
  type SearchParamValue,
} from "@/lib/helpers/search-params";

type TransactionsPageProps = {
  // Every one of these is `string | string[]` at runtime — Next hands a page an
  // array whenever a parameter repeats, which is what a re-shared link
  // produces. Typing them as plain strings is why `(value ?? "").trim()` and
  // `raw.split(",")` below threw out of this Server Component and took the
  // whole page down (Sentry SCHOOLFEES-F).
  searchParams?: Promise<{
    view?: SearchParamValue;
    classId?: SearchParamValue;
    fromDate?: SearchParamValue;
    paymentMode?: SearchParamValue;
    page?: SearchParamValue;
    query?: SearchParamValue;
    routeId?: SearchParamValue;
    seg?: SearchParamValue;
    session?: SearchParamValue;
    sessionLabel?: SearchParamValue;
    toDate?: SearchParamValue;
  }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeClassId(value: SearchParamValue) {
  const normalized = searchParamString(value);
  return UUID_PATTERN.test(normalized) ? normalized : "";
}

function normalizeDate(value: SearchParamValue) {
  return searchParamIsoDate(value) ?? "";
}

function normalizePage(value: SearchParamValue) {
  return searchParamInteger(value, { min: 1, max: 100_000 }) ?? 1;
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
  const searchQuery = searchParamString(resolvedSearchParams?.query);
  const fromDate = normalizeDate(resolvedSearchParams?.fromDate);
  const toDate = normalizeDate(resolvedSearchParams?.toDate);
  const paymentMode = normalizePaymentModeFilter(resolvedSearchParams?.paymentMode);
  const page = normalizePage(resolvedSearchParams?.page);
  const segments = parseSegments(resolvedSearchParams?.seg);

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
      segments,
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
    // Flex gap, not space-y: `space-y` still spaces around `display:none`
    // children, so the desktop-only header would leave a band above the
    // phone's sticky chip header.
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        /* The phone opens on its own sticky header (title + read-only chip +
           day and view chips) inside the client shell. */
        hideOnMobile
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
        canReverseReceipts={hasStaffPermission(staff, "payments:reverse_any")}
        canPrintReceipts={hasStaffPermission(staff, "receipts:print")}
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
          segments,
        }}
        initialWorkbook={workbook}
        classOptions={workbook.classOptions}
        sessionOptions={sessionOptions.map((s) => ({ value: s.value, label: s.label }))}
        routeOptions={routeOptions.map((r) => ({ id: r.id, label: r.label }))}
        paymentModeOptions={policy.acceptedPaymentModes.map((m) => ({ value: m.value, label: m.label }))}
        resolvedSessionLabel={sessionLabel}
        todaySnapshot={todaySnapshot}
        whatsappTemplates={whatsappTemplates}
      />
    </div>
  );
}

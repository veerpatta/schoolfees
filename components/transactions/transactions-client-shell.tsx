"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronLeft, ChevronRight, CreditCard, Printer, SlidersHorizontal, User, X } from "lucide-react";

import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { SavedViewsTabs } from "@/components/data-table/saved-views-tabs";
import { ReversedBadge } from "@/components/receipts/reversed-badge";
import { SummaryRow, SummaryCell } from "@/components/data-table/summary-row";
import { Button } from "@/components/ui/button";
import type { SavedView } from "@/lib/data-table/saved-views";
import { MoneyWithDefinition } from "@/components/ui/money-with-definition";
import type { MoneyTermKey } from "@/lib/money/glossary";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate, formatTodayBadge } from "@/lib/helpers/date";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { cn } from "@/lib/utils";
import {
  officeWorkbookViewI18nPrefix,
  resolveOfficeWorkbookView,
  type OfficeWorkbookView,
} from "@/lib/transactions/workbook";

// Visible tab whitelist — Defaulters, Class Register, Receipts, Today, and
// Exports remain as URL aliases (handled by resolveOfficeWorkbookView) and
// reachable from their dedicated top-level pages, but they no longer clutter
// the Transactions filter row.
const VISIBLE_VIEW_TABS: readonly OfficeWorkbookView[] = [
  "transactions",
  "student_dues",
  "installments",
  "import_issues",
] as const;
import type {
  OfficeWorkbookData,
  OfficeWorkbookPagination,
  OfficeWorkbookStudentRow,
  OfficeWorkbookSummary,
} from "@/lib/transactions/dues";
import type { WorkbookClassOption, WorkbookTransaction } from "@/lib/workbook/data";
import { ReceiptPreviewSheet } from "@/components/receipts/receipt-preview-sheet";
import {
  BulkWhatsappProvider,
  type BulkWhatsappRow,
} from "@/components/defaulters/bulk-whatsapp-provider";
import type { WhatsappTemplate } from "@/lib/whatsapp-templates/types";
import type { CollectionRow } from "./transactions-lazy-tables";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TxnSavedState = {
  view: OfficeWorkbookView;
  classId: string;
  paymentMode: string;
  fromDate: string;
  toDate: string;
  routeId: string;
};

type FilterState = {
  classId: string;
  query: string;
  fromDate: string;
  toDate: string;
  paymentMode: string;
  page: number;
  routeId: string;
  sessionLabel: string;
};

type PaymentModeOption = { value: string; label: string };
type SessionOption = { value: string; label: string };
type RouteOption = { id: string; label: string };

export type TodaySnapshot = {
  receiptCount: number;
  total: number;
  cashTotal: number;
  upiTotal: number;
  bankTotal: number;
  chequeTotal: number;
};

export type TransactionsClientShellProps = {
  activeView: OfficeWorkbookView;
  initialFilters: FilterState;
  initialWorkbook: OfficeWorkbookData;
  classOptions: WorkbookClassOption[];
  sessionOptions: SessionOption[];
  routeOptions: RouteOption[];
  paymentModeOptions: PaymentModeOption[];
  resolvedSessionLabel: string;
  todaySnapshot: TodaySnapshot;
  canCloseBalance: boolean;
  whatsappTemplates: readonly WhatsappTemplate[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TxnTranslator = ReturnType<typeof useTranslations<"Transactions">>;

function formatPaymentModeLabel(value: string, t: TxnTranslator) {
  if (value === "upi") return t("paymentModeUpi");
  if (value === "bank_transfer") return t("paymentModeBankTransfer");
  if (value === "cheque") return t("paymentModeCheque");
  if (value === "discount") return "Discount";
  return t("paymentModeCash");
}

function modeBadgeClassName(mode: string) {
  if (mode === "cash") return "bg-success-soft text-success-soft-foreground";
  if (mode === "upi") return "bg-info-soft text-info-soft-foreground";
  if (mode === "bank_transfer") return "bg-accent/10 text-accent";
  if (mode === "cheque") return "bg-warning-soft text-warning-soft-foreground";
  if (mode === "discount") return "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200";
  return "bg-surface-2 text-muted-foreground";
}


function getPaymentModeChipClassName(mode: string, active: boolean) {
  const base = "rounded-full border px-3 py-1 text-xs font-medium transition-colors";

  if (!active) {
    return cn(base, "border-border bg-card text-muted-foreground hover:bg-surface-2 hover:text-foreground");
  }

  if (mode === "cash") {
    return cn(base, "border-success-soft-foreground/20 bg-success-soft text-success-soft-foreground");
  }

  if (mode === "upi") {
    return cn(base, "border-info-soft-foreground/20 bg-info-soft text-info-soft-foreground");
  }

  if (mode === "bank_transfer") {
    return cn(base, "border-accent/20 bg-accent/10 text-accent");
  }

  if (mode === "cheque") {
    return cn(base, "border-warning-soft-foreground/20 bg-warning-soft text-warning-soft-foreground");
  }

  if (mode === "discount") {
    return cn(base, "border-purple-300 bg-purple-100 text-purple-800 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-200");
  }

  return cn(base, "border-accent/20 bg-accent/10 text-accent");
}

function buildApiUrl(view: OfficeWorkbookView, f: FilterState) {
  const p = new URLSearchParams({ view });
  if (f.classId) p.set("classId", f.classId);
  if (f.query) p.set("query", f.query);
  if (f.fromDate) p.set("fromDate", f.fromDate);
  if (f.toDate) p.set("toDate", f.toDate);
  if (f.paymentMode) p.set("paymentMode", f.paymentMode);
  if (f.page > 1) p.set("page", String(f.page));
  if (f.routeId) p.set("routeId", f.routeId);
  if (f.sessionLabel) p.set("session", f.sessionLabel);
  return `/protected/transactions/data?${p}`;
}

function buildPageUrl(view: OfficeWorkbookView, f: FilterState) {
  const p = new URLSearchParams({ view });
  if (f.classId) p.set("classId", f.classId);
  if (f.query) p.set("query", f.query);
  if (f.fromDate) p.set("fromDate", f.fromDate);
  if (f.toDate) p.set("toDate", f.toDate);
  if (f.paymentMode) p.set("paymentMode", f.paymentMode);
  if (f.page > 1) p.set("page", String(f.page));
  if (f.routeId) p.set("routeId", f.routeId);
  if (f.sessionLabel) p.set("session", f.sessionLabel);
  return `/protected/transactions?${p}`;
}

function filtersFromUrl(): { view: OfficeWorkbookView; filters: FilterState } {
  const p = new URLSearchParams(window.location.search);
  return {
    view: resolveOfficeWorkbookView(p.get("view")).view,
    filters: {
      classId: p.get("classId") ?? "",
      query: p.get("query") ?? "",
      fromDate: p.get("fromDate") ?? "",
      toDate: p.get("toDate") ?? "",
      paymentMode: p.get("paymentMode") ?? "",
      page: Math.max(1, Number(p.get("page") ?? 1) || 1),
      routeId: p.get("routeId") ?? "",
      sessionLabel: p.get("session") ?? p.get("sessionLabel") ?? "",
    },
  };
}

// ---------------------------------------------------------------------------
// Summary Cards
// ---------------------------------------------------------------------------

function SummaryCards({ summary, t }: { summary: OfficeWorkbookSummary; t: TxnTranslator }) {
  const [showMore, setShowMore] = useState(false);
  // Top row: the four "what is the money state" KPIs. Discounts and Late-fee
  // waived used to be buried under "More totals" but they are first-class
  // signals for money clarity — promoting them keeps the audit visible.
  const top: Array<{ key: string; label: string; value: number | string; termKey?: MoneyTermKey }> = [
    { key: "students", label: t("summaryStudents"), value: summary.studentCount },
    { key: "totalDue", label: t("summaryTotalDue"), value: summary.totalDue, termKey: "totalDue" },
    { key: "outstanding", label: t("summaryOutstanding"), value: summary.totalOutstanding, termKey: "outstanding" },
    { key: "totalPaid", label: t("summaryTotalPaid"), value: summary.totalPaid, termKey: "totalPaid" },
    { key: "discounts", label: t("summaryDiscounts"), value: summary.totalDiscount, termKey: "discountTotal" },
    { key: "lateFeeWaived", label: t("summaryLateFeeWaived"), value: summary.totalLateFeeWaived, termKey: "lateFeeWaived" },
  ];
  const more = [
    { key: "transportStudents", label: t("summaryTransportStudents"), value: summary.transportStudentCount },
    { key: "tuitionTotal", label: t("summaryTuitionTotal"), value: formatInr(summary.tuitionFeeTotal) },
    { key: "transportTotal", label: t("summaryTransportTotal"), value: formatInr(summary.transportFeeTotal) },
    { key: "academicFee", label: t("summaryAcademicFee"), value: formatInr(summary.academicFeeTotal) },
    { key: "otherAdj", label: t("summaryOtherAdj"), value: formatInr(summary.otherAdjustmentTotal) },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {top.map((c) => (
          <div key={c.key} className="rounded-xl border border-border bg-surface-2 px-4 py-3">
            {c.termKey ? (
              <MoneyWithDefinition
                termKey={c.termKey}
                label={c.label}
                value={typeof c.value === "number" ? c.value : null}
                size="lg"
                layout="column"
              />
            ) : (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{c.label}</p>
                <p className="mt-1.5 text-base font-semibold text-foreground">{c.value}</p>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface-2">
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-surface-3 transition-colors"
        >
          <span>{t("summaryMoreTotals")}</span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", showMore && "rotate-180")} />
        </button>
        {showMore && (
          <div className="grid gap-3 border-t border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
            {more.map((c) => (
              <div key={c.key} className="rounded-xl border border-border bg-surface-2 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{c.label}</p>
                <p className="mt-1.5 text-base font-semibold text-foreground">{c.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transactions / Receipts table
// ---------------------------------------------------------------------------

type ReceiptSelection = {
  selectedIds: ReadonlySet<string>;
  onToggle: (receiptId: string) => void;
  onToggleAll: (visibleIds: readonly string[], selectAll: boolean) => void;
};

function TransactionsTable({
  rows,
  returnTo,
  sessionLabel,
  onPreviewReceipt,
  selection,
  t,
}: {
  rows: WorkbookTransaction[];
  returnTo: string;
  sessionLabel: string;
  onPreviewReceipt: (receiptId: string) => void;
  /**
   * Desktop-only bulk-select hook. When provided, the table renders a
   * checkbox column (header `select-all` + per-row) inside the `md:block`
   * desktop view. The mobile card layout never renders checkboxes — bulk
   * actions are a desktop-only workflow per product spec.
   */
  selection?: ReceiptSelection;
  t: TxnTranslator;
}) {
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);
  const receiptPrintHref = (receiptId: string, label: string) =>
    `/protected/receipts/${receiptId}?session=${encodeURIComponent(label)}`;
  const visibleIds = rows.map((row) => row.receiptId);
  const allVisibleSelected =
    selection !== undefined &&
    visibleIds.length > 0 &&
    visibleIds.every((id) => selection.selectedIds.has(id));
  const someVisibleSelected =
    selection !== undefined && visibleIds.some((id) => selection.selectedIds.has(id));
  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">
            {t("tableEmpty")}
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={row.receiptId}
              role="button"
              tabIndex={0}
              onClick={(event) => {
                const target = event.target as HTMLElement | null;
                if (target && target.closest('[data-row-action="true"]')) return;
                onPreviewReceipt(row.receiptId);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                const target = event.target as HTMLElement | null;
                if (target && target.closest('[data-row-action="true"]')) return;
                event.preventDefault();
                onPreviewReceipt(row.receiptId);
              }}
              className="cursor-pointer rounded-xl border border-border bg-card p-3 text-sm transition-colors hover:bg-surface-2/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              /* Transactions pages up to 150 rows; skip render work for
                 off-screen cards (same technique as the students table). */
              style={{ contentVisibility: "auto", containIntrinsicSize: "0 132px" } as React.CSSProperties}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{row.studentName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatShortDate(row.paymentDate)} · {row.classLabel}
                  </p>
                </div>
                <p
                  className={cn(
                    "shrink-0 font-semibold text-foreground tabular-nums",
                    row.isReversed && "line-through opacity-60",
                  )}
                >
                  {formatInr(row.totalAmount)}
                </p>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {row.receiptNumber} · {formatPaymentModeLabel(row.paymentMode, t)}
                {row.isReversed ? <ReversedBadge /> : null}
              </p>
              <div className="mt-2 flex flex-wrap gap-2" data-row-action="true" onClick={(event) => event.stopPropagation()}>
                <Button asChild size="sm" variant="ghost" aria-label={t("rowActionPrintAria", { number: row.receiptNumber })}>
                  <Link href={receiptPrintHref(row.receiptId, sessionLabel)} target="_blank" rel="noreferrer">
                    <Printer className="size-4" />
                    <span className="sr-only">{t("rowActionPrint")}</span>
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={withSession(`/protected/payments?studentId=${row.studentId}`)}>{t("rowActionPayment")}</Link>
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="hidden rounded-xl border border-border md:block">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {selection ? (
                <th className="w-10 px-3 py-3 text-left">
                  <input
                    type="checkbox"
                    aria-label={allVisibleSelected ? "Deselect all receipts" : "Select all receipts"}
                    checked={allVisibleSelected}
                    ref={(node) => {
                      if (node) node.indeterminate = !allVisibleSelected && someVisibleSelected;
                    }}
                    onChange={() => selection.onToggleAll(visibleIds, !allVisibleSelected)}
                    className="size-4 cursor-pointer accent-accent"
                  />
                </th>
              ) : null}
              <th className="px-4 py-3">{t("tableHeaderStudent")}</th>
              <th className="px-4 py-3">{t("tableHeaderReceiptNo")}</th>
              <th className="px-4 py-3">{t("tableHeaderMode")}</th>
              <th className="px-4 py-3 text-right">{t("tableHeaderAmount")}</th>
              <th className="w-10 px-2 py-3 text-right" aria-label={t("tableHeaderAction")} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={selection ? 6 : 5} className="px-4 py-10 text-center text-muted-foreground">{t("tableEmpty")}</td></tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.receiptId}
                  className="cursor-pointer border-t border-border transition-colors hover:bg-surface-2/30"
                  style={{ contentVisibility: "auto", containIntrinsicSize: "0 64px" } as React.CSSProperties}
                  onClick={(event) => {
                    const target = event.target as HTMLElement | null;
                    if (target && target.closest('[data-row-action="true"]')) return;
                    onPreviewReceipt(row.receiptId);
                  }}
                >
                  {selection ? (
                    <td
                      className="w-10 px-3 py-3"
                      data-row-action="true"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select receipt ${row.receiptNumber}`}
                        checked={selection.selectedIds.has(row.receiptId)}
                        onChange={() => selection.onToggle(row.receiptId)}
                        className="size-4 cursor-pointer accent-accent"
                      />
                    </td>
                  ) : null}
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{row.studentName}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.classLabel} · SR {row.admissionNo}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 font-mono text-xs text-foreground">
                      {row.receiptNumber}
                      {row.isReversed ? <ReversedBadge /> : null}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatShortDate(row.paymentDate)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                        modeBadgeClassName(row.paymentMode),
                      )}
                    >
                      {formatPaymentModeLabel(row.paymentMode, t)}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right font-semibold tabular-nums text-foreground",
                      row.isReversed && "line-through opacity-60",
                    )}
                  >
                    {formatInr(row.totalAmount)}
                  </td>
                  <td className="w-10 px-2 py-3 text-right" data-row-action="true" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button asChild size="sm" variant="ghost" className="size-8 p-0" aria-label={t("rowActionPrintAria", { number: row.receiptNumber })}>
                        <Link href={receiptPrintHref(row.receiptId, sessionLabel)} target="_blank" rel="noreferrer">
                          <Printer className="size-4" />
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost" className="size-8 p-0" aria-label={t("rowActionPaymentDesk")}>
                        <Link href={withSession(`/protected/payments?studentId=${row.studentId}`)}>
                          <CreditCard className="size-4" />
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost" className="size-8 p-0" aria-label={t("rowActionStudent")}>
                        <Link href={withSession(`/protected/students/${row.studentId}?returnTo=${encodeURIComponent(returnTo)}`)}>
                          <User className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

type StudentTableProps = {
  rows: OfficeWorkbookStudentRow[];
  sessionLabel: string;
  canCloseBalance?: boolean;
  /**
   * DefaultersTable-only: when true, renders the bulk-WhatsApp checkbox
   * column on the desktop view. Other student tables ignore this flag.
   */
  bulkSelectable?: boolean;
};

function LazyTableSkeleton() {
  // The lazy fallback renders before the parent's translator binding hits the
  // tree; the bare string is fine because it shows for a frame at most.
  return (
    <div className="rounded-xl border border-border bg-surface-2 px-4 py-8 text-center text-sm text-muted-foreground">
      Loading view...
    </div>
  );
}

const InstallmentTrackerTable = dynamic<StudentTableProps>(
  () => import("./transactions-lazy-tables").then((mod) => mod.InstallmentTrackerTable),
  { loading: () => <LazyTableSkeleton />, ssr: false },
);
const StudentDuesTable = dynamic<StudentTableProps>(
  () => import("./transactions-lazy-tables").then((mod) => mod.StudentDuesTable),
  { loading: () => <LazyTableSkeleton />, ssr: false },
);
const ClassRegisterTable = dynamic<StudentTableProps>(
  () => import("./transactions-lazy-tables").then((mod) => mod.ClassRegisterTable),
  { loading: () => <LazyTableSkeleton />, ssr: false },
);
const DefaultersTable = dynamic<StudentTableProps>(
  () => import("./transactions-lazy-tables").then((mod) => mod.DefaultersTable),
  { loading: () => <LazyTableSkeleton />, ssr: false },
);
const CollectionTable = dynamic<{ rows: CollectionRow[] }>(
  () => import("./transactions-lazy-tables").then((mod) => mod.CollectionTable),
  { loading: () => <LazyTableSkeleton />, ssr: false },
);

// ---------------------------------------------------------------------------
// Loading overlay
// ---------------------------------------------------------------------------

function LoadingOverlay({ t }: { t: TxnTranslator }) {
  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-background/60 pt-12 backdrop-blur-[1px]">
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2 text-sm text-muted-foreground shadow-sm">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        {t("loadingOverlay")}
      </div>
    </div>
  );
}

function PaginationControls({
  pagination,
  onPageChange,
  t,
}: {
  pagination: OfficeWorkbookPagination;
  onPageChange: (page: number) => void;
  t: TxnTranslator;
}) {
  const totalLabel = pagination.totalRows === null
    ? `${pagination.visibleStart}-${pagination.visibleEnd}`
    : `${pagination.visibleStart}-${pagination.visibleEnd} of ${pagination.totalRows}`;

  if (!pagination.hasPreviousPage && !pagination.hasNextPage && pagination.totalRows !== null && pagination.totalRows <= pagination.pageSize) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
      <span className="text-muted-foreground">
        {t("paginationShowing", { label: totalLabel })}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!pagination.hasPreviousPage}
          onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
        >
          <ChevronLeft className="size-4" />
          {t("paginationPrevious")}
        </Button>
        <span className="min-w-16 text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {t("paginationPage", { page: pagination.page })}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!pagination.hasNextPage}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          {t("paginationNext")}
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main shell
// ---------------------------------------------------------------------------

function TodayStrip({ snapshot, t }: { snapshot: TodaySnapshot; t: TxnTranslator }) {
  const today = formatTodayBadge(new Date());
  const modes: Array<{ key: string; label: string; value: number }> = [
    { key: "cash", label: t("todayStripModeCash"), value: snapshot.cashTotal },
    { key: "upi", label: t("todayStripModeUpi"), value: snapshot.upiTotal },
    { key: "bank", label: t("todayStripModeBank"), value: snapshot.bankTotal },
    { key: "cheque", label: t("todayStripModeCheque"), value: snapshot.chequeTotal },
  ];
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t("todayStripPrefix", { date: today })}
        </span>
        <span className="font-semibold text-foreground">
          {t("todayStripReceipts", { count: snapshot.receiptCount })}
        </span>
        <span className="font-semibold tabular-nums text-accent">{formatInr(snapshot.total)}</span>
        <span className="hidden md:inline text-muted-foreground">·</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {modes.map((mode) => (
            <span key={mode.key} className="tabular-nums">
              <span className="font-medium text-foreground">{mode.label}</span>{" "}
              {formatInr(mode.value)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TransactionsClientShell({
  activeView: initialView,
  initialFilters,
  initialWorkbook,
  classOptions,
  sessionOptions,
  routeOptions,
  paymentModeOptions,
  resolvedSessionLabel,
  todaySnapshot,
  canCloseBalance,
  whatsappTemplates,
}: TransactionsClientShellProps) {
  const t = useTranslations("Transactions");
  const tCommon = useTranslations("Common");
  const [activeView, setActiveView] = useState(initialView);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [workbook, setWorkbook] = useState<OfficeWorkbookData>(initialWorkbook);
  const [isLoading, setIsLoading] = useState(false);
  const [previewReceiptId, setPreviewReceiptId] = useState<string | null>(null);
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);
  // Desktop-only bulk-select for the Transactions / Receipts views. Mobile
  // cards never render checkboxes — see TransactionsTable below.
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showMoreFilters, setShowMoreFilters] = useState(
    () => Boolean(
      initialFilters.fromDate || initialFilters.toDate ||
      initialFilters.routeId
    )
  );

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (view: OfficeWorkbookView, f: FilterState) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    try {
      const res = await fetch(buildApiUrl(view, f), { signal: controller.signal });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      setWorkbook(await res.json() as OfficeWorkbookData);
    } catch (err) {
      // Aborted requests can surface either as a DOMException(AbortError) or as
      // a generic TypeError("Failed to fetch") during route teardown. Both are
      // expected when the next request supersedes this one — only log real
      // errors so production console telemetry stays clean.
      const isAborted = controller.signal.aborted || (err as Error)?.name === "AbortError";
      if (!isAborted) console.error("[TransactionsShell] fetch error:", err);
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, []);

  // Cancel any in-flight fetch and pending debounce when the shell unmounts so
  // a navigated-away component never logs a stale request.
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Sync state on browser back/forward
  useEffect(() => {
    function onPop() {
      const { view, filters: f } = filtersFromUrl();
      setActiveView(view);
      setFilters(f);
      fetchData(view, f);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [fetchData]);

  function scheduleOrFetch(view: OfficeWorkbookView, newFilters: FilterState, debounce: boolean) {
    window.history.replaceState(null, "", buildPageUrl(view, newFilters));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (debounce) {
      // 60 ms feels instant while still batching rapid keystrokes — matches
      // the Payment Desk search responsiveness instead of the previous 320 ms.
      debounceRef.current = setTimeout(() => fetchData(view, newFilters), 60);
    } else {
      fetchData(view, newFilters);
    }
  }

  function handleFilterChange(key: keyof FilterState, value: string, debounce = false) {
    const newFilters = { ...filters, [key]: value, page: 1 };
    setFilters(newFilters);
    setActiveSavedViewId(null);
    scheduleOrFetch(activeView, newFilters, debounce);
  }

  function handlePaymentModeToggle(mode: string) {
    handleFilterChange("paymentMode", filters.paymentMode === mode ? "" : mode);
  }

  function handleViewChange(view: OfficeWorkbookView) {
    const nextFilters = { ...filters, page: 1 };
    setActiveView(view);
    setFilters(nextFilters);
    setActiveSavedViewId(null);
    // Selection is scoped to the receipts list; clear it when the user
    // switches views so a stale selection can't trigger a wrong action.
    setSelectedReceiptIds(new Set());
    window.history.pushState(null, "", buildPageUrl(view, nextFilters));
    fetchData(view, nextFilters);
  }

  function handleReset() {
    const empty: FilterState = { classId: "", query: "", fromDate: "", toDate: "", paymentMode: "", page: 1, routeId: "", sessionLabel: "" };
    setFilters(empty);
    setShowMoreFilters(false);
    setActiveSavedViewId(null);
    window.history.replaceState(null, "", buildPageUrl(activeView, empty));
    fetchData(activeView, empty);
  }

  function handlePageChange(page: number) {
    const nextFilters = { ...filters, page };
    setFilters(nextFilters);
    scheduleOrFetch(activeView, nextFilters, false);
  }

  function applyTxnView(view: SavedView<TxnSavedState>) {
    const nextFilters = {
      ...filters,
      classId: view.state.classId,
      paymentMode: view.state.paymentMode,
      fromDate: view.state.fromDate,
      toDate: view.state.toDate,
      routeId: view.state.routeId,
      page: 1,
    };
    setFilters(nextFilters);
    setActiveView(view.state.view);
    setActiveSavedViewId(view.id);
    window.history.pushState(null, "", buildPageUrl(view.state.view, nextFilters));
    fetchData(view.state.view, nextFilters);
  }

  const txnCurrentState: TxnSavedState = {
    view: activeView,
    classId: filters.classId,
    paymentMode: filters.paymentMode,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    routeId: filters.routeId,
  };

  // Badge counts only secondary-panel filters — primary-row filters (search, class, mode chips) are always visible
  const extraActiveCount = [filters.fromDate, filters.toDate, filters.routeId, filters.sessionLabel].filter(Boolean).length;
  const effectiveSession = filters.sessionLabel || resolvedSessionLabel;
  const activeViewPrefix = officeWorkbookViewI18nPrefix[activeView];
  const activeMeta = {
    title: tCommon(`workbookViews.${activeViewPrefix}Title` as Parameters<typeof tCommon>[0]),
    shortTitle: tCommon(`workbookViews.${activeViewPrefix}Short` as Parameters<typeof tCommon>[0]),
    description: tCommon(`workbookViews.${activeViewPrefix}Description` as Parameters<typeof tCommon>[0]),
  };

  // Return-to URL for action links
  const returnTo = buildPageUrl(activeView, filters);

  return (
    <div className="space-y-6">
      <TodayStrip snapshot={todaySnapshot} t={t} />

      {/* ── View + Filters ── */}
      <SectionCard
        title={t("viewFilterTitle")}
        description={t("viewFilterDescription")}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge label={t("readOnlyBadge")} tone="accent" />
            <Button asChild size="sm" variant="outline">
              <Link href={appendSessionParam("/protected/payments", effectiveSession)}>{t("paymentDeskAction")}</Link>
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <SavedViewsTabs
            tableKey="vpps.transactions.views"
            activeId={activeSavedViewId}
            onApply={applyTxnView}
            currentState={txnCurrentState}
            className="-mt-1 mb-2"
          />
          {/* View tabs — only the four core views render as filter chips.
              Other views (Today, Receipts, Defaulters, Class Register) live
              on their own dedicated pages and remain reachable via URL. */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1.5 no-scrollbar md:mx-0 md:px-0 md:grid md:grid-cols-4 xl:grid-cols-4 md:gap-2 md:overflow-visible">
            {VISIBLE_VIEW_TABS.map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => handleViewChange(view)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap text-center md:inline-flex md:w-full md:items-center md:justify-center md:px-3 md:py-2 md:text-sm md:leading-4",
                  activeView === view
                    ? "bg-accent border-accent text-accent-foreground"
                    : "bg-surface-2 border-border text-foreground hover:bg-surface-3"
                )}
              >
                {tCommon(
                  `workbookViews.${officeWorkbookViewI18nPrefix[view]}Short` as Parameters<typeof tCommon>[0],
                )}
              </button>
            ))}
          </div>

          {/* ── Compact filter bar ── */}
          <div className="space-y-2">
            {/* Primary row: always visible */}
            <div className="flex flex-wrap items-end gap-2">
              {/* Search */}
              <div className="min-w-[180px] flex-1">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground" htmlFor="txn-query">
                  {t("filterSearchLabel")}
                </label>
                <input
                  id="txn-query"
                  type="search"
                  value={filters.query}
                  onChange={(e) => handleFilterChange("query", e.target.value, true)}
                  placeholder={t("filterSearchPlaceholder")}
                  className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              {/* Class */}
              <div className="min-w-[140px] flex-1 max-w-[220px]">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground" htmlFor="txn-class">
                  {t("filterClassLabel")}
                </label>
                <select
                  id="txn-class"
                  value={filters.classId}
                  onChange={(e) => handleFilterChange("classId", e.target.value)}
                  className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">{t("filterClassAll")}</option>
                  {classOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>

              {/* Payment mode chips */}
              <div className="flex flex-wrap items-end gap-1.5">
                {paymentModeOptions.map((option) => {
                  const active = filters.paymentMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={getPaymentModeChipClassName(option.value, active)}
                      aria-pressed={active}
                      onClick={() => handlePaymentModeToggle(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {/* More filters toggle */}
              <button
                type="button"
                onClick={() => setShowMoreFilters((v) => !v)}
                className={cn(
                  "mt-auto flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors",
                  showMoreFilters
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface-2 text-foreground hover:bg-surface-3"
                )}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {t("filterFiltersToggle")}
                {extraActiveCount > 0 && (
                  <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {extraActiveCount}
                  </span>
                )}
              </button>

              {/* Reset — visible when any filter is active */}
              {(filters.query || filters.classId || filters.paymentMode || extraActiveCount > 0) && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="mt-auto flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-surface-2 transition-colors"
                  title={t("filterClearTitle")}
                >
                  <X className="h-3.5 w-3.5" /> {t("filterClear")}
                </button>
              )}
            </div>

            {/* Date-range quick chips — visible above the secondary filter row so
                staff can jump to common windows without opening More filters. */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: t("chipToday"), key: "Today", days: 0 },
                { label: t("chipYesterday"), key: "Yesterday", days: -1 },
                { label: t("chipThisWeek"), key: "This week", days: -7, weekToDate: true },
                { label: t("chipThisMonth"), key: "This month", days: 0, monthToDate: true },
              ].map((chip) => {
                const isActive = (() => {
                  if (!filters.fromDate || !filters.toDate) return false;
                  const today = new Date();
                  const todayIso = today.toISOString().slice(0, 10);
                  if (chip.key === "Today") return filters.fromDate === todayIso && filters.toDate === todayIso;
                  if (chip.key === "Yesterday") {
                    const y = new Date(today);
                    y.setDate(y.getDate() - 1);
                    const yIso = y.toISOString().slice(0, 10);
                    return filters.fromDate === yIso && filters.toDate === yIso;
                  }
                  return false;
                })();
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const todayIso = today.toISOString().slice(0, 10);
                      let fromIso = todayIso;
                      let toIso = todayIso;
                      if (chip.key === "Yesterday") {
                        const y = new Date(today);
                        y.setDate(y.getDate() - 1);
                        fromIso = y.toISOString().slice(0, 10);
                        toIso = fromIso;
                      } else if (chip.key === "This week") {
                        const start = new Date(today);
                        start.setDate(today.getDate() - today.getDay());
                        fromIso = start.toISOString().slice(0, 10);
                      } else if (chip.key === "This month") {
                        const start = new Date(today.getFullYear(), today.getMonth(), 1);
                        fromIso = start.toISOString().slice(0, 10);
                      }
                      const newFilters = { ...filters, fromDate: fromIso, toDate: toIso, page: 1 };
                      setFilters(newFilters);
                      scheduleOrFetch(activeView, newFilters, false);
                    }}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      isActive
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-card text-foreground hover:bg-surface-2",
                    )}
                  >
                    {chip.label}
                  </button>
                );
              })}
              {(filters.fromDate || filters.toDate) ? (
                <button
                  type="button"
                  onClick={() => {
                    const newFilters = { ...filters, fromDate: "", toDate: "", page: 1 };
                    setFilters(newFilters);
                    scheduleOrFetch(activeView, newFilters, false);
                  }}
                  className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-surface-2"
                >
                  {t("filterClearDates")}
                </button>
              ) : null}
            </div>

            {/* Secondary row: date range, route, academic year */}
            {showMoreFilters && (
              <div className="grid gap-2 rounded-lg border border-border bg-surface-2/50 p-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* Session */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground" htmlFor="txn-session">
                    {t("filterAcademicYearLabel")}
                  </label>
                  <select
                    id="txn-session"
                    value={filters.sessionLabel}
                    onChange={(e) => handleFilterChange("sessionLabel", e.target.value)}
                    className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="">{t("filterAcademicYearCurrent")}</option>
                    {sessionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                {/* Route */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground" htmlFor="txn-route">
                    {t("filterRouteLabel")}
                  </label>
                  <select
                    id="txn-route"
                    value={filters.routeId}
                    onChange={(e) => handleFilterChange("routeId", e.target.value)}
                    className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="">{t("filterRouteAll")}</option>
                    {routeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>

                {/* From date */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground" htmlFor="txn-from">
                    {t("filterFromLabel")}
                  </label>
                  <input
                    id="txn-from"
                    type="date"
                    value={filters.fromDate}
                    onChange={(e) => {
    const newFilters = { ...filters, fromDate: e.target.value, page: 1 };
                      setFilters(newFilters);
                      if (!e.target.value || newFilters.toDate) scheduleOrFetch(activeView, newFilters, false);
                    }}
                    className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  />
                </div>

                {/* To date */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground" htmlFor="txn-to">
                    {t("filterToLabel")}
                  </label>
                  <input
                    id="txn-to"
                    type="date"
                    value={filters.toDate}
                    onChange={(e) => {
                      const newFilters = { ...filters, toDate: e.target.value, page: 1 };
                      setFilters(newFilters);
                      if (!e.target.value || newFilters.fromDate) scheduleOrFetch(activeView, newFilters, false);
                    }}
                    className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Summary cards ── */}
      {"summary" in workbook && (
        <SectionCard
          title={activeView === "class_register" ? t("summaryClassTitle") : t("summaryWorkingTitle")}
          description={
            activeView === "class_register"
              ? t("summaryClassDescription")
              : t("summaryWorkingDescription")
          }
        >
          <SummaryCards summary={(workbook as { summary: OfficeWorkbookSummary }).summary} t={t} />
        </SectionCard>
      )}

      {/* ── Data table (with loading overlay) ── */}
      <div className="relative">
        {isLoading && <LoadingOverlay t={t} />}
        {(workbook.view === "transactions" || workbook.view === "receipts") && (
          <SectionCard
            title={activeMeta.title}
            description={
              workbook.view === "transactions"
                ? t("transactionsDescriptionShort")
                : t("receiptsDescriptionShort")
            }
          >
            <TransactionsTable
              rows={workbook.rows}
              returnTo={returnTo}
              sessionLabel={effectiveSession}
              onPreviewReceipt={(receiptId) => setPreviewReceiptId(receiptId)}
              selection={{
                selectedIds: selectedReceiptIds,
                onToggle: (receiptId) =>
                  setSelectedReceiptIds((current) => {
                    const next = new Set(current);
                    if (next.has(receiptId)) next.delete(receiptId);
                    else next.add(receiptId);
                    return next;
                  }),
                onToggleAll: (visibleIds, selectAll) =>
                  setSelectedReceiptIds((current) => {
                    const next = new Set(current);
                    for (const id of visibleIds) {
                      if (selectAll) next.add(id);
                      else next.delete(id);
                    }
                    return next;
                  }),
              }}
              t={t}
            />
          </SectionCard>
        )}
        {workbook.view === "installments" && (
          <SectionCard title={t("duesTrackerTitle")} description={t("duesTrackerDescription")}>
            <InstallmentTrackerTable rows={workbook.rows} sessionLabel={effectiveSession} />
          </SectionCard>
        )}
        {workbook.view === "student_dues" && (
          <SectionCard title={t("studentDuesTitle")} description={t("studentDuesDescription")}>
            <StudentDuesTable rows={workbook.rows} sessionLabel={effectiveSession} canCloseBalance={canCloseBalance} />
          </SectionCard>
        )}
        {workbook.view === "class_register" && (
          <SectionCard title={t("classRegisterTitle")} description={t("classRegisterDescription")}>
            <ClassRegisterTable rows={workbook.rows} sessionLabel={effectiveSession} />
          </SectionCard>
        )}
        {workbook.view === "defaulters" && (
          <SectionCard title={t("defaultersTitle")} description={t("defaultersDescription")}>
            <BulkWhatsappProvider
              rows={(workbook.rows as OfficeWorkbookStudentRow[]).map<BulkWhatsappRow>((row) => ({
                studentId: row.studentId,
                admissionNo: row.admissionNo,
                fullName: row.studentName,
                fatherName: row.fatherName,
                fatherPhone: row.fatherPhone,
                classLabel: row.classLabel,
                totalPending: row.outstandingAmount,
                oldestDueDate: row.nextDueDate,
              }))}
              templates={[...whatsappTemplates]}
              sessionLabel={effectiveSession}
            >
              <DefaultersTable
                rows={workbook.rows}
                sessionLabel={effectiveSession}
                bulkSelectable
              />
            </BulkWhatsappProvider>
          </SectionCard>
        )}
        {workbook.view === "collection_today" && (
          <SectionCard title={t("collectionTodayTitle")} description={t("collectionTodayDescription")}>
            <CollectionTable rows={workbook.rows as CollectionRow[]} />
          </SectionCard>
        )}
        {workbook.view === "import_issues" && (
          <SectionCard title={t("importIssuesTitle")} description={t("importIssuesDescription")}>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-full text-left text-sm">
                <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {[
                      { key: "row", label: t("importColRow") },
                      { key: "student", label: t("importColStudent") },
                      { key: "srNo", label: t("importColSrNo") },
                      { key: "class", label: t("importColClass") },
                      { key: "status", label: t("importColStatus") },
                      { key: "errors", label: t("importColErrors") },
                      { key: "warnings", label: t("importColWarnings") },
                      { key: "action", label: t("importColAction") },
                    ].map((col) => <th key={col.key} className="px-4 py-3">{col.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {workbook.rows.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">{t("importIssuesEmpty")}</td></tr>
                  ) : (
                    workbook.rows.map((row) => (
                      <tr key={row.rowId} className="border-t border-border hover:bg-surface-2/30 transition-colors align-top">
                        <td className="px-4 py-3">{row.rowIndex}</td>
                        <td className="px-4 py-3">{row.fullName ?? "-"}</td>
                        <td className="px-4 py-3">{row.admissionNo ?? "-"}</td>
                        <td className="px-4 py-3">{row.classLabel ?? "-"}</td>
                        <td className="px-4 py-3">{row.status}</td>
                        <td className="px-4 py-3">{row.errors.length > 0 ? row.errors.join(" | ") : "-"}</td>
                        <td className="px-4 py-3">{row.warnings.length > 0 ? row.warnings.join(" | ") : "-"}</td>
                        <td className="px-4 py-3">
                          <Button asChild size="sm" variant="outline">
                            <Link href={appendSessionParam(`/protected/imports?batchId=${row.batchId}`, effectiveSession)}>{t("importOpenBatch")}</Link>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}
        {workbook.view === "exports" && (
          <SectionCard title={t("exportsSectionTitle")} description={t("exportsSectionDescription")}>
            <p className="text-sm text-muted-foreground">
              {t("exportsSectionBodyPrefix")}
              <strong className="text-foreground">{t("exportsSectionBodyEmphasis")}</strong>
              {t("exportsSectionBodySuffix")}
            </p>
          </SectionCard>
        )}
        {"rows" in workbook && workbook.rows.length > 0 ? (
          <SummaryRow sticky={false}>
            <SummaryCell label={t("summaryRecords")} value={String(workbook.rows.length)} />
            {(() => {
              const rows = workbook.rows as unknown as Array<Record<string, unknown>>;
              if (workbook.view === "transactions" || workbook.view === "receipts" || workbook.view === "collection_today") {
                const sum = rows.reduce((acc, row) => acc + Number(row.totalAmount ?? 0), 0);
                return <SummaryCell label={t("summaryAmountSigma")} value={formatInr(sum)} />;
              }
              if (
                workbook.view === "student_dues" ||
                workbook.view === "installments" ||
                workbook.view === "defaulters" ||
                workbook.view === "class_register"
              ) {
                const pending = rows.reduce((acc, row) => acc + Number(row.outstandingAmount ?? 0), 0);
                const paid = rows.reduce((acc, row) => acc + Number(row.totalPaid ?? 0), 0);
                return (
                  <>
                    <SummaryCell label={t("summaryPendingSigma")} value={formatInr(pending)} />
                    <SummaryCell label={t("summaryPaidSigma")} value={formatInr(paid)} />
                  </>
                );
              }
              return null;
            })()}
          </SummaryRow>
        ) : null}
        {"pagination" in workbook && (
          <PaginationControls pagination={workbook.pagination} onPageChange={handlePageChange} t={t} />
        )}
      </div>

      <ReceiptPreviewSheet
        open={previewReceiptId !== null}
        onClose={() => setPreviewReceiptId(null)}
        receiptId={previewReceiptId}
        sessionLabel={effectiveSession}
      />

      {(workbook.view === "transactions" || workbook.view === "receipts") &&
      selectedReceiptIds.size > 0 ? (
        <ReceiptBulkPrintBar
          selectedIds={selectedReceiptIds}
          sessionLabel={effectiveSession}
          onClear={() => setSelectedReceiptIds(new Set())}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk-print floating bar for the Transactions / Receipts views.
//
// Desktop-only by virtue of being mounted alongside the desktop table — the
// mobile cards never expose checkboxes, so this bar can never appear there.
// "Print" opens each receipt's print URL in a new tab; modern browsers cap
// rapid window.open() calls, so we warn above a sensible threshold and ask
// the user to print in smaller batches.
// ---------------------------------------------------------------------------

const RECEIPT_BULK_PRINT_CAP = 10;

function ReceiptBulkPrintBar({
  selectedIds,
  sessionLabel,
  onClear,
}: {
  selectedIds: ReadonlySet<string>;
  sessionLabel: string;
  onClear: () => void;
}) {
  const count = selectedIds.size;
  const overCap = count > RECEIPT_BULK_PRINT_CAP;

  const handlePrint = () => {
    if (overCap) {
      const proceed = window.confirm(
        `${count} receipts selected. Browsers may block opening more than ${RECEIPT_BULK_PRINT_CAP} tabs at once. Open all ${count} anyway? Cancel to split into batches.`,
      );
      if (!proceed) return;
    }
    for (const id of selectedIds) {
      const href = `/protected/receipts/${id}?session=${encodeURIComponent(sessionLabel)}`;
      window.open(href, "_blank", "noopener");
    }
    onClear();
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 hidden border-t border-border bg-card/95 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-sm md:block">
      <div className="mx-auto flex max-w-screen-xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClear}
            className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground hover:bg-surface-2"
            aria-label="Clear receipt selection"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
          <p className="text-sm font-medium text-foreground">
            {count} receipt{count === 1 ? "" : "s"} selected
          </p>
          {overCap ? (
            <span className="text-xs text-warning-soft-foreground">
              Over {RECEIPT_BULK_PRINT_CAP} — print in batches.
            </span>
          ) : null}
        </div>
        <Button type="button" variant="accent" onClick={handlePrint} className="gap-2">
          <Printer className="size-4" aria-hidden="true" />
          Print {count} receipt{count === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}

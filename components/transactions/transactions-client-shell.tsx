"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CreditCard, Download, Lock, Printer, Search, SlidersHorizontal, Undo2, User, X } from "lucide-react";

import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { SavedViewsTabs } from "@/components/data-table/saved-views-tabs";
import { ActiveFilterSummary } from "@/components/shared/active-filter-summary";
import { FilterDrawerButton } from "@/components/shared/filter-drawer-button";
import { SegmentFilterGroups } from "@/components/shared/segment-filter-groups";
import { MobileDaySummary } from "@/components/transactions/mobile-day-summary";
import { ReversedBadge } from "@/components/receipts/reversed-badge";
import { SummaryRow, SummaryCell } from "@/components/data-table/summary-row";
import { Button } from "@/components/ui/button";
import type { SavedView } from "@/lib/data-table/saved-views";
import { MoneyWithDefinition } from "@/components/ui/money-with-definition";
import type { MoneyTermKey } from "@/lib/money/glossary";
import { formatInr } from "@/lib/helpers/currency";
import { DownloadAnchor } from "@/components/ui/download-anchor";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Sheet } from "@/components/ui/sheet";
import {
  SEGMENT_BY_ID,
  parseSegments,
  serializeSegments,
  type SegmentId,
} from "@/lib/segments/student-segments";
import {
  addDays,
  daysInMonth,
  formatShortDate,
  formatTodayBadge,
  partsToIso,
  todayPartsIst,
} from "@/lib/helpers/date";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { cn } from "@/lib/utils";
import {
  buildOfficeWorkbookExportHref,
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
  /** Was absent, so saving a view silently dropped the search term. */
  query?: string;
  segments?: SegmentId[];
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
  segments: SegmentId[];
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
  whatsappTemplates: readonly WhatsappTemplate[];
  /**
   * Admin only. Adds a per-row "reverse" action that opens the receipt, where
   * the confirm dialog lives. The dialog stays on the receipt page on purpose:
   * it warns about counter concessions and prior partial reversals, and this
   * list carries neither figure.
   */
  canReverseReceipts?: boolean;
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
  if (mode === "bank_transfer") return "bg-accent-soft text-accent-soft-foreground";
  if (mode === "cheque") return "bg-warning-soft text-warning-soft-foreground";
  if (mode === "discount") return "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200";
  return "bg-surface-2 text-muted-foreground";
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
  if (f.segments.length > 0) p.set("seg", serializeSegments(f.segments));
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
  if (f.segments.length > 0) p.set("seg", serializeSegments(f.segments));
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
      segments: parseSegments(p.get("seg")),
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
    // Its own tile, not folded into Outstanding. A late fee is a separate
    // charge and the two move for completely different reasons.
    { key: "lateFeePending", label: t("summaryLateFeePending"), value: summary.totalLateFeePending, termKey: "lateFeePending" },
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
  canReverseReceipts = false,
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
  canReverseReceipts?: boolean;
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
      {/* Phone receipt rows (mobile app v2 §TRANSACTIONS): a mode tile, the
          student, the amount and one affordance. The print and payment
          buttons moved to the receipt itself — two buttons per row turned a
          scannable day list into a wall of controls, and the row already
          opens the receipt where both live. */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-center text-[12.5px] text-muted-foreground">
            {t("tableEmpty")}
          </p>
        ) : (
          rows.map((row) => (
            <button
              key={row.receiptId}
              type="button"
              onClick={() => onPreviewReceipt(row.receiptId)}
              className="focus-ring flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors active:bg-surface-2"
              /* Transactions pages up to 150 rows; skip render work for
                 off-screen cards (same technique as the students table). */
              style={{ contentVisibility: "auto", containIntrinsicSize: "0 66px" } as React.CSSProperties}
            >
              <span
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-xl text-[10px] font-extrabold uppercase",
                  row.paymentMode === "cash"
                    ? "tone-accent"
                    : row.paymentMode === "upi"
                      ? "tone-info"
                      : "tone-neutral",
                )}
                aria-hidden="true"
              >
                {formatPaymentModeLabel(row.paymentMode, t).slice(0, 4)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-extrabold leading-tight text-foreground">
                    {row.studentName}
                  </span>
                  {row.isReversed ? <ReversedBadge /> : null}
                </span>
                <span className="mt-0.5 block truncate text-[11px] font-medium text-muted-foreground">
                  {row.receiptNumber} · {formatShortDate(row.paymentDate)} · {row.classLabel}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span
                  className={cn(
                    "tabular block text-[14.5px] font-extrabold text-foreground",
                    row.isReversed && "line-through opacity-60",
                  )}
                >
                  {formatInr(row.totalAmount)}
                </span>
                <span className="text-[10.5px] font-bold text-accent">{t("rowActionOpen")} ›</span>
              </span>
            </button>
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
                      {canReverseReceipts && !row.isReversed ? (
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          className="size-8 p-0 text-destructive hover:text-destructive"
                          aria-label={`Reverse receipt ${row.receiptNumber}`}
                        >
                          <Link href={receiptPrintHref(row.receiptId, sessionLabel)}>
                            <Undo2 className="size-4" />
                          </Link>
                        </Button>
                      ) : null}
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

// The date picker and the receipt preview are overlays: both were static
// imports mounted with `open={false}` on every single page load, so their
// code sat in the initial bundle for a surface most visits never open. They
// now load on first open and stay mounted after that, so the close animation
// still runs. Same treatment the workbook tables already had.
const MobileDatePicker = dynamic(
  () => import("@/components/mobile-app/mobile-date-picker").then((mod) => mod.MobileDatePicker),
  { ssr: false },
);
const ReceiptPreviewSheet = dynamic(
  () => import("@/components/receipts/receipt-preview-sheet").then((mod) => mod.ReceiptPreviewSheet),
  { ssr: false },
);

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

      {/* Proportional mode split — the shape of the day at a glance, so a
          cash-heavy morning is obvious without reading four figures. */}
      {snapshot.total > 0 ? (
        <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-surface-3">
          {modes
            .filter((mode) => mode.value > 0)
            .map((mode) => (
              <span
                key={`bar-${mode.key}`}
                className={cn(
                  "h-full",
                  mode.key === "cash" && "bg-success",
                  mode.key === "upi" && "bg-info",
                  mode.key === "bank" && "bg-accent",
                  mode.key === "cheque" && "bg-warning",
                )}
                style={{ width: `${(mode.value / snapshot.total) * 100}%` }}
                title={`${mode.label} ${formatInr(mode.value)}`}
              />
            ))}
        </div>
      ) : null}
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
  whatsappTemplates,
  canReverseReceipts = false,
}: TransactionsClientShellProps) {
  const t = useTranslations("Transactions");
  const tCommon = useTranslations("Common");
  const tSegments = useTranslations("Segments");
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
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // Latches on first open so the lazy chunk is fetched once and the overlay
  // keeps its exit animation instead of vanishing on unmount.
  const [datePickerUsed, setDatePickerUsed] = useState(false);
  /** Phone-only: the desk filter bar's contents, behind a sheet. */
  const [phoneFiltersOpen, setPhoneFiltersOpen] = useState(false);
  // Matches the `md:` breakpoint the desk card is gated on, so the one filter
  // drawer enters from the right on a desk and from the bottom on a phone.
  const isDeskWidth = useMediaQuery("(min-width: 768px)");

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
      // 200 ms, not 60. At 60 ms an ordinary typing cadence (~120 ms/keystroke)
      // fires a request per character, and every one of them runs the full
      // workbook query. `fetchData` already aborts the in-flight request, so
      // only the last response is ever rendered either way — the extra requests
      // were pure server load, not a faster answer. The user-visible cost is
      // ~140 ms on the final result.
      //
      // Kept well under the Students value: this screen has no local
      // instant-filter to cover the gap, so the list genuinely waits here.
      debounceRef.current = setTimeout(() => fetchData(view, newFilters), 200);
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

  function handleSegmentToggle(id: SegmentId) {
    const nextSegments = filters.segments.includes(id)
      ? filters.segments.filter((value) => value !== id)
      : [...filters.segments, id];
    const nextFilters = { ...filters, segments: nextSegments, page: 1 };
    setFilters(nextFilters);
    setActiveSavedViewId(null);
    scheduleOrFetch(activeView, nextFilters, false);
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
    const empty: FilterState = { classId: "", query: "", fromDate: "", toDate: "", paymentMode: "", page: 1, routeId: "", sessionLabel: "", segments: [] };
    setFilters(empty);
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
      // `?? filters.query` / `?? []` — states saved before these fields
      // existed must still apply rather than blanking the search box.
      query: view.state.query ?? filters.query,
      segments: view.state.segments ?? [],
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
    query: filters.query,
    segments: filters.segments,
  };

  // Badge counts only secondary-panel filters — primary-row filters (search, class, mode chips) are always visible
  const extraActiveCount =
    [filters.fromDate, filters.toDate, filters.routeId, filters.sessionLabel].filter(Boolean)
      .length + filters.segments.length;
  const effectiveSession = filters.sessionLabel || resolvedSessionLabel;
  const activeViewPrefix = officeWorkbookViewI18nPrefix[activeView];
  const activeMeta = {
    title: tCommon(`workbookViews.${activeViewPrefix}Title` as Parameters<typeof tCommon>[0]),
    shortTitle: tCommon(`workbookViews.${activeViewPrefix}Short` as Parameters<typeof tCommon>[0]),
    description: tCommon(`workbookViews.${activeViewPrefix}Description` as Parameters<typeof tCommon>[0]),
  };

  // Return-to URL for action links
  const returnTo = buildPageUrl(activeView, filters);

  // Exports exactly what is on screen, filters and segments included.
  const exportHref = buildOfficeWorkbookExportHref({
    view: activeView,
    classId: filters.classId || undefined,
    fromDate: filters.fromDate || undefined,
    paymentMode: filters.paymentMode || undefined,
    query: filters.query || undefined,
    routeId: filters.routeId || undefined,
    segments: filters.segments,
    sessionLabel: effectiveSession || undefined,
    toDate: filters.toDate || undefined,
  });

  // ── Day chips, shared by the phone header and the desk filter bar ────────
  // Every date here is IST calendar arithmetic; see the note on the desktop
  // row below for why `toISOString().slice(0,10)` is wrong after midnight.
  const todayIso = partsToIso(todayPartsIst());
  const yesterdayIso = partsToIso(addDays(todayPartsIst(), -1));
  const weekStartIso = partsToIso(
    addDays(
      todayPartsIst(),
      -new Date(
        Date.UTC(todayPartsIst().year, todayPartsIst().month - 1, todayPartsIst().day),
      ).getUTCDay(),
    ),
  );
  const monthStartIso = partsToIso({ ...todayPartsIst(), day: 1 });

  function applyDayRange(key: "Today" | "Yesterday" | "This week" | "This month") {
    const today = todayPartsIst();
    let fromIso = todayIso;
    const toIso = todayIso;
    if (key === "Yesterday") {
      return applyRange(yesterdayIso, yesterdayIso);
    }
    if (key === "This week") {
      const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
      fromIso = partsToIso(addDays(today, -weekday));
    } else if (key === "This month") {
      fromIso = partsToIso({ ...today, day: 1 });
    }
    return applyRange(fromIso, toIso);
  }

  function applyRange(fromIso: string, toIso: string) {
    const nextFilters = { ...filters, fromDate: fromIso, toDate: toIso, page: 1 };
    setFilters(nextFilters);
    scheduleOrFetch(activeView, nextFilters, false);
  }

  const dayChips = [
    { key: "Today" as const, label: t("chipToday"), active: filters.fromDate === todayIso && filters.toDate === todayIso },
    { key: "Yesterday" as const, label: t("chipYesterday"), active: filters.fromDate === yesterdayIso && filters.toDate === yesterdayIso },
    // These two were hardcoded `active: false`, so the chip you had just
    // pressed stayed grey and the range looked like it had not applied.
    { key: "This week" as const, label: t("chipThisWeek"), active: filters.fromDate === weekStartIso && filters.toDate === todayIso },
    { key: "This month" as const, label: t("chipThisMonth"), active: filters.fromDate === monthStartIso && filters.toDate === todayIso },
  ];
  const singleDaySelected = Boolean(
    filters.fromDate && filters.toDate && filters.fromDate === filters.toDate,
  );

  const phoneFilterCount =
    [filters.query, filters.classId, filters.routeId, filters.sessionLabel].filter(Boolean)
      .length + filters.segments.length;

  /**
   * Which option the Date select shows. A range that matches no preset is still
   * a real filter, so it reports as "custom" rather than falling back to "All
   * dates" and telling the user their range was dropped.
   */
  const activeDayChipKey =
    dayChips.find((chip) => chip.active)?.key ??
    (filters.fromDate || filters.toDate ? "custom" : "");

  /**
   * The drawer badge counts what the drawer exclusively owns at desk width.
   * Search, class, mode and date sit in the toolbar and already show as pills,
   * so counting them here would report the same filter twice. The phone button
   * keeps phoneFilterCount — its header carries only the day chips and the view
   * chips, so search and class genuinely are behind the drawer there.
   */
  const drawerFilterCount =
    filters.segments.length + [filters.routeId, filters.sessionLabel].filter(Boolean).length;

  /** One removable pill per applied filter, mirroring the Students toolbar. */
  const txnFilterPills = [
    ...(filters.query
      ? [{
          key: "query",
          label: filters.query,
          onRemove: () => handleFilterChange("query", ""),
        }]
      : []),
    ...(filters.classId
      ? [{
          key: "class",
          label: classOptions.find((o) => o.id === filters.classId)?.label ?? filters.classId,
          onRemove: () => handleFilterChange("classId", ""),
        }]
      : []),
    ...(filters.paymentMode
      ? [{
          key: "mode",
          label:
            paymentModeOptions.find((o) => o.value === filters.paymentMode)?.label ??
            filters.paymentMode,
          onRemove: () => handleFilterChange("paymentMode", ""),
        }]
      : []),
    ...(filters.routeId
      ? [{
          key: "route",
          label: routeOptions.find((o) => o.id === filters.routeId)?.label ?? filters.routeId,
          onRemove: () => handleFilterChange("routeId", ""),
        }]
      : []),
    ...(filters.sessionLabel
      ? [{
          key: "session",
          label: filters.sessionLabel,
          onRemove: () => handleFilterChange("sessionLabel", ""),
        }]
      : []),
    ...(filters.fromDate || filters.toDate
      ? [{
          key: "dates",
          label:
            dayChips.find((chip) => chip.active)?.label ??
            [filters.fromDate, filters.toDate].filter(Boolean).join(" → "),
          onRemove: () => {
            const cleared = { ...filters, fromDate: "", toDate: "", page: 1 };
            setFilters(cleared);
            scheduleOrFetch(activeView, cleared, false);
          },
        }]
      : []),
    ...filters.segments.map((id) => ({
      key: `seg:${id}`,
      label: tSegments(SEGMENT_BY_ID[id].i18nKey),
      onRemove: () => handleSegmentToggle(id),
    })),
  ];

  const phoneChipClass = (active: boolean) =>
    cn(
      "focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[12.5px] font-bold transition-colors",
      active
        ? "border-accent bg-accent text-accent-foreground"
        : "border-border bg-card text-muted-foreground",
    );

  return (
    <div className="flex flex-col gap-6">
      {/* ── Phone header (mobile app v2 §TRANSACTIONS) ──────────────────
          The desk filter bar below — a search box, a native class select and a
          More-filters panel — is a reconciliation tool. On a phone the job is
          "show me a day", so the header is two chip rows: which day, which
          view. Same state, same handlers; only the shape differs. */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 border-b border-border bg-background/95 px-4 pb-2.5 pt-4 backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-2.5">
          <h1 className="text-xl font-extrabold leading-tight tracking-tight text-foreground">
            {t("title")}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
              <Lock className="size-3" aria-hidden="true" />
              {t("readOnlyShort")}
            </span>
            {/* The desk bar carries search, class, route and session. Hiding it
                on the phone would have taken those with it, so they move into
                a sheet behind this button — same shape as Students. */}
            <button
              type="button"
              onClick={() => setPhoneFiltersOpen(true)}
              aria-label={t("filterFiltersToggle")}
              className="focus-ring relative grid size-9 place-items-center rounded-xl border border-border-strong bg-card text-foreground active:bg-surface-2"
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              {phoneFilterCount > 0 ? (
                <span className="absolute -right-1 -top-1 grid size-[17px] place-items-center rounded-full bg-accent text-[9.5px] font-extrabold text-accent-foreground">
                  {phoneFilterCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className="no-scrollbar -mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4">
          {dayChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-pressed={chip.active}
              onClick={() => applyDayRange(chip.key)}
              className={phoneChipClass(chip.active)}
            >
              {chip.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setDatePickerUsed(true);
              setDatePickerOpen(true);
            }}
            className={phoneChipClass(singleDaySelected && !dayChips.some((c) => c.active))}
          >
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {singleDaySelected ? formatShortDate(filters.fromDate) : t("chipPickDate")}
          </button>
          {filters.fromDate || filters.toDate ? (
            <button
              type="button"
              onClick={() => applyRange("", "")}
              className="focus-ring inline-flex h-9 shrink-0 items-center rounded-full border border-dashed border-border px-3 text-[12.5px] font-bold text-muted-foreground"
            >
              {t("filterClearDates")}
            </button>
          ) : null}
        </div>

        <div className="no-scrollbar -mx-4 mt-1.5 flex gap-1.5 overflow-x-auto px-4">
          {VISIBLE_VIEW_TABS.map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={activeView === view}
              onClick={() => handleViewChange(view)}
              className={cn(
                "focus-ring inline-flex h-[30px] shrink-0 items-center rounded-lg border px-3 text-[11.5px] font-bold transition-colors",
                activeView === view
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              {tCommon(
                `workbookViews.${officeWorkbookViewI18nPrefix[view]}Short` as Parameters<typeof tCommon>[0],
              )}
            </button>
          ))}
          {paymentModeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filters.paymentMode === option.value}
              onClick={() => handlePaymentModeToggle(option.value)}
              className={cn(
                "focus-ring inline-flex h-[30px] shrink-0 items-center rounded-lg border px-3 text-[11.5px] font-bold transition-colors",
                filters.paymentMode === option.value
                  ? "border-nav bg-nav text-nav-foreground"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Same snapshot, two shapes: an ink hero on a phone, the horizontal
          desk strip from tablet up. */}
      <MobileDaySummary
        snapshot={todaySnapshot}
        labels={{
          prefix: t("todayStripPrefix", { date: formatTodayBadge(new Date()) }),
          receipts: t("todayStripReceipts", { count: todaySnapshot.receiptCount }),
          cash: t("todayStripModeCash"),
          upi: t("todayStripModeUpi"),
          bank: t("todayStripModeBank"),
          cheque: t("todayStripModeCheque"),
        }}
      />
      <div className="hidden md:block">
        <TodayStrip snapshot={todaySnapshot} t={t} />
      </div>

      {/* ── View + Filters (desk) ──
          Phones get the chip header above instead: a text input and a native
          select inside a card is a reconciliation shape, not a "show me today"
          shape. Both drive the same filter state. */}
      <SectionCard
        className="hidden md:block"
        title={t("viewFilterTitle")}
        description={t("viewFilterDescription")}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge label={t("readOnlyBadge")} tone="accent" />
            {/* buildOfficeWorkbookExportHref has existed, and been tested, since
                the workbook shipped -- nothing in the app ever linked to it, so
                the only way to export what you were looking at was to rebuild
                the same filters by hand under Exports. */}
            <Button asChild size="sm" variant="outline">
              <DownloadAnchor href={exportHref} download>
                <Download className="size-4" aria-hidden="true" />
                {t("exportCurrentViewAction")}
              </DownloadAnchor>
            </Button>
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

          {/* ── One toolbar row ──
              This block used to be five stacked rows: a labelled search+class
              row, a payment-mode chip row, a day-chip row, all 24 segment chips
              in a bordered box, and a four-column "more filters" grid — roughly
              270px of the 900px viewport before the first receipt. Payment mode
              became a select (it was always single-select), the day chips and
              the From/To inputs became one Date control, and the segments,
              route and academic year moved into the drawer the phone already
              opens. What is applied is restated as pills below. */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="txn-query"
                  type="search"
                  aria-label={t("filterSearchLabel")}
                  value={filters.query}
                  onChange={(e) => handleFilterChange("query", e.target.value, true)}
                  placeholder={t("filterSearchPlaceholder")}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent py-1 pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              {/* Class */}
              <select
                id="txn-class"
                aria-label={t("filterClassLabel")}
                value={filters.classId}
                onChange={(e) => handleFilterChange("classId", e.target.value)}
                className="flex h-9 w-auto min-w-[9rem] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">{t("filterClassAll")}</option>
                {classOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>

              {/* Payment mode — a select, not chips. handlePaymentModeToggle
                  already behaved as single-select, so nothing is lost. */}
              <select
                id="txn-mode"
                aria-label={t("filterPaymentModeLabel")}
                value={filters.paymentMode}
                onChange={(e) => handleFilterChange("paymentMode", e.target.value)}
                className="flex h-9 w-auto min-w-[8.5rem] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">{t("filterModeAll")}</option>
                {paymentModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>

              {/* Date range. The presets keep applyDayRange and its IST
                  arithmetic untouched — only the trigger changed shape. Picking
                  "Custom range" opens the drawer, where the From/To inputs live. */}
              <select
                id="txn-date"
                aria-label={t("filterDateLabel")}
                value={activeDayChipKey}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "") {
                    const cleared = { ...filters, fromDate: "", toDate: "", page: 1 };
                    setFilters(cleared);
                    scheduleOrFetch(activeView, cleared, false);
                    return;
                  }
                  if (value === "custom") {
                    setPhoneFiltersOpen(true);
                    return;
                  }
                  applyDayRange(value as "Today" | "Yesterday" | "This week" | "This month");
                }}
                className="flex h-9 w-auto min-w-[8.5rem] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">{t("filterDateAll")}</option>
                {dayChips.map((chip) => (
                  <option key={chip.key} value={chip.key}>{chip.label}</option>
                ))}
                <option value="custom">{t("filterDateCustom")}</option>
              </select>

              {/* Segments, route and academic year live in the drawer the phone
                  filter button already opens — one drawer, one filter set. */}
              <FilterDrawerButton
                onClick={() => setPhoneFiltersOpen(true)}
                expanded={phoneFiltersOpen}
                activeCount={drawerFilterCount}
                label={t("filterFiltersToggle")}
              />

              {(filters.query || filters.classId || filters.paymentMode || extraActiveCount > 0) && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex h-9 shrink-0 items-center gap-1 rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-surface-2"
                  title={t("filterClearTitle")}
                >
                  <X className="h-3.5 w-3.5" /> {t("filterClear")}
                </button>
              )}
            </div>

            {/* One removable pill per applied filter. Transactions had no such
                row, which is why the controls had to stay expanded to be
                legible; this does that job in ~28px instead of ~270px. */}
            {txnFilterPills.length > 0 && (
              <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                <ActiveFilterSummary
                  pills={txnFilterPills}
                  onClearAll={handleReset}
                  clearAllLabel={t("filterClear")}
                  removeAriaLabel={(label) => t("filterRemoveAria", { label })}
                />
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
            /* The receipt list is the phone screen's whole body, so it drops
               the card chrome there and reads as the design's flat stack. */
            className="max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0"
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
              canReverseReceipts={canReverseReceipts}
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
            <StudentDuesTable rows={workbook.rows} sessionLabel={effectiveSession} />
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
                // Reversed receipts stay VISIBLE as rows — the register is
                // append-only and a voided receipt is part of the record — but
                // they must not be added up. This footer already counted them
                // separately while including their amount in the Σ beside it,
                // so the total disagreed with the dashboard for the same day.
                const reversedCount = rows.filter((row) => Boolean(row.isReversed)).length;
                const sum = rows.reduce(
                  (acc, row) => acc + (row.isReversed ? 0 : Number(row.totalAmount ?? 0)),
                  0,
                );
                return (
                  <>
                    <SummaryCell label={t("summaryAmountSigma")} value={formatInr(sum)} />
                    {reversedCount > 0 ? (
                      <SummaryCell
                        label={t("summaryReversedCount")}
                        value={
                          <span className="text-destructive">{reversedCount}</span>
                        }
                      />
                    ) : null}
                  </>
                );
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

      {/* Phone filters. Mounted outside both branches for the same reason as
          the date picker below: anything a phone control opens has to live
          outside the `hidden md:block` desk card. */}
      <Sheet
        open={phoneFiltersOpen}
        onClose={() => setPhoneFiltersOpen(false)}
        title={t("filterFiltersToggle")}
        // A bottom sheet is the right shape on a phone and the wrong one on a
        // desk, where it would cover the receipts it is filtering. Same sheet,
        // same state, same content — only the edge it enters from changes.
        side={isDeskWidth ? "right" : "bottom"}
        size="md"
      >
        <div className="flex flex-col gap-4 pt-2">
          {/* Same four families as the desk card and the Students sheet -- one
              component, so the two modules cannot drift apart again. */}
          <SegmentFilterGroups
            selected={filters.segments}
            counts={null}
            onToggle={handleSegmentToggle}
            layout="wrap"
          />

          <div>
            <label
              className="mobile-eyebrow text-muted-foreground"
              htmlFor="txn-query-phone"
            >
              {t("filterSearchLabel")}
            </label>
            <input
              id="txn-query-phone"
              type="search"
              value={filters.query}
              onChange={(event) => handleFilterChange("query", event.target.value, true)}
              placeholder={t("filterSearchPlaceholder")}
              className="mt-1.5 h-12 w-full rounded-xl border border-input bg-surface px-3 text-[15px] font-semibold text-foreground outline-none placeholder:text-subtle-foreground"
            />
          </div>

          <div>
            <p className="mobile-eyebrow text-muted-foreground">{t("filterClassLabel")}</p>
            <div className="no-scrollbar mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                aria-pressed={filters.classId === ""}
                onClick={() => handleFilterChange("classId", "")}
                className={phoneChipClass(filters.classId === "")}
              >
                {t("filterClassAll")}
              </button>
              {classOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={filters.classId === option.id}
                  onClick={() =>
                    handleFilterChange("classId", filters.classId === option.id ? "" : option.id)
                  }
                  className={phoneChipClass(filters.classId === option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {routeOptions.length > 0 ? (
            <div>
              <p className="mobile-eyebrow text-muted-foreground">{t("filterRouteLabel")}</p>
              <div className="no-scrollbar mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  aria-pressed={filters.routeId === ""}
                  onClick={() => handleFilterChange("routeId", "")}
                  className={phoneChipClass(filters.routeId === "")}
                >
                  {t("filterRouteAll")}
                </button>
                {routeOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={filters.routeId === option.id}
                    onClick={() =>
                      handleFilterChange("routeId", filters.routeId === option.id ? "" : option.id)
                    }
                    className={phoneChipClass(filters.routeId === option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <label
              className="mobile-eyebrow text-muted-foreground"
              htmlFor="txn-session-phone"
            >
              {t("filterAcademicYearLabel")}
            </label>
            <select
              id="txn-session-phone"
              value={filters.sessionLabel}
              onChange={(event) => handleFilterChange("sessionLabel", event.target.value)}
              className="mt-1.5 h-12 w-full rounded-xl border border-input bg-surface px-3 text-[15px] font-semibold text-foreground"
            >
              <option value="">{t("filterAcademicYearCurrent")}</option>
              {sessionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Exact range. The toolbar's Date select covers the four presets and
              sends "Custom range" here, so this is where an arbitrary window is
              actually chosen — it has to exist in the drawer or that option
              would open a sheet with nowhere to set the dates. */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mobile-eyebrow text-muted-foreground" htmlFor="txn-from">
                {t("filterFromLabel")}
              </label>
              <input
                id="txn-from"
                type="date"
                value={filters.fromDate}
                onChange={(event) => {
                  const next = { ...filters, fromDate: event.target.value, page: 1 };
                  setFilters(next);
                  if (!event.target.value || next.toDate) scheduleOrFetch(activeView, next, false);
                }}
                className="mt-1.5 h-12 w-full rounded-xl border border-input bg-surface px-3 text-[15px] font-semibold text-foreground"
              />
            </div>
            <div>
              <label className="mobile-eyebrow text-muted-foreground" htmlFor="txn-to">
                {t("filterToLabel")}
              </label>
              <input
                id="txn-to"
                type="date"
                value={filters.toDate}
                onChange={(event) => {
                  const next = { ...filters, toDate: event.target.value, page: 1 };
                  setFilters(next);
                  if (!event.target.value || next.fromDate) scheduleOrFetch(activeView, next, false);
                }}
                className="mt-1.5 h-12 w-full rounded-xl border border-input bg-surface px-3 text-[15px] font-semibold text-foreground"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              className="h-12 flex-1 rounded-xl"
              onClick={() => setPhoneFiltersOpen(false)}
            >
              {t("filterApply")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-xl px-4"
              onClick={() => {
                handleReset();
                setPhoneFiltersOpen(false);
              }}
            >
              {t("filterClear")}
            </Button>
          </div>
        </div>
      </Sheet>

      {/* Mounted outside the desk filter card. It used to live inside it,
          and gating that card behind `hidden md:block` put the picker in a
          display:none subtree — the phone's calendar chip set state and
          nothing appeared. */}
      {datePickerUsed ? (
      <MobileDatePicker
        open={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        value={
          filters.fromDate && filters.fromDate === filters.toDate
            ? filters.fromDate
            : null
        }
        onSelectDate={(iso) => {
          const newFilters = { ...filters, fromDate: iso, toDate: iso, page: 1 };
          setFilters(newFilters);
          scheduleOrFetch(activeView, newFilters, false);
        }}
        onSelectMonth={(year, month) => {
          const from = partsToIso({ year, month, day: 1 });
          const to = partsToIso({ year, month, day: daysInMonth(year, month) });
          const newFilters = { ...filters, fromDate: from, toDate: to, page: 1 };
          setFilters(newFilters);
          scheduleOrFetch(activeView, newFilters, false);
        }}
        labels={{
          today: t("chipToday"),
          wholeMonth: t("chipThisMonth"),
          dotLegend: t("datePickerDotLegend"),
          previousMonth: t("datePickerPrevMonth"),
          nextMonth: t("datePickerNextMonth"),
        }}
      />
      ) : null}

      {previewReceiptId !== null ? (
        <ReceiptPreviewSheet
          open
          onClose={() => setPreviewReceiptId(null)}
          receiptId={previewReceiptId}
          sessionLabel={effectiveSession}
        />
      ) : null}

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

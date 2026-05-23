"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, Printer, SlidersHorizontal, X } from "lucide-react";

import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { cn } from "@/lib/utils";
import {
  officeWorkbookMeta,
  officeWorkbookViews,
  resolveOfficeWorkbookView,
  type OfficeWorkbookView,
} from "@/lib/transactions/workbook";
import type {
  OfficeWorkbookData,
  OfficeWorkbookPagination,
  OfficeWorkbookStudentRow,
  OfficeWorkbookSummary,
} from "@/lib/transactions/dues";
import type { WorkbookClassOption, WorkbookTransaction } from "@/lib/workbook/data";
import type { CollectionRow } from "./transactions-lazy-tables";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export type TransactionsClientShellProps = {
  activeView: OfficeWorkbookView;
  initialFilters: FilterState;
  initialWorkbook: OfficeWorkbookData;
  classOptions: WorkbookClassOption[];
  sessionOptions: SessionOption[];
  routeOptions: RouteOption[];
  paymentModeOptions: PaymentModeOption[];
  resolvedSessionLabel: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPaymentModeLabel(value: string) {
  if (value === "upi") return "UPI";
  if (value === "bank_transfer") return "Bank transfer";
  if (value === "cheque") return "Cheque";
  return "Cash";
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

function SummaryCards({ summary }: { summary: OfficeWorkbookSummary }) {
  const [showMore, setShowMore] = useState(false);
  const top = [
    { label: "Students", value: summary.studentCount },
    { label: "Total due", value: formatInr(summary.totalDue) },
    { label: "Outstanding", value: formatInr(summary.totalOutstanding) },
    { label: "Total paid", value: formatInr(summary.totalPaid) },
  ];
  const more = [
    { label: "Discounts", value: formatInr(summary.totalDiscount) },
    { label: "Late fee waived", value: formatInr(summary.totalLateFeeWaived) },
    { label: "Transport students", value: summary.transportStudentCount },
    { label: "Tuition total", value: formatInr(summary.tuitionFeeTotal) },
    { label: "Transport total", value: formatInr(summary.transportFeeTotal) },
    { label: "Academic fee", value: formatInr(summary.academicFeeTotal) },
    { label: "Other adj.", value: formatInr(summary.otherAdjustmentTotal) },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {top.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-surface-2 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{c.label}</p>
            <p className="mt-1.5 text-base font-semibold text-foreground">{c.value}</p>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface-2">
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-surface-3 transition-colors"
        >
          <span>More totals</span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", showMore && "rotate-180")} />
        </button>
        {showMore && (
          <div className="grid gap-3 border-t border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
            {more.map((c) => (
              <div key={c.label} className="rounded-xl border border-border bg-surface-2 px-4 py-3">
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

function TransactionsTable({
  rows,
  returnTo,
  sessionLabel,
}: {
  rows: WorkbookTransaction[];
  returnTo: string;
  sessionLabel: string;
}) {
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);
  const receiptPrintHref = (receiptId: string, label: string) =>
    `/protected/receipts/${receiptId}?session=${encodeURIComponent(label)}`;
  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-2 px-4 py-5 text-center text-sm text-muted-foreground">
            No transactions found for this view.
          </p>
        ) : (
          rows.map((row) => (
            <div key={row.receiptId} className="rounded-xl border border-border bg-card p-3 text-sm">
              <p className="font-semibold text-foreground">{row.receiptNumber}</p>
              <p className="text-xs text-muted-foreground">{formatShortDate(row.paymentDate)} · {row.studentName}</p>
              <p className="mt-1 text-xs text-muted-foreground">{row.classLabel} · {formatPaymentModeLabel(row.paymentMode)}</p>
              <p className="mt-1 font-semibold text-foreground">{formatInr(row.totalAmount)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={withSession(`/protected/receipts/${row.receiptId}?returnTo=${encodeURIComponent(returnTo)}`)}>View</Link>
                </Button>
                <Button asChild size="sm" variant="ghost" aria-label={`Print receipt ${row.receiptNumber}`}>
                  <Link href={receiptPrintHref(row.receiptId, sessionLabel)} target="_blank" rel="noreferrer">
                    <Printer className="size-4" />
                    <span className="sr-only">Print</span>
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={withSession(`/protected/payments?studentId=${row.studentId}`)}>Payment</Link>
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="hidden w-full overflow-x-auto rounded-xl border border-border md:block">
        <table className="min-w-[900px] text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Receipt no</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No transactions found for this view.</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.receiptId} className="border-t border-border hover:bg-surface-2/30 transition-colors">
                  <td className="px-4 py-3">{formatShortDate(row.paymentDate)}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{row.receiptNumber}</td>
                  <td className="px-4 py-3">{row.studentName}</td>
                  <td className="px-4 py-3">{row.classLabel}</td>
                  <td className="px-4 py-3">{formatPaymentModeLabel(row.paymentMode)}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{formatInr(row.totalAmount)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={withSession(`/protected/receipts/${row.receiptId}?returnTo=${encodeURIComponent(returnTo)}`)}>View</Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost" aria-label={`Print receipt ${row.receiptNumber}`}>
                        <Link href={receiptPrintHref(row.receiptId, sessionLabel)} target="_blank" rel="noreferrer">
                          <Printer className="size-4" />
                          <span className="sr-only">Print</span>
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={withSession(`/protected/students/${row.studentId}?returnTo=${encodeURIComponent(returnTo)}`)}>Student</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={withSession(`/protected/payments?studentId=${row.studentId}`)}>Payment Desk</Link>
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

type StudentTableProps = { rows: OfficeWorkbookStudentRow[]; sessionLabel: string };

function LazyTableSkeleton() {
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

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-background/60 pt-12 backdrop-blur-[1px]">
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2 text-sm text-muted-foreground shadow-sm">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Loading…
      </div>
    </div>
  );
}

function PaginationControls({
  pagination,
  onPageChange,
}: {
  pagination: OfficeWorkbookPagination;
  onPageChange: (page: number) => void;
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
        Showing {totalLabel}
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
          Previous
        </Button>
        <span className="min-w-16 text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Page {pagination.page}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!pagination.hasNextPage}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main shell
// ---------------------------------------------------------------------------

export function TransactionsClientShell({
  activeView: initialView,
  initialFilters,
  initialWorkbook,
  classOptions,
  sessionOptions,
  routeOptions,
  paymentModeOptions,
  resolvedSessionLabel,
}: TransactionsClientShellProps) {
  const [activeView, setActiveView] = useState(initialView);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [workbook, setWorkbook] = useState<OfficeWorkbookData>(initialWorkbook);
  const [isLoading, setIsLoading] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(
    () => Boolean(
      initialFilters.fromDate || initialFilters.toDate ||
      initialFilters.routeId || initialFilters.sessionLabel
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
      if ((err as Error).name !== "AbortError") console.error("[TransactionsShell] fetch error:", err);
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
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
      debounceRef.current = setTimeout(() => fetchData(view, newFilters), 320);
    } else {
      fetchData(view, newFilters);
    }
  }

  function handleFilterChange(key: keyof FilterState, value: string, debounce = false) {
    const newFilters = { ...filters, [key]: value, page: 1 };
    setFilters(newFilters);
    scheduleOrFetch(activeView, newFilters, debounce);
  }

  function handlePaymentModeToggle(mode: string) {
    handleFilterChange("paymentMode", filters.paymentMode === mode ? "" : mode);
  }

  function handleViewChange(view: OfficeWorkbookView) {
    const nextFilters = { ...filters, page: 1 };
    setActiveView(view);
    setFilters(nextFilters);
    window.history.pushState(null, "", buildPageUrl(view, nextFilters));
    fetchData(view, nextFilters);
  }

  function handleReset() {
    const empty: FilterState = { classId: "", query: "", fromDate: "", toDate: "", paymentMode: "", page: 1, routeId: "", sessionLabel: "" };
    setFilters(empty);
    setShowMoreFilters(false);
    window.history.replaceState(null, "", buildPageUrl(activeView, empty));
    fetchData(activeView, empty);
  }

  function handlePageChange(page: number) {
    const nextFilters = { ...filters, page };
    setFilters(nextFilters);
    scheduleOrFetch(activeView, nextFilters, false);
  }

  // Badge counts only secondary-panel filters — primary-row filters (search, class, mode chips) are always visible
  const extraActiveCount = [filters.fromDate, filters.toDate, filters.routeId, filters.sessionLabel].filter(Boolean).length;
  const effectiveSession = filters.sessionLabel || resolvedSessionLabel;
  const activeMeta = officeWorkbookMeta[activeView];

  // Return-to URL for action links
  const returnTo = buildPageUrl(activeView, filters);

  return (
    <div className="space-y-6">
      {/* ── View + Filters ── */}
      <SectionCard
        title="View & Filter"
        description="Switch views instantly. Filters apply without reloading the page."
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge label="Read-only" tone="accent" />
            <Button asChild size="sm" variant="outline">
              <Link href={appendSessionParam("/protected/payments", effectiveSession)}>Payment Desk</Link>
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* View tabs — exports tab excluded; use the Exports sidebar tab instead */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1.5 no-scrollbar md:mx-0 md:px-0 md:grid md:grid-cols-4 xl:grid-cols-4 md:gap-2 md:overflow-visible">
            {officeWorkbookViews.filter((v) => v !== "exports").map((view) => (
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
                {officeWorkbookMeta[view].shortTitle}
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
                  Search
                </label>
                <input
                  id="txn-query"
                  type="search"
                  value={filters.query}
                  onChange={(e) => handleFilterChange("query", e.target.value, true)}
                  placeholder="Student, SR no, receipt no, phone…"
                  className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              {/* Class */}
              <div className="min-w-[140px] flex-1 max-w-[220px]">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground" htmlFor="txn-class">
                  Class
                </label>
                <select
                  id="txn-class"
                  value={filters.classId}
                  onChange={(e) => handleFilterChange("classId", e.target.value)}
                  className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">All classes</option>
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
                Filters
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
                  title="Clear all filters"
                >
                  <X className="h-3.5 w-3.5" /> Clear
                </button>
              )}
            </div>

            {/* Secondary row: date range, route, academic year */}
            {showMoreFilters && (
              <div className="grid gap-2 rounded-lg border border-border bg-surface-2/50 p-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* Session */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground" htmlFor="txn-session">
                    Academic year
                  </label>
                  <select
                    id="txn-session"
                    value={filters.sessionLabel}
                    onChange={(e) => handleFilterChange("sessionLabel", e.target.value)}
                    className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="">Current year</option>
                    {sessionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                {/* Route */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground" htmlFor="txn-route">
                    Route
                  </label>
                  <select
                    id="txn-route"
                    value={filters.routeId}
                    onChange={(e) => handleFilterChange("routeId", e.target.value)}
                    className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="">All routes</option>
                    {routeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>

                {/* From date */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground" htmlFor="txn-from">
                    From
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
                    To
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
          title={activeView === "class_register" ? "Class summary" : "Working totals"}
          description={
            activeView === "class_register"
              ? "Top-level register totals for the selected class or working set."
              : "Essential totals first, more totals only when needed."
          }
        >
          <SummaryCards summary={(workbook as { summary: OfficeWorkbookSummary }).summary} />
        </SectionCard>
      )}

      {/* ── Data table (with loading overlay) ── */}
      <div className="relative">
        {isLoading && <LoadingOverlay />}
        {(workbook.view === "transactions" || workbook.view === "receipts") && (
          <SectionCard
            title={activeMeta.title}
            description={
              workbook.view === "transactions"
                ? "Latest posted records newest first."
                : "Receipt register with print, student, and payment desk shortcuts."
            }
          >
            <TransactionsTable rows={workbook.rows} returnTo={returnTo} sessionLabel={effectiveSession} />
          </SectionCard>
        )}
        {workbook.view === "installments" && (
          <SectionCard title="Dues tracker" description="Student-wise dues tracker with pending installments and next due details.">
            <InstallmentTrackerTable rows={workbook.rows} sessionLabel={effectiveSession} />
          </SectionCard>
        )}
        {workbook.view === "student_dues" && (
          <SectionCard title="Student dues" description="Student-wise dues, paid, pending, discount, and next-due details.">
            <StudentDuesTable rows={workbook.rows} sessionLabel={effectiveSession} />
          </SectionCard>
        )}
        {workbook.view === "class_register" && (
          <SectionCard title="Class register" description="Class register with dues status, paid, pending, and actions.">
            <ClassRegisterTable rows={workbook.rows} sessionLabel={effectiveSession} />
          </SectionCard>
        )}
        {workbook.view === "defaulters" && (
          <SectionCard title="Defaulters" description="Overdue-only follow-up register with phone-ready details.">
            <DefaultersTable rows={workbook.rows} sessionLabel={effectiveSession} />
          </SectionCard>
        )}
        {workbook.view === "collection_today" && (
          <SectionCard title="Today's collection" description="Grouped daily collection totals for desk and day-book recheck.">
            <CollectionTable rows={workbook.rows as CollectionRow[]} />
          </SectionCard>
        )}
        {workbook.view === "import_issues" && (
          <SectionCard title="Import issues" description="Recent staged rows that still need review or cleanup.">
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-full text-left text-sm">
                <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {["Row","Student","SR no","Class","Status","Errors","Warnings","Action"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {workbook.rows.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No import issues found.</td></tr>
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
                            <Link href={appendSessionParam(`/protected/imports?batchId=${row.batchId}`, effectiveSession)}>Open batch</Link>
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
          <SectionCard title="Exports" description="CSV downloads have moved.">
            <p className="text-sm text-muted-foreground">
              Use the <strong className="text-foreground">Exports</strong> tab in the sidebar to download finance data as CSV.
            </p>
          </SectionCard>
        )}
        {"pagination" in workbook && (
          <PaginationControls pagination={workbook.pagination} onPageChange={handlePageChange} />
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search, SlidersHorizontal } from "lucide-react";

import { SectionCard } from "@/ui/shell/section-card";
import { ReceiptsFilterSheet } from "@/components/receipts/receipts-filter-sheet";
import {
  ActiveFilterSummary,
  type ActiveFilterPill,
} from "@/ui/shared/active-filter-summary";
import { FilterDrawerButton } from "@/ui/shared/filter-drawer-button";
import { Button } from "@/ui/primitives/button";
import { formatInr } from "@/platform/helpers/currency";
import { staffDisplayName } from "@/platform/helpers/staff-name";
import { cn } from "@/platform/utils";
import { ReceiptPreviewSheet } from "@/components/receipts/receipt-preview-sheet";
import type { WhatsappTemplate } from "@/lib/whatsapp-templates/types";
import { ReversedBadge } from "@/components/receipts/reversed-badge";
import {
  EMPTY_RECEIPT_FILTERS,
  countActiveReceiptFilters,
  normalizeReceiptFilters,
  receiptFiltersToParams,
  type ReceiptDatePreset,
  type ReceiptFilters,
} from "@/lib/receipts/filters";
import { readerFromSearchParams } from "@/platform/navigation/search-params";
import { useUrlFilterState } from "@/ui/hooks/use-url-filter-state";
import type { ReceiptPageAggregate, ReceiptPageFacets } from "@/lib/receipts/data";
import type { ReceiptListItem } from "@/lib/receipts/types";
import type { PaymentMode } from "@/platform/db/types";

/** Everything this screen puts in the address bar, in one object. */
type ReceiptsUrlState = {
  filters: ReceiptFilters;
  page: number;
};

/** The presets that fit a phone chip row; the rest live in the sheet. */
const QUICK_DATE_PRESETS: ReceiptDatePreset[] = [
  "session",
  "today",
  "yesterday",
  "week",
  "month",
];

const DATE_PRESET_KEYS: Record<ReceiptDatePreset, string> = {
  today: "dateToday",
  yesterday: "dateYesterday",
  week: "dateThisWeek",
  month: "dateThisMonth",
  session: "dateSession",
  custom: "dateCustom",
};

const MODE_KEYS: Record<PaymentMode, string> = {
  cash: "paymentModeCash",
  upi: "paymentModeUpi",
  bank_transfer: "paymentModeBankTransfer",
  cheque: "paymentModeCheque",
  discount: "paymentModeDiscount",
};

type ReceiptsQuickLoadProps = {
  initialFilters: ReceiptFilters;
  initialPage: number;
  initialReceipts: ReceiptListItem[];
  initialTotalCount: number;
  initialAggregate: ReceiptPageAggregate;
  classOptions: Array<{ id: string; label: string }>;
  canPrintReceipts: boolean;
  /** Active WhatsApp templates, so a receipt opened from this list composes the
   *  same message as the same receipt opened on its own page. */
  whatsappTemplates?: WhatsappTemplate[];
};

export function ReceiptsQuickLoad({
  initialFilters,
  initialPage,
  initialReceipts,
  initialTotalCount,
  initialAggregate,
  classOptions,
  canPrintReceipts,
  whatsappTemplates = [],
}: ReceiptsQuickLoadProps) {
  const t = useTranslations("Receipts");
  const [filters, setFilters] = useState<ReceiptFilters>(initialFilters);
  const [page, setPage] = useState(initialPage);
  const [receipts, setReceipts] = useState(initialReceipts);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [aggregate, setAggregate] = useState(initialAggregate);
  const [facets, setFacets] = useState<ReceiptPageFacets | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [previewReceiptId, setPreviewReceiptId] = useState<string | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const isFirstRender = useRef(true);

  const paymentModeLabel = (mode: PaymentMode) => t(MODE_KEYS[mode] ?? "paymentModeCash");

  const activeFilterCount = countActiveReceiptFilters(filters);

  const updateFilters = useCallback((next: Partial<ReceiptFilters>) => {
    setPage(1);
    setFilters((previous) => ({ ...previous, ...next }));
  }, []);

  const resetFilters = useCallback(() => {
    setPage(1);
    setFilters((previous) => ({
      ...EMPTY_RECEIPT_FILTERS,
      // Search and session are not filters the Reset button owns: one is what
      // the reader typed, the other is which year they are looking at.
      query: previous.query,
      sessionLabel: previous.sessionLabel,
    }));
  }, []);

  // The server already owns both directions of this round trip -- the page
  // parses the query with normalizeReceiptFilters and this screen writes it
  // back with receiptFiltersToParams. Handing both to useUrlFilterState is what
  // lets a back-navigation put the filters back instead of erasing them.
  const toParams = useCallback(
    ({ filters: value, page: pageValue }: ReceiptsUrlState) =>
      receiptFiltersToParams(value, { page: pageValue }),
    [],
  );

  const fromParams = useCallback(
    (searchParams: URLSearchParams): ReceiptsUrlState => ({
      filters: normalizeReceiptFilters(readerFromSearchParams(searchParams)),
      page: Math.max(1, Number(searchParams.get("page") ?? 1) || 1),
    }),
    [],
  );

  const urlState = useMemo<ReceiptsUrlState>(() => ({ filters, page }), [filters, page]);
  const params = useMemo(() => toParams(urlState), [toParams, urlState]);

  useUrlFilterState<ReceiptsUrlState>({
    pathname: "/protected/receipts",
    value: urlState,
    toParams,
    fromParams,
    onAdopt: (next) => {
      setFilters(next.filters);
      setPage(next.page);
    },
  });

  // Facet counts cost the server an extra pass, so they are only asked for
  // while the sheet that displays them is open.
  const wantsFacets = filterSheetOpen;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (!wantsFacets) return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        const requestParams = receiptFiltersToParams(filters, {
          page,
          facets: wantsFacets,
        });
        const response = await fetch(`/protected/receipts/search?${requestParams.toString()}`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });

        if (!response.ok) {
          throw new Error("Unable to load receipts");
        }

        const payload = (await response.json()) as {
          receipts: ReceiptListItem[];
          totalCount: number;
          page: number;
          aggregate: ReceiptPageAggregate;
          facets?: ReceiptPageFacets;
        };

        setReceipts(payload.receipts);
        setTotalCount(payload.totalCount);
        setPage(payload.page);
        setAggregate(payload.aggregate);
        if (payload.facets) setFacets(payload.facets);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error(error);
        }
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [filters, page, wantsFacets]);

  const activePills = useMemo<ActiveFilterPill[]>(() => {
    const pills: ActiveFilterPill[] = [];

    if (filters.datePreset !== EMPTY_RECEIPT_FILTERS.datePreset) {
      pills.push({
        key: "date",
        label: t(DATE_PRESET_KEYS[filters.datePreset]),
        onRemove: () => updateFilters({ datePreset: EMPTY_RECEIPT_FILTERS.datePreset }),
      });
    }
    for (const mode of filters.paymentModes) {
      pills.push({
        key: `mode:${mode}`,
        label: paymentModeLabel(mode),
        onRemove: () =>
          updateFilters({
            paymentModes: filters.paymentModes.filter((value) => value !== mode),
          }),
      });
    }
    if (filters.classId) {
      pills.push({
        key: "class",
        label:
          classOptions.find((option) => option.id === filters.classId)?.label ?? filters.classId,
        onRemove: () => updateFilters({ classId: "" }),
      });
    }
    for (const staff of filters.receivedBy) {
      pills.push({
        key: `by:${staff}`,
        label: staffDisplayName(staff),
        onRemove: () =>
          updateFilters({
            receivedBy: filters.receivedBy.filter((value) => value !== staff),
          }),
      });
    }
    if (filters.reversedOnly) {
      pills.push({
        key: "reversed",
        label: t("filterReversedOnly"),
        onRemove: () => updateFilters({ reversedOnly: false }),
      });
    }
    if (filters.discountCloseOutsOnly) {
      pills.push({
        key: "closeouts",
        label: t("filterCloseOutsOnly"),
        onRemove: () => updateFilters({ discountCloseOutsOnly: false }),
      });
    }
    if (filters.sort !== EMPTY_RECEIPT_FILTERS.sort) {
      pills.push({
        key: "sort",
        label: t("sortAmount"),
        onRemove: () => updateFilters({ sort: EMPTY_RECEIPT_FILTERS.sort }),
      });
    }

    return pills;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classOptions, filters, t, updateFilters]);

  const pageCount = Math.max(1, Math.ceil(totalCount / 30));
  // "≈" rather than a total that is quietly short: past the aggregate cap the
  // sum covers only the rows it could read, and saying so beats implying it did
  // not have to stop.
  const totalLabel = `${aggregate.truncated ? "≈ " : ""}${formatInr(aggregate.totalAmount, { compact: true })}`;
  const averageLabel = formatInr(aggregate.averageAmount, { compact: true });

  const datePresetRow = (
    <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
      {QUICK_DATE_PRESETS.map((preset) => {
        const active = filters.datePreset === preset;
        return (
          <button
            key={preset}
            type="button"
            aria-pressed={active}
            onClick={() => updateFilters({ datePreset: preset })}
            className={cn(
              "focus-ring inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-[12.5px] font-bold transition-colors",
              active
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {t(DATE_PRESET_KEYS[preset])}
          </button>
        );
      })}
    </div>
  );

  // Deliberately NOT `MobileStatStrip` from the phone kit. That module is
  // server-safe today; importing it from here would drag the whole kit — and
  // its lucide icon — into the client graph and onto every route that shares
  // the chunk. Measured at +1.9 KB gzip on dashboard, students AND
  // transactions, three routes that have nothing to do with receipts.
  const statStrip = (
    <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-border bg-card">
      {[
        { key: "total", label: t("statTotal"), value: totalLabel },
        { key: "count", label: t("statReceipts"), value: isLoading ? "…" : totalCount },
        { key: "average", label: t("statAverage"), value: averageLabel },
      ].map((stat, index) => (
        <div
          key={stat.key}
          className={cn("px-1.5 py-3 text-center", index < 2 && "border-r border-border/60")}
        >
          <p className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            {stat.label}
          </p>
          <p className="tabular mt-1 text-base font-extrabold leading-tight text-foreground">
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );

  const filterSummary =
    activePills.length > 0 ? (
      <ActiveFilterSummary
        pills={activePills}
        onClearAll={resetFilters}
        clearAllLabel={t("filterClearAll")}
        removeAriaLabel={(label) => t("filterRemoveAria", { label })}
      />
    ) : null;

  return (
    <>
      {/* ── Phone (mobile app v2 §RECEIPT LOOKUP) ──────────────────────
          Search-first: one tall field, then the matches. The desk's two cards
          of chrome above a 36px input pushed the first match off-screen. */}
      <div className="flex flex-col gap-2.5 md:hidden">
        <div className="flex items-stretch gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[14px] border-[1.5px] border-border-strong bg-surface px-3.5 py-0">
            <Search className="size-[17px] shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              value={filters.query}
              onChange={(event) => updateFilters({ query: event.target.value })}
              className="h-[52px] min-w-0 flex-1 border-none bg-transparent text-[15px] font-semibold text-foreground outline-none placeholder:text-subtle-foreground"
              placeholder={t("lookupPlaceholder")}
              aria-label={t("lookupTitle")}
            />
            {filters.query ? (
              <button
                type="button"
                onClick={() => updateFilters({ query: "" })}
                className="focus-ring shrink-0 rounded-md px-1 text-[12px] font-bold text-muted-foreground"
              >
                {t("lookupClear")}
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            aria-label={t("filterTitle")}
            aria-expanded={filterSheetOpen}
            aria-haspopup="dialog"
            className={cn(
              "focus-ring relative grid size-[52px] shrink-0 place-items-center rounded-[14px] border text-foreground active:bg-surface-2",
              activeFilterCount > 0
                ? "border-accent bg-accent-soft"
                : "border-border-strong bg-card",
            )}
          >
            <SlidersHorizontal className="size-[18px]" aria-hidden="true" />
            {activeFilterCount > 0 ? (
              <span className="absolute -right-1 -top-1 grid size-[19px] place-items-center rounded-full bg-accent text-[10px] font-extrabold text-accent-foreground">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>

        {datePresetRow}
        {statStrip}
        {filterSummary}

        <p className="mobile-eyebrow text-muted-foreground">
          {t("recentCount", { count: totalCount })}
          {isLoading ? t("recentRefreshing") : ""}
        </p>

        {receipts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-center text-[12.5px] text-muted-foreground">
            {t("emptyMobile")}
          </p>
        ) : (
          receipts.map((receipt) => (
            <button
              key={receipt.id}
              type="button"
              onClick={() => setPreviewReceiptId(receipt.id)}
              className={cn(
                "focus-ring flex w-full items-center justify-between gap-3 rounded-[14px] border bg-card p-3 text-left transition-colors active:bg-surface-2",
                // A reversed receipt is still a real record — dimmed, never hidden.
                receipt.isReversed ? "border-destructive/30 opacity-60" : "border-border",
              )}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[12.5px] font-extrabold text-foreground">
                    {receipt.receiptNumber}
                  </span>
                  {receipt.isReversed ? <ReversedBadge /> : null}
                </span>
                <span className="mt-0.5 block truncate text-[12.5px] font-semibold text-foreground">
                  {receipt.studentFullName}
                </span>
                <span className="block truncate text-[11px] font-medium text-muted-foreground">
                  {receipt.admissionNo} · {receipt.classLabel} · {paymentModeLabel(receipt.paymentMode)} ·{" "}
                  {receipt.paymentDate}
                </span>
              </span>
              <span
                className={cn(
                  "tabular shrink-0 text-[14px] font-extrabold text-foreground",
                  receipt.isReversed && "line-through",
                )}
              >
                {formatInr(receipt.totalAmount)}
              </span>
            </button>
          ))
        )}

        <div className="mt-1 flex items-center justify-between gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            {t("paginationPrevious")}
          </Button>
          <p className="text-[11.5px] font-semibold text-muted-foreground">
            {t("pageOf", { page, pageCount })}
          </p>
          <Button size="sm" variant="outline" disabled={page >= pageCount || isLoading} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
            {t("paginationNext")}
          </Button>
        </div>
      </div>

      <SectionCard className="hidden md:block" title={t("lookupTitle")} description={t("lookupDescription")}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={filters.query}
              onChange={(event) => updateFilters({ query: event.target.value })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              placeholder={t("lookupPlaceholder")}
            />
            <FilterDrawerButton
              onClick={() => setFilterSheetOpen(true)}
              expanded={filterSheetOpen}
              activeCount={activeFilterCount}
              label={t("filterTitle")}
            />
            {filters.query ? (
              <Button type="button" variant="outline" onClick={() => updateFilters({ query: "" })}>
                {t("lookupClear")}
              </Button>
            ) : null}
          </div>
          {datePresetRow}
          {filterSummary}
        </div>
      </SectionCard>

      <SectionCard
        className="hidden md:block"
        title={t("recentTitle")}
        description={`${t("recentCount", { count: totalCount })}${isLoading ? t("recentRefreshing") : ""}`}
      >
        <div className="space-y-4">
          <div className="max-w-lg">{statStrip}</div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-full text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t("tableReceiptNo")}</th>
                  <th className="px-4 py-3">{t("tableDate")}</th>
                  <th className="px-4 py-3">{t("tableStudent")}</th>
                  <th className="px-4 py-3">{t("tableClass")}</th>
                  <th className="px-4 py-3">{t("tableMode")}</th>
                  <th className="px-4 py-3">{t("tableAmount")}</th>
                  <th className="px-4 py-3">{t("tableAction")}</th>
                </tr>
              </thead>
              <tbody>
                {receipts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                      {t("tableEmpty")}
                    </td>
                  </tr>
                ) : (
                  receipts.map((receipt) => {
                    const returnTo = `/protected/receipts${params.toString() ? `?${params.toString()}` : ""}`;
                    return (
                      <tr
                        key={receipt.id}
                        className="border-t border-border text-foreground cursor-pointer hover:bg-surface-2/40 transition-colors"
                        onClick={(event) => {
                          const target = event.target as HTMLElement | null;
                          if (target && target.closest('[data-row-action="true"]')) return;
                          setPreviewReceiptId(receipt.id);
                        }}
                      >
                        <td className="px-4 py-3 font-medium text-foreground">
                          <span className="flex items-center gap-1.5">
                            {receipt.receiptNumber}
                            {receipt.isReversed ? <ReversedBadge /> : null}
                          </span>
                        </td>
                        <td className="px-4 py-3">{receipt.paymentDate}</td>
                        <td className="px-4 py-3">
                          {receipt.studentFullName} ({receipt.admissionNo})
                        </td>
                        <td className="px-4 py-3">{receipt.classLabel}</td>
                        <td className="px-4 py-3">{paymentModeLabel(receipt.paymentMode)}</td>
                        <td className={`px-4 py-3${receipt.isReversed ? " line-through opacity-60" : ""}`}>{formatInr(receipt.totalAmount)}</td>
                        <td className="px-4 py-3" data-row-action="true" onClick={(event) => event.stopPropagation()}>
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/protected/receipts/${receipt.id}?returnTo=${encodeURIComponent(returnTo)}`}>
                              {canPrintReceipts ? t("openOrPrint") : t("openOnly")}
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              {t("pageOf", { page, pageCount })}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                {t("paginationPrevious")}
              </Button>
              <Button size="sm" variant="outline" disabled={page >= pageCount || isLoading} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                {t("paginationNext")}
              </Button>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Mounted outside BOTH breakpoint branches. Inside one, `display:none`
          at the other width would swallow the sheet the button just opened. */}
      <ReceiptsFilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        filters={filters}
        onChange={updateFilters}
        onReset={resetFilters}
        classOptions={classOptions}
        facets={facets}
        totalCount={totalCount}
        totalAmount={aggregate.totalAmount}
        isLoading={isLoading}
      />

      <ReceiptPreviewSheet
        open={previewReceiptId !== null}
        onClose={() => setPreviewReceiptId(null)}
        receiptId={previewReceiptId}
        canPrint={canPrintReceipts}
        whatsappTemplates={whatsappTemplates}
      />
    </>
  );
}

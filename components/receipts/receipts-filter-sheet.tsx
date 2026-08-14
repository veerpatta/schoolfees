"use client";

import { useTranslations } from "next-intl";

import { SegmentChip } from "@/components/shared/segment-chip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { formatInr } from "@/lib/helpers/currency";
import { staffDisplayName, staffInitials } from "@/lib/helpers/staff-name";
import {
  RECEIPT_DATE_PRESETS,
  RECEIPT_SORTS,
  type ReceiptFilters,
  type ReceiptDatePreset,
  type ReceiptSort,
} from "@/lib/receipts/filters";
import type { ReceiptPageFacets } from "@/lib/receipts/data";
import { PAYMENT_MODE_FILTER_VALUES } from "@/lib/transactions/payment-modes";
import type { PaymentMode } from "@/lib/db/types";
import { cn } from "@/lib/utils";

/**
 * The Receipts filter sheet.
 *
 * Instant-apply throughout: every tap updates the list behind the sheet, and
 * the pinned footer carries the count and the total that list is currently
 * showing. There is no Apply button, because there is nothing to apply.
 *
 * Split out of `receipts-quick-load.tsx` so that file stays about the list.
 */

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

const SORT_KEYS: Record<ReceiptSort, string> = {
  newest: "sortNewest",
  amount: "sortAmount",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Label className="mobile-eyebrow text-muted-foreground">{children}</Label>;
}

export function ReceiptsFilterSheet({
  open,
  onClose,
  filters,
  onChange,
  onReset,
  classOptions,
  facets,
  totalCount,
  totalAmount,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  filters: ReceiptFilters;
  onChange: (next: Partial<ReceiptFilters>) => void;
  onReset: () => void;
  classOptions: Array<{ id: string; label: string }>;
  facets?: ReceiptPageFacets;
  totalCount: number;
  totalAmount: number;
  isLoading: boolean;
}) {
  const t = useTranslations("Receipts");

  const modeCount = (mode: PaymentMode) =>
    facets?.byMode.find((row) => row.mode === mode)?.count ?? 0;

  const toggleMode = (mode: PaymentMode) => {
    onChange({
      paymentModes: filters.paymentModes.includes(mode)
        ? filters.paymentModes.filter((value) => value !== mode)
        : [...filters.paymentModes, mode],
    });
  };

  const toggleStaff = (receivedBy: string) => {
    onChange({
      receivedBy: filters.receivedBy.includes(receivedBy)
        ? filters.receivedBy.filter((value) => value !== receivedBy)
        : [...filters.receivedBy, receivedBy],
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("filterTitle")}
      // A bottom sheet at both widths, unlike Students. Reading `useMediaQuery`
      // here paired it with `Sheet` in this route's client graph, and webpack
      // hoisted the pair into a chunk that Dashboard and Students also load --
      // ~2.8 KB gzip charged to two routes that have nothing to do with
      // receipts, and enough to put both over their ceiling. Receipts is a
      // lookup with a short filter list; the desk can live with a bottom sheet.
      side="bottom"
      size="md"
      footer={
        <>
          <Button
            type="button"
            variant="primary"
            className="h-[52px] w-full rounded-[15px] text-sm font-extrabold"
            onClick={onClose}
          >
            {t("filterShowNReceipts", { count: isLoading ? "…" : totalCount })}
          </Button>
          <p className="mt-2 text-center text-[10.5px] font-semibold text-muted-foreground">
            {t("filterTotalLine", { amount: formatInr(totalAmount, { compact: true }) })}
          </p>
        </>
      }
    >
      <div className="space-y-4 pt-2">
        <div>
          <SectionLabel>{t("filterDate")}</SectionLabel>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {RECEIPT_DATE_PRESETS.map((preset) => {
              const active = filters.datePreset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ datePreset: preset })}
                  className={cn(
                    "grid h-[42px] place-items-center rounded-xl border-[1.5px] px-1 text-center text-[12.5px] font-extrabold leading-tight transition-colors",
                    active
                      ? "border-accent bg-accent-soft text-accent-soft-foreground"
                      : "border-border bg-card text-foreground hover:bg-surface-2",
                  )}
                >
                  <span className="truncate">{t(DATE_PRESET_KEYS[preset])}</span>
                </button>
              );
            })}
          </div>

          {filters.datePreset === "custom" ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="date"
                value={filters.fromDate}
                max={filters.toDate || undefined}
                onChange={(event) => onChange({ fromDate: event.target.value })}
                aria-label={t("filterFromDate")}
                className="focus-ring h-[46px] min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-[13px] font-bold text-foreground"
              />
              <span aria-hidden="true" className="font-bold text-muted-foreground">
                →
              </span>
              <input
                type="date"
                value={filters.toDate}
                min={filters.fromDate || undefined}
                onChange={(event) => onChange({ toDate: event.target.value })}
                aria-label={t("filterToDate")}
                className="focus-ring h-[46px] min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-[13px] font-bold text-foreground"
              />
            </div>
          ) : null}
        </div>

        <div>
          <SectionLabel>{t("filterPaymentMode")}</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PAYMENT_MODE_FILTER_VALUES.map((mode) => (
              <SegmentChip
                key={mode}
                label={t(MODE_KEYS[mode])}
                count={modeCount(mode)}
                active={filters.paymentModes.includes(mode)}
                onClick={() => toggleMode(mode)}
                dimWhenEmpty
              />
            ))}
          </div>
        </div>

        {classOptions.length > 0 ? (
          <div>
            <SectionLabel>{t("filterClass")}</SectionLabel>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[{ id: "", label: t("filterClassAll") }, ...classOptions].map((option) => {
                const active = filters.classId === option.id;
                return (
                  <button
                    key={option.id || "all"}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      onChange({ classId: filters.classId === option.id ? "" : option.id })
                    }
                    className={cn(
                      "grid h-[42px] place-items-center rounded-xl border-[1.5px] px-1 text-center text-[12.5px] font-extrabold leading-tight transition-colors",
                      active
                        ? "border-accent bg-accent-soft text-accent-soft-foreground"
                        : "border-border bg-card text-foreground hover:bg-surface-2",
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {facets && facets.byStaff.length > 0 ? (
          <div>
            <SectionLabel>{t("filterCollectedBy")}</SectionLabel>
            <div className="mt-2 flex flex-col gap-1.5">
              {facets.byStaff.map((row) => {
                const active = filters.receivedBy.includes(row.receivedBy);
                return (
                  <button
                    key={row.receivedBy}
                    type="button"
                    aria-pressed={active}
                    // Matched on the RAW stored value; the name beside it is a
                    // rendering of an email and two people can share one.
                    onClick={() => toggleStaff(row.receivedBy)}
                    className={cn(
                      "focus-ring flex w-full items-center gap-2.5 rounded-[14px] border-[1.5px] px-3 py-2.5 text-left text-[13px] font-bold transition-colors",
                      active
                        ? "border-accent bg-accent-soft text-foreground"
                        : "border-border bg-card text-foreground hover:bg-surface-2",
                    )}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-nav text-[10.5px] font-extrabold text-nav-foreground">
                      {staffInitials(row.receivedBy)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {staffDisplayName(row.receivedBy)}
                    </span>
                    <span className="tabular shrink-0 text-[11px] font-semibold text-muted-foreground">
                      {row.count}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn("shrink-0 text-[15px]", active ? "text-accent" : "text-subtle-foreground")}
                    >
                      {active ? "✓" : "○"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div>
          <SectionLabel>{t("filterOnlyShow")}</SectionLabel>
          <div className="mt-2 flex flex-col gap-2">
            {[
              {
                key: "reversedOnly" as const,
                label: t("filterReversedOnly"),
                meta: t("filterReversedOnlyMeta"),
                value: filters.reversedOnly,
              },
              {
                key: "discountCloseOutsOnly" as const,
                label: t("filterCloseOutsOnly"),
                meta: t("filterCloseOutsOnlyMeta"),
                value: filters.discountCloseOutsOnly,
              },
            ].map((toggle) => (
              <button
                key={toggle.key}
                type="button"
                role="switch"
                aria-checked={toggle.value}
                onClick={() => onChange({ [toggle.key]: !toggle.value })}
                className="focus-ring flex w-full items-center gap-3 rounded-[14px] border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-extrabold text-foreground">
                    {toggle.label}
                  </span>
                  <span className="block text-[10.5px] font-medium text-muted-foreground">
                    {toggle.meta}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
                    toggle.value ? "bg-accent" : "bg-surface-3",
                  )}
                >
                  <span
                    className={cn(
                      "size-5 rounded-full bg-card shadow-sm transition-transform",
                      toggle.value && "translate-x-5",
                    )}
                  />
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <SectionLabel>{t("filterSortBy")}</SectionLabel>
          <div className="mt-2 flex gap-1 rounded-[14px] bg-surface-2 p-1">
            {RECEIPT_SORTS.map((sort) => {
              const active = filters.sort === sort;
              return (
                <button
                  key={sort}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ sort })}
                  className={cn(
                    "h-[38px] flex-1 rounded-[10px] text-xs font-extrabold transition-colors",
                    active
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(SORT_KEYS[sort])}
                </button>
              );
            })}
          </div>
        </div>

        {/* Reset sits in the body, away from the footer's single action — a
            destructive control beside the button a thumb reaches for at the
            end of a long sheet is a misfire waiting to happen. */}
        <div className="pt-2">
          <Button
            type="button"
            variant="ghost"
            className="h-10 w-full rounded-xl text-xs font-extrabold text-accent"
            onClick={onReset}
          >
            {t("filterReset")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

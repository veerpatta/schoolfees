"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import { cn } from "@/lib/utils";
import { ReceiptPreviewSheet } from "@/components/receipts/receipt-preview-sheet";
import { ReversedBadge } from "@/components/receipts/reversed-badge";
import type { ReceiptListItem } from "@/lib/receipts/types";
import type { PaymentMode } from "@/lib/db/types";

type ReceiptsQuickLoadProps = {
  initialQuery: string;
  initialPage: number;
  initialReceipts: ReceiptListItem[];
  initialTotalCount: number;
  canPrintReceipts: boolean;
};

export function ReceiptsQuickLoad({
  initialQuery,
  initialPage,
  initialReceipts,
  initialTotalCount,
  canPrintReceipts,
}: ReceiptsQuickLoadProps) {
  const t = useTranslations("Receipts");
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(initialPage);
  const [receipts, setReceipts] = useState(initialReceipts);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [isLoading, setIsLoading] = useState(false);
  const [previewReceiptId, setPreviewReceiptId] = useState<string | null>(null);
  const isFirstRender = useRef(true);

  const paymentModeLabel = (mode: PaymentMode) => {
    if (mode === "upi") return t("paymentModeUpi");
    if (mode === "bank_transfer") return t("paymentModeBankTransfer");
    if (mode === "cheque") return t("paymentModeCheque");
    if (mode === "discount") return "Discount";
    return t("paymentModeCash");
  };
  const params = useMemo(() => {
    const value = new URLSearchParams();
    if (query) value.set("query", query);
    if (page > 1) value.set("page", String(page));
    return value;
  }, [page, query]);

  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      `/protected/receipts${params.toString() ? `?${params.toString()}` : ""}`,
    );
  }, [params]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/protected/receipts/search?${params.toString()}`, {
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
        };

        setReceipts(payload.receipts);
        setTotalCount(payload.totalCount);
        setPage(payload.page);
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
  }, [params]);

  const pageCount = Math.max(1, Math.ceil(totalCount / 30));

  return (
    <>
      {/* ── Phone (mobile app v2 §RECEIPT LOOKUP) ──────────────────────
          Search-first: one tall field, then the matches. The desk's two cards
          of chrome above a 36px input pushed the first match off-screen. */}
      <div className="flex flex-col gap-2.5 md:hidden">
        <div className="flex items-center gap-2.5 rounded-[14px] border-[1.5px] border-border-strong bg-surface px-3.5 py-0">
          <Search className="size-[17px] shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => {
              setPage(1);
              setQuery(event.target.value);
            }}
            className="h-[52px] min-w-0 flex-1 border-none bg-transparent text-[15px] font-semibold text-foreground outline-none placeholder:text-subtle-foreground"
            placeholder={t("lookupPlaceholder")}
            aria-label={t("lookupTitle")}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="focus-ring shrink-0 rounded-md px-1 text-[12px] font-bold text-muted-foreground"
            >
              {t("lookupClear")}
            </button>
          ) : null}
        </div>

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
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(event) => {
              setPage(1);
              setQuery(event.target.value);
            }}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            placeholder={t("lookupPlaceholder")}
          />
          {query ? (
            <Button type="button" variant="outline" onClick={() => setQuery("")}>
              {t("lookupClear")}
            </Button>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        className="hidden md:block"
        title={t("recentTitle")}
        description={`${t("recentCount", { count: totalCount })}${isLoading ? t("recentRefreshing") : ""}`}
      >
        <div className="space-y-4">
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

      <ReceiptPreviewSheet
        open={previewReceiptId !== null}
        onClose={() => setPreviewReceiptId(null)}
        receiptId={previewReceiptId}
        canPrint={canPrintReceipts}
      />
    </>
  );
}

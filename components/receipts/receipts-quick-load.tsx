"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/helpers/currency";
import type { ReceiptListItem } from "@/lib/receipts/types";

function paymentModeLabel(mode: "cash" | "upi" | "bank_transfer" | "cheque") {
  if (mode === "upi") return "UPI";
  if (mode === "bank_transfer") return "Bank transfer";
  if (mode === "cheque") return "Cheque";
  return "Cash";
}

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
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(initialPage);
  const [receipts, setReceipts] = useState(initialReceipts);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [isLoading, setIsLoading] = useState(false);
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
      <SectionCard title="Receipt lookup" description="Search by receipt number or reference number.">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(event) => {
              setPage(1);
              setQuery(event.target.value);
            }}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            placeholder="e.g. SVP20260421-0001 or UPI reference"
          />
          {query ? (
            <Button type="button" variant="outline" onClick={() => setQuery("")}>
              Clear
            </Button>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Recent receipts"
        description={`${totalCount} receipt${totalCount === 1 ? "" : "s"} in this view.${isLoading ? " Refreshing…" : ""}`}
      >
        <div className="space-y-4">
          <div className="space-y-3 md:hidden">
            {receipts.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                No receipts found for this filter.
              </p>
            ) : (
              receipts.map((receipt) => {
                const returnTo = `/protected/receipts${params.toString() ? `?${params.toString()}` : ""}`;
                return (
                  <div key={receipt.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                    <p className="font-semibold text-slate-900">{receipt.receiptNumber}</p>
                    <p className="text-xs text-slate-500">{receipt.paymentDate}</p>
                    <p className="mt-1">{receipt.studentFullName} ({receipt.admissionNo})</p>
                    <p className="text-xs text-slate-600">{receipt.classLabel} • {paymentModeLabel(receipt.paymentMode)}</p>
                    <p className="mt-1 font-semibold text-slate-900">{formatInr(receipt.totalAmount)}</p>
                    <Button className="mt-2" asChild variant="outline" size="sm">
                      <Link href={`/protected/receipts/${receipt.id}?returnTo=${encodeURIComponent(returnTo)}`}>
                        {canPrintReceipts ? "Open / Print" : "Open"}
                      </Link>
                    </Button>
                  </div>
                );
              })
            )}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
            <table className="w-full min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Receipt no</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {receipts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                      No receipts found for this filter.
                    </td>
                  </tr>
                ) : (
                  receipts.map((receipt) => {
                    const returnTo = `/protected/receipts${params.toString() ? `?${params.toString()}` : ""}`;
                    return (
                      <tr key={receipt.id} className="border-t border-slate-100 text-slate-700">
                        <td className="px-4 py-3 font-medium text-slate-900">{receipt.receiptNumber}</td>
                        <td className="px-4 py-3">{receipt.paymentDate}</td>
                        <td className="px-4 py-3">
                          {receipt.studentFullName} ({receipt.admissionNo})
                        </td>
                        <td className="px-4 py-3">{receipt.classLabel}</td>
                        <td className="px-4 py-3">{paymentModeLabel(receipt.paymentMode)}</td>
                        <td className="px-4 py-3">{formatInr(receipt.totalAmount)}</td>
                        <td className="px-4 py-3">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/protected/receipts/${receipt.id}?returnTo=${encodeURIComponent(returnTo)}`}>
                              {canPrintReceipts ? "Open / Print" : "Open"}
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

          <div className="flex items-center justify-between text-sm text-slate-600">
            <p>
              Page {page} of {pageCount}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={page >= pageCount || isLoading} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                Next
              </Button>
            </div>
          </div>
        </div>
      </SectionCard>
    </>
  );
}

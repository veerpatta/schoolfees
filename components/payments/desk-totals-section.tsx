"use client";

import { useState } from "react";
import Link from "next/link";

import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { OfficeRecentActions } from "@/components/office/office-ui";
import { formatInr } from "@/lib/helpers/currency";
import { appendSessionParam } from "@/lib/navigation/session-href";

type DeskTotalsSectionProps = {
  data: {
    todayCollection: {
      receiptCount: number;
      totalAmount: number;
    };
    recentReceipts: Array<{
      id: string;
      receiptNumber: string;
      studentId: string;
      studentLabel: string;
      totalAmount: number;
      paymentMode: string;
      paymentDate: string;
      createdAt: string | null;
    }>;
  };
  latestPayment: {
    id: string;
    receiptNumber: string;
    studentLabel: string;
    totalAmount: number;
    paymentMode: string;
    paymentDate: string;
    createdAt: string | null;
  } | null;
  sessionLabel: string;
};

export function DeskTotalsSection({
  data,
  latestPayment,
  sessionLabel,
}: DeskTotalsSectionProps) {
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);

  const withSession = (href: string) => appendSessionParam(href, sessionLabel);

  return (
    <SectionCard
      title="Desk totals and recent receipts"
      description="Daily totals and lookup shortcuts stay below the payment form."
      className="mobile-payment-cta-clearance md:pb-4"
    >
      <details className="md:hidden">
        <summary className="cursor-pointer rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-foreground">
          Show desk totals & recent receipts
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-xl border border-border bg-surface-2 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Today&apos;s collection
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {formatInr(data.todayCollection.totalAmount)}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {data.recentReceipts.length === 0 ? (
              <p className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
                No recent receipts yet.
              </p>
            ) : (
              data.recentReceipts.map((receipt, index) => {
                const expanded = expandedReceiptId === receipt.id;

                return (
                  <div
                    key={receipt.id}
                    className="rounded-xl border border-border bg-card p-3 shadow-sm animate-slide-up-fade"
                    style={{ animationDelay: `${index * 35}ms` }}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setExpandedReceiptId(expanded ? null : receipt.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-foreground">{receipt.receiptNumber}</span>
                        <span className="text-xs text-muted-foreground">{receipt.paymentDate}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="font-semibold text-success-soft-foreground">{formatInr(receipt.totalAmount)}</span>
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {receipt.paymentMode}
                        </span>
                      </div>
                    </button>
                    {expanded ? (
                      <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm text-muted-foreground animate-slide-up-fade">
                        <p>{receipt.studentLabel}</p>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={withSession(`/protected/receipts/${receipt.id}`)}>Print</Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link href={withSession(`/protected/students/${receipt.studentId}`)}>Student</Link>
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </details>
      <div className="hidden gap-4 lg:grid-cols-[0.8fr_1.2fr] md:grid">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-xl border border-border bg-surface-2 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Today&apos;s collection
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {formatInr(data.todayCollection.totalAmount)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {data.todayCollection.receiptCount} receipt
              {data.todayCollection.receiptCount === 1 ? "" : "s"} posted today.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-2 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Quick actions
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/protected/transactions?view=receipts">Receipts</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/protected/transactions?view=collection_today">Today&apos;s collection</Link>
              </Button>
            </div>
            <div className="mt-3">
              {latestPayment ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={withSession(`/protected/receipts/${latestPayment.id}`)}>Open latest receipt</Link>
                </Button>
              ) : (
                <OfficeRecentActions />
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Receipt</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.recentReceipts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-5 text-center text-muted-foreground">
                    No recent receipts yet.
                  </td>
                </tr>
              ) : (
                data.recentReceipts.map((receipt) => (
                  <tr key={receipt.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium text-foreground">{receipt.receiptNumber}</td>
                    <td className="px-4 py-3">{receipt.studentLabel}</td>
                    <td className="px-4 py-3">{formatInr(receipt.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={withSession(`/protected/receipts/${receipt.id}`)}>Print</Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link href={withSession(`/protected/students/${receipt.studentId}`)}>Student</Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}

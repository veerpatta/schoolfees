import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FinanceControlsClient } from "@/components/finance-controls/finance-controls-client";
import {
  getFinanceControlsPageData,
  normalizeFinanceDateFilter,
} from "@/lib/finance-controls/data";
import type { FinanceControlsActionState } from "@/lib/finance-controls/types";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

import {
  submitCollectionCloseAction,
  submitCorrectionReviewAction,
  submitRefundWorkflowAction,
} from "./actions";

type FinanceControlsPageProps = {
  searchParams?: Promise<{
    date?: string;
  }>;
};

export const INITIAL_FINANCE_CONTROLS_ACTION_STATE: FinanceControlsActionState = {
  status: "idle",
  message: "",
};

export default async function FinanceControlsPage({ searchParams }: FinanceControlsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedDate = normalizeFinanceDateFilter(resolvedSearchParams?.date ?? null);

  const [staff, data] = await Promise.all([
    requireStaffPermission("finance:view", { onDenied: "redirect" }),
    getFinanceControlsPageData(selectedDate),
  ]);

  const canWrite = hasStaffPermission(staff, "finance:write");
  const canApprove = hasStaffPermission(staff, "finance:approve");
  const exportHref = `/protected/finance-controls/export?date=${data.selectedDate}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Finance controls"
        description="Daily close, refund approvals, correction review visibility, cashier totals, and a day-book export in one office workflow."
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              label={canApprove ? "Admin approval enabled" : canWrite ? "Draft and request access" : "Read only"}
              tone={canApprove ? "good" : canWrite ? "accent" : "neutral"}
            />
            <Button asChild variant="outline">
              <Link href={exportHref}>Export day book</Link>
            </Button>
          </div>
        }
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <form action="/protected/finance-controls" method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <Input
              name="date"
              type="date"
              defaultValue={data.selectedDate}
              className="w-48"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Load day</Button>
            <Button asChild variant="outline">
              <Link href="/protected/finance-controls">Today</Link>
            </Button>
          </div>
        </form>
      </section>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
        Selected day: {data.selectedDate}. Cash deposit status, refund approvals, and correction review rows all stay visible without changing the original receipts.
      </div>

      <FinanceControlsClient
        data={data}
        canWrite={canWrite}
        canApprove={canApprove}
        initialActionState={INITIAL_FINANCE_CONTROLS_ACTION_STATE}
        actions={{
          submitCollectionCloseAction,
          submitRefundWorkflowAction,
          submitCorrectionReviewAction,
        }}
      />
    </div>
  );
}

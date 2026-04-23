import Link from "next/link";

import { StatusBadge } from "@/components/admin/status-badge";
import { cn } from "@/lib/utils";
import type {
  SetupChecklistItem,
  SetupFlowItem,
  SetupFlowStatus,
  SetupReadinessSummary,
} from "@/lib/setup/types";

function toneForChecklistStatus(status: SetupChecklistItem["status"]) {
  if (status === "complete") {
    return "good" as const;
  }

  if (status === "warning") {
    return "warning" as const;
  }

  return "neutral" as const;
}

function toneForFlowStatus(status: SetupFlowStatus) {
  switch (status) {
    case "done":
      return "good" as const;
    case "current":
      return "accent" as const;
    case "attention":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

function labelForFlowStatus(status: SetupFlowStatus) {
  switch (status) {
    case "done":
      return "Done";
    case "current":
      return "Next";
    case "attention":
      return "Needs review";
    default:
      return "Upcoming";
  }
}

export function ReadinessChecklist({
  readiness,
  className,
}: {
  readiness: SetupReadinessSummary;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Setup progress
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            {readiness.completedCount}/{readiness.totalCount}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Checks complete for first-time go-live.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Blocking gaps
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            {readiness.missingBlockingItems.length}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Remaining items before collections should begin.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Collection desk
          </p>
          <p className="mt-3 text-lg font-semibold tracking-tight text-slate-950">
            {readiness.collectionDeskReady ? "Ready" : "Not ready"}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {readiness.collectionDeskReady
              ? "Core setup, student readiness, and go-live confirmation are complete."
              : "Keep using the checklist until every blocking item is complete."}
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {readiness.checklist.map((item) => (
          <li
            key={item.key}
            className="rounded-xl border border-slate-200 bg-white px-4 py-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                  {item.blocking ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      Blocking
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <StatusBadge
                  label={
                    item.status === "complete"
                      ? "Complete"
                      : item.status === "warning"
                        ? "Check"
                        : "Missing"
                  }
                  tone={toneForChecklistStatus(item.status)}
                />
                <Link
                  href={item.href}
                  className="text-sm font-medium text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline"
                >
                  Go to step
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SetupFlowList({ items }: { items: SetupFlowItem[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, index) => (
        <li
          key={item.key}
          className="rounded-xl border border-slate-200 bg-white px-4 py-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex size-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <p className="text-sm font-semibold text-slate-950">{item.label}</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <StatusBadge
                label={labelForFlowStatus(item.status)}
                tone={toneForFlowStatus(item.status)}
              />
              <Link
                href={item.href}
                className="text-sm font-medium text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline"
              >
                Go there
              </Link>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

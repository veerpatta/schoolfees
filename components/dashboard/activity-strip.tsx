import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { activityKindLabel } from "@/lib/activity/events";
import { appendSessionParam } from "@/lib/navigation/session-href";

type Props = {
  counts: Record<string, number>;
  sessionLabel?: string;
};

const PINNED_KINDS = [
  "payment_posted",
  "receipt_printed",
  "student_edited",
  "defaulter_contacted",
  "export_downloaded",
  "import_committed",
];

export function ActivityStrip({ counts, sessionLabel }: Props) {
  const totalEvents = Object.values(counts).reduce((sum, value) => sum + value, 0);

  if (totalEvents === 0) {
    return null;
  }

  const orderedKinds = [
    ...PINNED_KINDS.filter((kind) => (counts[kind] ?? 0) > 0),
    ...Object.keys(counts).filter(
      (kind) => !PINNED_KINDS.includes(kind) && (counts[kind] ?? 0) > 0,
    ),
  ];

  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Today
          </span>
          {orderedKinds.map((kind) => (
            <span
              key={kind}
              className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-foreground"
            >
              {counts[kind]} {activityKindLabel(kind).toLowerCase()}
            </span>
          ))}
        </div>
        <Link
          href={appendSessionParam("/protected/admin-tools/activity", sessionLabel)}
          className="inline-flex items-center gap-1 text-xs font-medium text-info-soft-foreground hover:underline"
        >
          Full activity feed
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

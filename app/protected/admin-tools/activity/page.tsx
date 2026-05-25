import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { listActivity, activityKindLabel, activityKindTone } from "@/lib/activity/events";
import { hasStaffPermission, requireAnyStaffPermission } from "@/lib/supabase/session";
import { cn } from "@/lib/utils";

export const revalidate = 0;

const TONE_CLASS: Record<"success" | "info" | "warning" | "muted", string> = {
  success: "bg-success-soft text-success-soft-foreground",
  info: "bg-info-soft text-info-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  muted: "bg-surface-2 text-muted-foreground",
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function payloadDescription(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof payload.receiptNumber === "string") parts.push(`Receipt ${payload.receiptNumber}`);
  if (typeof payload.amount === "number") parts.push(`₹${payload.amount.toLocaleString("en-IN")}`);
  if (typeof payload.exportType === "string") parts.push(payload.exportType);
  if (typeof payload.outcome === "string") parts.push(`Outcome: ${payload.outcome}`);
  if (typeof payload.channel === "string") parts.push(`via ${payload.channel}`);
  if (typeof payload.paymentMode === "string") parts.push(`mode: ${payload.paymentMode}`);
  return parts.join(" · ");
}

export default async function ActivityFeedPage() {
  const staff = await requireAnyStaffPermission(["settings:view", "finance:view"], {
    onDenied: "redirect",
  });
  const canSeeAll = hasStaffPermission(staff, "settings:view");
  const events = await listActivity({
    limit: 100,
    userId: canSeeAll ? undefined : (staff.id as string | undefined),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Tools"
        title="Activity feed"
        description="Recent staff actions across the workspace. Read-only audit trail for the day-to-day."
      />

      <SectionCard
        title={canSeeAll ? "Recent activity" : "Your recent activity"}
        description="Most recent 100 events first. Older events drop off the feed but remain in the table."
      >
        {events.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-2 px-4 py-8 text-center text-sm text-muted-foreground">
            No activity yet today.
          </p>
        ) : (
          <ol className="space-y-2">
            {events.map((event) => {
              const tone = activityKindTone(event.kind);
              const description = payloadDescription(event.payload);
              const studentId =
                event.kind === "student_view" || event.kind === "student_edited" || event.kind === "defaulter_contacted"
                  ? event.refId
                  : null;
              return (
                <li
                  key={event.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        TONE_CLASS[tone],
                      )}
                    >
                      {activityKindLabel(event.kind)}
                    </span>
                    {description ? (
                      <p className="text-sm text-foreground truncate">{description}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">—</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatWhen(event.createdAt)}</span>
                    {studentId ? (
                      <Link
                        href={`/protected/students/${studentId}`}
                        className="text-info-soft-foreground hover:underline"
                      >
                        Open student
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}

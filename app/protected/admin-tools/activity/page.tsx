import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { listActivity, activityKindTone, ACTIVITY_KINDS, type ActivityKind } from "@/lib/activity/events";
import { formatInr } from "@/lib/helpers/currency";
import { formatDateTimeIst } from "@/lib/helpers/date";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { hasStaffPermission, requireAnyStaffPermission } from "@/lib/supabase/session";
import { cn } from "@/lib/utils";

export const revalidate = 0;

type AdminToolsTranslator = Awaited<ReturnType<typeof getTranslations<"AdminTools">>>;
type ActivityTranslator = Awaited<ReturnType<typeof getTranslations<"Activity">>>;

const TONE_CLASS: Record<"success" | "info" | "warning" | "muted", string> = {
  success: "bg-success-soft text-success-soft-foreground",
  info: "bg-info-soft text-info-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  muted: "bg-surface-2 text-muted-foreground",
};

const ACTIVITY_KIND_I18N: Record<ActivityKind, string> = {
  payment_posted: "kindPaymentPosted",
  payment_undone: "kindPaymentUndone",
  payment_reversed: "kindPaymentReversed",
  receipt_printed: "kindReceiptPrinted",
  student_edited: "kindStudentEdited",
  student_view: "kindStudentView",
  export_downloaded: "kindExportDownloaded",
  defaulter_contacted: "kindDefaulterContacted",
  defaulter_no_call_set: "kindDefaulterNoCall",
  import_committed: "kindImportCommitted",
};

function localizedActivityKindLabel(kind: string, t: ActivityTranslator): string {
  if ((ACTIVITY_KINDS as readonly string[]).includes(kind)) {
    return t(ACTIVITY_KIND_I18N[kind as ActivityKind] as Parameters<ActivityTranslator>[0]);
  }
  return kind;
}

const formatWhen = (iso: string) => formatDateTimeIst(iso, iso);

function payloadDescription(
  payload: Record<string, unknown>,
  t: AdminToolsTranslator,
): string {
  const parts: string[] = [];
  if (typeof payload.receiptNumber === "string") {
    parts.push(t("activityPayloadReceipt", { number: payload.receiptNumber }));
  }
  if (typeof payload.amount === "number") {
    parts.push(formatInr(payload.amount));
  }
  if (typeof payload.exportType === "string") parts.push(payload.exportType);
  if (typeof payload.outcome === "string") {
    parts.push(t("activityPayloadOutcome", { value: payload.outcome }));
  }
  if (typeof payload.channel === "string") {
    parts.push(t("activityPayloadVia", { channel: payload.channel }));
  }
  if (typeof payload.paymentMode === "string") {
    parts.push(t("activityPayloadMode", { value: payload.paymentMode }));
  }
  return parts.join(" · ");
}

export default async function ActivityFeedPage() {
  const t = await getTranslations("AdminTools");
  const tActivity = await getTranslations("Activity");
  const staff = await requireAnyStaffPermission(["settings:view", "finance:view"], {
    onDenied: "redirect",
  });
  const canSeeAll = hasStaffPermission(staff, "settings:view");
  const viewSession = await resolveViewSession({
    cookieSession: await getViewSessionCookie(),
  });
  const events = await listActivity({
    limit: 100,
    userId: canSeeAll ? undefined : (staff.id as string | undefined),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("activityTitle")}
        description={t("activityDescription")}
      />

      <SectionCard
        title={canSeeAll ? t("activityRecentTitle") : t("activityYourTitle")}
        description={t("activityRecentDescription")}
      >
        {events.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-2 px-4 py-8 text-center text-sm text-muted-foreground">
            {t("activityEmpty")}
          </p>
        ) : (
          <ol className="hidden space-y-2 md:block">
            {events.map((event) => {
              const tone = activityKindTone(event.kind);
              const description = payloadDescription(event.payload, t);
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
                      {localizedActivityKindLabel(event.kind, tActivity)}
                    </span>
                    {description ? (
                      <p className="text-sm text-foreground truncate">{description}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("activityDash")}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatWhen(event.createdAt)}</span>
                    {studentId ? (
                      <Link
                        href={appendSessionParam(`/protected/students/${studentId}`, viewSession.sessionLabel)}
                        className="text-info-soft-foreground hover:underline"
                      >
                        {t("activityOpenStudent")}
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {/* Phone: a vertical timeline (mobile v2). The desk row puts kind,
            description and time on one line, which wraps into three ragged
            rows on a phone. A dot-and-rail reads as a sequence, which is what
            an audit trail is — and the coloured dot carries the kind, so the
            pill does not have to compete with the description for width. */}
        {events.length > 0 ? (
          <ol className="relative flex flex-col gap-0 md:hidden">
            {events.map((event, index) => {
              const tone = activityKindTone(event.kind);
              const description = payloadDescription(event.payload, t);
              const studentId =
                event.kind === "student_view" ||
                event.kind === "student_edited" ||
                event.kind === "defaulter_contacted"
                  ? event.refId
                  : null;
              const isLast = index === events.length - 1;

              return (
                <li key={`m-${event.id}`} className="relative flex gap-3 pb-4 last:pb-0">
                  {/* Rail: drawn per item rather than as one absolute line so
                      it stops cleanly at the final entry. */}
                  {!isLast ? (
                    <span
                      aria-hidden="true"
                      className="absolute left-[5px] top-3.5 h-full w-px bg-border"
                    />
                  ) : null}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "relative z-[1] mt-1 size-2.5 shrink-0 rounded-full ring-4 ring-card",
                      tone === "success" && "bg-success",
                      tone === "warning" && "bg-warning",
                      tone === "info" && "bg-info",
                      tone === "muted" && "bg-border-strong",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-extrabold leading-tight text-foreground">
                      {localizedActivityKindLabel(event.kind, tActivity)}
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                      {formatWhen(event.createdAt)}
                    </p>
                    {description ? (
                      <p className="mt-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-foreground/80">
                        {description}
                      </p>
                    ) : null}
                    {studentId ? (
                      <Link
                        href={appendSessionParam(
                          `/protected/students/${studentId}`,
                          viewSession.sessionLabel,
                        )}
                        className="focus-ring mt-1.5 inline-block text-[11.5px] font-extrabold text-accent"
                      >
                        {t("activityOpenStudent")}
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
      </SectionCard>
    </div>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { listActivity, activityKindTone, ACTIVITY_KINDS, type ActivityKind } from "@/lib/activity/events";
import { formatInr } from "@/lib/helpers/currency";
import { formatDateTimeIst } from "@/lib/helpers/date";
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
  receipt_printed: "kindReceiptPrinted",
  student_edited: "kindStudentEdited",
  student_view: "kindStudentView",
  export_downloaded: "kindExportDownloaded",
  defaulter_contacted: "kindDefaulterContacted",
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
          <ol className="space-y-2">
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
                        href={`/protected/students/${studentId}`}
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
      </SectionCard>
    </div>
  );
}

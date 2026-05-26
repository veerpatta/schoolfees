import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";

import { ACTIVITY_KINDS, type ActivityKind } from "@/lib/activity/events";
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

const ACTIVITY_KIND_I18N: Record<ActivityKind, string> = {
  payment_posted: "kindPaymentPosted",
  receipt_printed: "kindReceiptPrinted",
  student_edited: "kindStudentEdited",
  student_view: "kindStudentView",
  export_downloaded: "kindExportDownloaded",
  defaulter_contacted: "kindDefaulterContacted",
  import_committed: "kindImportCommitted",
};

export async function ActivityStrip({ counts, sessionLabel }: Props) {
  const t = await getTranslations("Activity");
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

  const labelForKind = (kind: string): string => {
    if ((ACTIVITY_KINDS as readonly string[]).includes(kind)) {
      return t(ACTIVITY_KIND_I18N[kind as ActivityKind] as Parameters<typeof t>[0]);
    }
    return kind;
  };

  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("stripTodayLabel")}
          </span>
          {orderedKinds.map((kind) => (
            <span
              key={kind}
              className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-foreground"
            >
              {counts[kind]} {labelForKind(kind).toLowerCase()}
            </span>
          ))}
        </div>
        <Link
          href={appendSessionParam("/protected/admin-tools/activity", sessionLabel)}
          className="inline-flex items-center gap-1 text-xs font-medium text-info-soft-foreground hover:underline"
        >
          {t("stripFullFeed")}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

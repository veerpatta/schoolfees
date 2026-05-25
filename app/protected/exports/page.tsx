import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UsersRound, BadgePercent, Layers, CircleAlert, Receipt, Download, Sparkles, FileText } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { OfficeNotice } from "@/components/office/office-ui";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { requireStaffPermission } from "@/lib/supabase/session";
import { cn } from "@/lib/utils";

export const revalidate = 60;

const exportGroups = [
  {
    titleKey: "groupStudents",
    items: [
      {
        key: "all-students",
        labelKey: "itemAllStudents",
        detailKey: "itemAllStudentsDetail",
        icon: UsersRound,
        tone: "neutral" as const,
      },
      {
        key: "conventional-discount-students",
        labelKey: "itemDiscountStudents",
        detailKey: "itemDiscountStudentsDetail",
        icon: BadgePercent,
        tone: "info" as const,
      },
    ],
  },
  {
    titleKey: "groupFees",
    items: [
      {
        key: "class-wise-dues",
        labelKey: "itemClassWiseDues",
        detailKey: "itemClassWiseDuesDetail",
        icon: Layers,
        tone: "warning" as const,
      },
      {
        key: "defaulters",
        labelKey: "itemDefaulters",
        detailKey: "itemDefaultersDetail",
        icon: CircleAlert,
        tone: "danger" as const,
      },
    ],
  },
  {
    titleKey: "groupPayments",
    items: [
      {
        key: "receipt-register",
        labelKey: "itemReceiptRegister",
        detailKey: "itemReceiptRegisterDetail",
        icon: Receipt,
        tone: "success" as const,
      },
    ],
  },
  {
    titleKey: "groupAnalysis",
    items: [
      {
        key: "ai-context-bundle",
        labelKey: "itemAiContextBundle",
        detailKey: "itemAiContextBundleDetail",
        icon: Sparkles,
        tone: "info" as const,
      },
    ],
  },
] as const;

function getIconStyles(tone: "neutral" | "info" | "warning" | "danger" | "success") {
  switch (tone) {
    case "info":
      return {
        bg: "bg-info-soft",
        icon: "text-info-soft-foreground",
      };
    case "warning":
      return {
        bg: "bg-warning-soft",
        icon: "text-warning-soft-foreground",
      };
    case "danger":
      return {
        bg: "bg-destructive-soft",
        icon: "text-destructive-soft-foreground",
      };
    case "success":
      return {
        bg: "bg-success-soft",
        icon: "text-success-soft-foreground",
      };
    default:
      return {
        bg: "bg-surface-3",
        icon: "text-muted-foreground",
      };
  }
}

type ExportsPageProps = {
  searchParams?: Promise<{ session?: string }>;
};

export default async function ExportsPage({ searchParams }: ExportsPageProps) {
  await requireStaffPermission("reports:view", { onDenied: "redirect" });
  const t = await getTranslations("Exports");
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const viewSession = await resolveViewSession({
    searchParamSession: resolvedSearchParams?.session,
    cookieSession: await getViewSessionCookie(),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <OfficeNotice>
        {t("officeNotice")}
      </OfficeNotice>

      <div className="grid gap-4 lg:grid-cols-3">
        {exportGroups.map((group) => (
          <SectionCard
            key={group.titleKey}
            title={t(group.titleKey)}
            description={t("groupChooseHint")}
          >
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-1">
              {group.items.map((item) => {
                const styles = getIconStyles(item.tone);
                const IconComponent = item.icon;
                const xlsxHref = `/protected/exports/${item.key}?session=${encodeURIComponent(viewSession.sessionLabel)}`;
                const pdfHref = `/protected/exports/${item.key}?session=${encodeURIComponent(viewSession.sessionLabel)}&format=pdf`;
                const supportsPdf = item.key !== "ai-context-bundle";
                return (
                  <div
                    key={item.key}
                    className="group flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-4 hover:border-border-strong transition-all"
                  >
                    <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", styles.bg)}>
                      <IconComponent className={cn("size-5", styles.icon)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground text-sm">{t(item.labelKey)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t(item.detailKey)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Link
                        href={xlsxHref}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-3"
                      >
                        <Download className="size-3.5" aria-hidden="true" />
                        {t("formatXlsx")}
                      </Link>
                      {supportsPdf ? (
                        <Link
                          href={pdfHref}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-3"
                        >
                          <FileText className="size-3.5" aria-hidden="true" />
                          {t("formatPdf")}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}

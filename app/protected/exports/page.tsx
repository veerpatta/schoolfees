import Link from "next/link";
import { UsersRound, BadgePercent, Layers, CircleAlert, Receipt, Download } from "lucide-react";

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
    title: "Students",
    items: [
      {
        key: "all-students",
        label: "All students",
        detail: "Complete student list for office checking.",
        icon: UsersRound,
        tone: "neutral" as const,
      },
      {
        key: "conventional-discount-students",
        label: "Discount students",
        detail: "RTE, staff child, and sibling policy.",
        icon: BadgePercent,
        tone: "info" as const,
      },
    ],
  },
  {
    title: "Fees / Dues",
    items: [
      {
        key: "class-wise-dues",
        label: "Class-wise dues",
        detail: "Class totals and pending fee review.",
        icon: Layers,
        tone: "warning" as const,
      },
      {
        key: "defaulters",
        label: "Defaulters",
        detail: "Follow-up list for pending and overdue dues.",
        icon: CircleAlert,
        tone: "danger" as const,
      },
    ],
  },
  {
    title: "Payments",
    items: [
      {
        key: "receipt-register",
        label: "Receipt register",
        detail: "Saved receipt records for office accounts.",
        icon: Receipt,
        tone: "success" as const,
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
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const viewSession = await resolveViewSession({
    searchParamSession: resolvedSearchParams?.session,
    cookieSession: await getViewSessionCookie(),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Exports"
        title="Exports"
        description="Download Excel files for students, dues, follow-up, and receipts."
      />
      <OfficeNotice>
        On mobile, downloads may open in your browser or spreadsheet app depending on device settings.
      </OfficeNotice>

      <div className="grid gap-4 lg:grid-cols-3">
        {exportGroups.map((group) => (
          <SectionCard key={group.title} title={group.title} description="Choose the file that matches the office task.">
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-1">
              {group.items.map((item) => {
                const styles = getIconStyles(item.tone);
                const IconComponent = item.icon;
                return (
                  <Link
                    key={item.key}
                    href={`/protected/exports/${item.key}?session=${encodeURIComponent(viewSession.sessionLabel)}`}
                    className="group flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-4 hover:border-border-strong hover:bg-surface-2 active:scale-[0.99] transition-all"
                  >
                    <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", styles.bg)}>
                      <IconComponent className={cn("size-5", styles.icon)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                    </div>
                    <Download className="size-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
                  </Link>
                );
              })}
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TabKey = "dues" | "receipts" | "payments" | "fee-plan" | "about";

type StudentWorkspaceTabsProps = {
  defaultTab: TabKey;
  counts: {
    dues: number;
    receipts: number;
    payments: number;
  };
  duesContent: React.ReactNode;
  receiptsContent: React.ReactNode;
  paymentsContent: React.ReactNode;
  feePlanContent: React.ReactNode;
  aboutContent: React.ReactNode;
};

/**
 * The phone design draws tabs as an underline rule, not a filled pill, and
 * that treatment now applies at every width instead of only from `md` up.
 *
 * It keeps FIVE tabs, though, where the design shows three. Folding receipts,
 * payment lines and the fee plan under "Fees" would remove views the office
 * uses daily — the design's information architecture is worth adopting, its
 * deletions are not. Five underline tabs do not fit across 390px, so the row
 * scrolls horizontally rather than compressing to unreadable labels.
 */
const triggerClass = [
  "shrink-0 whitespace-nowrap rounded-none border-b-[2.5px] border-transparent bg-transparent",
  "px-3 py-2.5 text-[12.5px] font-extrabold text-muted-foreground transition-colors",
  "hover:text-foreground",
  "data-[state=active]:border-accent data-[state=active]:bg-transparent",
  "data-[state=active]:text-accent data-[state=active]:shadow-none",
  "md:px-4 md:text-sm md:data-[state=active]:text-foreground",
].join(" ");

export function StudentWorkspaceTabs(props: StudentWorkspaceTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useTranslations("Students");

  const handleChange = useCallback(
    (next: string) => {
      const updated = new URLSearchParams(params.toString());
      updated.set("tab", next);
      router.replace(`${pathname}?${updated.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const tabBadge = (n: number) =>
    n > 0 ? (
      <span className="ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-surface-2 px-1.5 text-[11px] font-medium text-muted-foreground">
        {n}
      </span>
    ) : null;

  const tabs: Array<{ value: TabKey; label: string; badge?: number }> = [
    { value: "dues", label: t("tabDues"), badge: props.counts.dues },
    { value: "receipts", label: t("tabReceipts"), badge: props.counts.receipts },
    { value: "payments", label: t("tabPaymentLines"), badge: props.counts.payments },
    { value: "fee-plan", label: t("tabFeePlan") },
    { value: "about", label: t("tabAbout") },
  ];

  return (
    <Tabs defaultValue={props.defaultTab} onValueChange={handleChange} className="w-full">
      <div className="no-scrollbar sticky top-0 z-10 -mx-4 overflow-x-auto bg-background/95 px-4 backdrop-blur-sm md:static md:z-auto md:mx-0 md:bg-transparent md:px-0 md:backdrop-blur-none">
        <TabsList className="flex h-auto w-full min-w-max justify-start gap-1 rounded-none border-b border-border bg-transparent p-0 md:min-w-0">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className={triggerClass}>
              {tab.label}
              {tab.badge === undefined ? null : tabBadge(tab.badge)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="dues" className="mt-4 focus-visible:ring-0 focus-visible:ring-offset-0">{props.duesContent}</TabsContent>
      <TabsContent value="receipts" className="mt-4 focus-visible:ring-0 focus-visible:ring-offset-0">{props.receiptsContent}</TabsContent>
      <TabsContent value="payments" className="mt-4 focus-visible:ring-0 focus-visible:ring-offset-0">{props.paymentsContent}</TabsContent>
      <TabsContent value="fee-plan" className="mt-4 focus-visible:ring-0 focus-visible:ring-offset-0">{props.feePlanContent}</TabsContent>
      <TabsContent value="about" className="mt-4 focus-visible:ring-0 focus-visible:ring-offset-0">{props.aboutContent}</TabsContent>
    </Tabs>
  );
}

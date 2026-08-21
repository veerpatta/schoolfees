"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/primitives/tabs";

export type TabKey = "receipts" | "dues" | "fee-plan" | "about";

type StudentWorkspaceTabsProps = {
  defaultTab: TabKey;
  counts: {
    dues: number;
    receipts: number;
  };
  receiptsContent: React.ReactNode;
  duesContent: React.ReactNode;
  feePlanContent: React.ReactNode;
  aboutContent: React.ReactNode;
};

/**
 * Four tabs, receipts first and default.
 *
 * The page's main job is checking payment history — finding a receipt,
 * confirming what was paid. That was the third tab, roughly 1,100px down.
 *
 * Was five. "Receipts" and "Payment lines" were two tabs answering the same
 * question, which reliably produced "which one do I look at?"; they are now one
 * surface, receipts first with the allocation lines beneath. The tab VALUES are
 * unchanged so `?tab=` links shared before this still resolve — see
 * `normalizeTab`, which additionally maps the retired `payments` value here.
 *
 * The underline treatment is the phone design's, applied at every width. Tabs
 * scroll horizontally rather than compressing to unreadable labels.
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
    { value: "receipts", label: t("tabReceipts"), badge: props.counts.receipts },
    { value: "dues", label: t("tabDues"), badge: props.counts.dues },
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

      <TabsContent value="receipts" className="mt-4 focus-visible:ring-0 focus-visible:ring-offset-0">{props.receiptsContent}</TabsContent>
      <TabsContent value="dues" className="mt-4 focus-visible:ring-0 focus-visible:ring-offset-0">{props.duesContent}</TabsContent>
      <TabsContent value="fee-plan" className="mt-4 focus-visible:ring-0 focus-visible:ring-offset-0">{props.feePlanContent}</TabsContent>
      <TabsContent value="about" className="mt-4 focus-visible:ring-0 focus-visible:ring-offset-0">{props.aboutContent}</TabsContent>
    </Tabs>
  );
}

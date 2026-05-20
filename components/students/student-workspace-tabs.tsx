"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

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

export function StudentWorkspaceTabs(props: StudentWorkspaceTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

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
      <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-surface-2 px-1.5 text-[11px] font-medium text-muted-foreground">
        {n}
      </span>
    ) : null;

  return (
    <Tabs defaultValue={props.defaultTab} onValueChange={handleChange} className="w-full">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
        <TabsTrigger value="dues">Dues{tabBadge(props.counts.dues)}</TabsTrigger>
        <TabsTrigger value="receipts">Receipts{tabBadge(props.counts.receipts)}</TabsTrigger>
        <TabsTrigger value="payments">Payments{tabBadge(props.counts.payments)}</TabsTrigger>
        <TabsTrigger value="fee-plan">Fee Plan</TabsTrigger>
        <TabsTrigger value="about">About</TabsTrigger>
      </TabsList>

      <TabsContent value="dues" className="mt-4">{props.duesContent}</TabsContent>
      <TabsContent value="receipts" className="mt-4">{props.receiptsContent}</TabsContent>
      <TabsContent value="payments" className="mt-4">{props.paymentsContent}</TabsContent>
      <TabsContent value="fee-plan" className="mt-4">{props.feePlanContent}</TabsContent>
      <TabsContent value="about" className="mt-4">{props.aboutContent}</TabsContent>
    </Tabs>
  );
}

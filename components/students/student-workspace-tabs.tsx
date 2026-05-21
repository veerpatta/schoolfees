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
      <div className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <TabsList className="flex h-auto w-full justify-start gap-1.5 bg-transparent p-0 border-b border-border rounded-none min-w-max md:min-w-0 pb-1.5 md:pb-0">
          <TabsTrigger
            value="dues"
            className="shrink-0 whitespace-nowrap rounded-full bg-transparent border-transparent px-4 py-2 hover:text-foreground text-muted-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none transition-all font-semibold text-sm md:rounded-none md:border-b-2 md:border-transparent md:data-[state=active]:bg-transparent md:data-[state=active]:border-accent md:data-[state=active]:text-foreground"
          >
            Dues{tabBadge(props.counts.dues)}
          </TabsTrigger>
          <TabsTrigger
            value="receipts"
            className="shrink-0 whitespace-nowrap rounded-full bg-transparent border-transparent px-4 py-2 hover:text-foreground text-muted-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none transition-all font-semibold text-sm md:rounded-none md:border-b-2 md:border-transparent md:data-[state=active]:bg-transparent md:data-[state=active]:border-accent md:data-[state=active]:text-foreground"
          >
            Receipts{tabBadge(props.counts.receipts)}
          </TabsTrigger>
          <TabsTrigger
            value="payments"
            className="shrink-0 whitespace-nowrap rounded-full bg-transparent border-transparent px-4 py-2 hover:text-foreground text-muted-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none transition-all font-semibold text-sm md:rounded-none md:border-b-2 md:border-transparent md:data-[state=active]:bg-transparent md:data-[state=active]:border-accent md:data-[state=active]:text-foreground"
          >
            Payments{tabBadge(props.counts.payments)}
          </TabsTrigger>
          <TabsTrigger
            value="fee-plan"
            className="shrink-0 whitespace-nowrap rounded-full bg-transparent border-transparent px-4 py-2 hover:text-foreground text-muted-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none transition-all font-semibold text-sm md:rounded-none md:border-b-2 md:border-transparent md:data-[state=active]:bg-transparent md:data-[state=active]:border-accent md:data-[state=active]:text-foreground"
          >
            Fee Plan
          </TabsTrigger>
          <TabsTrigger
            value="about"
            className="shrink-0 whitespace-nowrap rounded-full bg-transparent border-transparent px-4 py-2 hover:text-foreground text-muted-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none transition-all font-semibold text-sm md:rounded-none md:border-b-2 md:border-transparent md:data-[state=active]:bg-transparent md:data-[state=active]:border-accent md:data-[state=active]:text-foreground"
          >
            About
          </TabsTrigger>
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

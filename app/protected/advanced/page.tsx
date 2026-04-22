import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { advancedHubItems } from "@/lib/config/navigation";
import { hasStaffPermission, requireAnyStaffPermission } from "@/lib/supabase/session";

export default async function AdvancedPage() {
  const staff = await requireAnyStaffPermission(["finance:view", "settings:view"], {
    onDenied: "redirect",
  });
  const visibleItems = advancedHubItems.filter((item) =>
    hasStaffPermission(staff, item.requiredPermission),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Advanced"
        title="Advanced tools"
        description="All deeper admin and finance-office modules stay available here without crowding the daily office navigation."
        actions={<StatusBadge label="Secondary workspace" tone="accent" />}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleItems.map((item) => {
          const Icon = item.icon;

          return (
            <SectionCard key={item.href} title={item.label} description={item.description}>
              <div className="flex items-center justify-between gap-3">
                <div className="rounded-full border border-slate-200 bg-slate-50 p-3 text-slate-700">
                  <Icon className="size-5" />
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={item.href}>Open</Link>
                </Button>
              </div>
            </SectionCard>
          );
        })}
      </section>
    </div>
  );
}

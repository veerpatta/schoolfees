import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
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
        description="Less-used admin and finance tools stay here so the daily workflow stays clean."
        actions={<StatusBadge label="Secondary workspace" tone="accent" />}
      />

      <SectionCard
        title="Advanced modules"
        description="Open only the tool you need. Everything here is secondary to the daily fee desk workflow."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:border-slate-300 hover:bg-white"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-full border border-slate-200 bg-white p-2.5 text-slate-700">
                    <Icon className="size-4" />
                  </div>
                  <span className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm">
                    Open
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-950">{item.label}</p>
                <p className="mt-1 text-sm text-slate-600">{item.description}</p>
              </Link>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

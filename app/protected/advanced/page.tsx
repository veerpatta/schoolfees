import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { advancedHubSections } from "@/lib/config/navigation";
import { hasStaffPermission, requireAnyStaffPermission } from "@/lib/supabase/session";

export default async function AdvancedPage() {
  const staff = await requireAnyStaffPermission(["finance:view", "settings:view"], {
    onDenied: "redirect",
  });

  const visibleSections = advancedHubSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => hasStaffPermission(staff, item.requiredPermission)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Tools"
        title="Admin Tools"
        description="Rare setup, staff, correction, and troubleshooting tools."
        actions={<StatusBadge label="Rare admin area" tone="accent" />}
      />

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
        These tools are rarely needed. Daily work should stay in Dashboard, Students, Fee Setup,
        Payment Desk, and Transactions.
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {visibleSections.map((section) => (
          <SectionCard key={section.title} title={section.title} description={section.description}>
            <div className="grid gap-3">
              {section.items.map((item) => {
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
        ))}
      </div>
    </div>
  );
}

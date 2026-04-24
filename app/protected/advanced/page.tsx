import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { advancedAdditionalLinks, advancedHubItems } from "@/lib/config/navigation";
import { hasStaffPermission, requireAnyStaffPermission } from "@/lib/supabase/session";

export default async function AdvancedPage() {
  const staff = await requireAnyStaffPermission(["finance:view", "settings:view"], {
    onDenied: "redirect",
  });
  const visibleItems = advancedHubItems.filter((item) =>
    hasStaffPermission(staff, item.requiredPermission),
  );
  const visibleAdditionalLinks = advancedAdditionalLinks.filter((item) =>
    hasStaffPermission(staff, item.requiredPermission),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Tools"
        title="Admin Tools"
        description="Staff, settings, school lists, setup review, and rare admin tools."
        actions={<StatusBadge label="Rare admin area" tone="accent" />}
      />

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
        These tools are rarely needed. Daily work should happen in Dashboard, Students, Fee Setup,
        Payment Desk, and Transactions.
      </div>

      <SectionCard
        title="Admin tools"
        description="Open only the rare setup or configuration tool you need."
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

      {visibleAdditionalLinks.length > 0 ? (
        <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900">
            Additional links
            <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">
              These are usually reached from Students or Transactions.
            </span>
          </summary>
          <div className="grid gap-3 border-t border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleAdditionalLinks.map((item) => {
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
        </details>
      ) : null}
    </div>
  );
}

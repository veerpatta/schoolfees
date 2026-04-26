import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { requireStaffPermission } from "@/lib/supabase/session";

const exportGroups = [
  {
    title: "Students",
    items: [
      ["all-students", "All students"],
      ["conventional-discount-students", "Conventional discount students"],
    ],
  },
  {
    title: "Fees / Dues",
    items: [
      ["class-wise-dues", "Class-wise dues"],
      ["defaulters", "Defaulters"],
    ],
  },
  {
    title: "Payments",
    items: [["receipt-register", "Receipt register"]],
  },
] as const;

export default async function ExportsPage() {
  await requireStaffPermission("reports:view", { onDenied: "redirect" });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Exports"
        title="Exports"
        description="Download Excel files for student, dues, defaulter, and receipt records."
      />
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        On mobile, downloads may open in your browser or spreadsheet app depending on device settings.
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        {exportGroups.map((group) => (
          <SectionCard key={group.title} title={group.title} description="Excel downloads for office work.">
            <div className="space-y-3">
              {group.items.map(([key, label]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"
                >
                  <span className="text-sm font-medium text-slate-900">{label}</span>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/protected/exports/${key}`}>Download XLSX</Link>
                  </Button>
                </div>
              ))}
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}

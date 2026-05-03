import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { OfficeNotice } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { requireStaffPermission } from "@/lib/supabase/session";

const exportGroups = [
  {
    title: "Students",
    items: [
      ["all-students", "All students", "Complete student list for office checking."],
      ["conventional-discount-students", "Conventional discount students", "Students with RTE, staff child, or sibling policy assignments."],
    ],
  },
  {
    title: "Fees / Dues",
    items: [
      ["class-wise-dues", "Class-wise dues", "Class totals and pending fee review."],
      ["defaulters", "Defaulters", "Follow-up list for pending and overdue dues."],
    ],
  },
  {
    title: "Payments",
    items: [["receipt-register", "Receipt register", "Saved receipt records for office accounts."]],
  },
] as const;

export default async function ExportsPage() {
  await requireStaffPermission("reports:view", { onDenied: "redirect" });

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
            <div className="space-y-3">
              {group.items.map(([key, label, detail]) => (
                <div
                  key={key}
                  className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    <span className="block text-sm font-medium text-slate-900">{label}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">{detail}</span>
                  </span>
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

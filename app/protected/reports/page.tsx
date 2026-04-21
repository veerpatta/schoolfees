import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";

const reports = [
  {
    title: "Outstanding report",
    description:
      "View dues by class, student, and session with filters before following up.",
  },
  {
    title: "Daily collection summary",
    description:
      "Total receipts by date and payment mode for day-book style reconciliation.",
  },
  {
    title: "Student ledger export",
    description:
      "Full installment and payment history per student, including late fee and concession fields.",
  },
  {
    title: "Import verification report",
    description:
      "Compare posted batches against workbook row counts and rejected entries.",
  },
] as const;

const filterExpectations = [
  "Class and section",
  "Session label",
  "Date range",
  "Payment mode",
  "Collection status",
] as const;

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Operational and audit outputs"
        description="Generate outstanding, day-book, and ledger-ready reports that stay traceable to the underlying entries."
        actions={<StatusBadge label="Audit-focused" tone="accent" />}
      />

      <SectionCard
        title="Report catalog"
        description="Start with a small set of reports that staff can trust every day."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {reports.map((report) => (
            <div
              key={report.title}
              className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4"
            >
              <p className="text-base font-semibold text-slate-950">
                {report.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {report.description}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Standard filters"
          description="Keep reports useful for staff without turning them into analytics overload."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {filterExpectations.map((filter) => (
              <div
                key={filter}
                className="rounded-[22px] border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-sm font-medium text-slate-700"
              >
                {filter}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Audit expectation"
          description="Reports should always explain where their totals came from."
        >
          <ul className="space-y-3 text-sm leading-6 text-slate-700">
            <li>- Show receipt references and payment modes where relevant.</li>
            <li>- Include created and updated timestamps for exported ledger data.</li>
            <li>- Preserve batch references for imported student records.</li>
            <li>- Make corrections visible instead of hiding them through deletes.</li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

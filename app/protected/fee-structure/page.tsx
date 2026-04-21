import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { activeFeeRules } from "@/lib/config/fee-rules";
import { formatInr } from "@/lib/helpers/currency";

const classDefaults = [
  {
    classLabel: "Class 12 Science",
    annualFee: formatInr(activeFeeRules.class12ScienceAnnualFeeRupees),
    note: "Starter default already aligned with current school override.",
  },
  {
    classLabel: "All other classes",
    annualFee: "Configure per approved schedule",
    note: "Set class-wise annual fee before ledger generation goes live.",
  },
] as const;

export default function FeeStructurePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fee Structure"
        title="Fee plans and installment rules"
        description="Configure annual fee plans, due-date windows, and ledger defaults before collections begin."
        actions={<StatusBadge label="Policy-controlled" tone="accent" />}
      />

      <SectionCard
        title="Active defaults"
        description="These values are preloaded from the current school fee policy."
      >
        <div className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
          <div className="rounded-[22px] bg-slate-50 px-4 py-3">
            <p className="font-semibold text-slate-900">
              Late fee: {formatInr(activeFeeRules.lateFeeFlatRupees)}
            </p>
          </div>
          <div className="rounded-[22px] bg-slate-50 px-4 py-3">
            <p className="font-semibold text-slate-900">
              Class 12 Science:{" "}
              {formatInr(activeFeeRules.class12ScienceAnnualFeeRupees)}
            </p>
          </div>
          <div className="rounded-[22px] bg-slate-50 px-4 py-3 md:col-span-2">
            <p className="font-semibold text-slate-900">
              Installment due dates:{" "}
              {activeFeeRules.installmentDueDates.join(", ")}
            </p>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Starter class defaults"
          description="Use these as the first entries when building live fee plans."
        >
          <div className="space-y-3">
            {classDefaults.map((entry) => (
              <div
                key={entry.classLabel}
                className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-base font-semibold text-slate-950">
                    {entry.classLabel}
                  </p>
                  <p className="text-sm font-semibold text-slate-700">
                    {entry.annualFee}
                  </p>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {entry.note}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Ledger generation notes"
          description="Set these before producing annual installments for students."
        >
          <ul className="space-y-3 text-sm leading-6 text-slate-700">
            <li>
              - Keep annual fee setup separate from collection entry so policy
              changes remain controlled.
            </li>
            <li>
              - Generate one ledger row per installment per student for the
              current session.
            </li>
            <li>
              - Record concession, late fee, and received amount independently
              for audit clarity.
            </li>
            <li>
              - When fee rules change, update the config file, settings page,
              and README together.
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

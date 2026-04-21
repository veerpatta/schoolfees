import { SectionCard } from "@/components/admin/section-card";
import { activeFeeRules } from "@/lib/config/fee-rules";
import { formatInr } from "@/lib/helpers/currency";

export default function FeeStructurePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Fee Structure</h1>
        <p className="mt-1 text-sm text-slate-600">
          Configure annual fee plans and installment mapping by class.
        </p>
      </header>

      <SectionCard
        title="Active defaults"
        description="These values are preloaded from the current school fee policy."
      >
        <div className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
          <p>Late fee: {formatInr(activeFeeRules.lateFeeFlatRupees)}</p>
          <p>
            Class 12 Science: {formatInr(activeFeeRules.class12ScienceAnnualFeeRupees)}
          </p>
          <p className="md:col-span-2">
            Installment due dates: {activeFeeRules.installmentDueDates.join(", ")}
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

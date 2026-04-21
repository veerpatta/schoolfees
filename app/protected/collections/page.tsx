import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { activeFeeRules } from "@/lib/config/fee-rules";

const collectionFlow = [
  "Search by admission number or student name.",
  "Open the pending installment or ledger row.",
  "Enter amount received, payment mode, and receipt reference.",
  "Save the collection with a timestamp and staff user.",
  "Print or share the receipt if your process needs it.",
] as const;

const receiptControls = [
  "Receipt numbers should stay unique.",
  "Avoid editing paid rows without leaving an audit trail.",
  "Store payment mode and reference number on every transaction.",
  "Run end-of-day reconciliation by mode and total received amount.",
] as const;

export default function CollectionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Collections"
        title="Counter workflow and receipts"
        description="Record installments, receipts, payment modes, and timestamps from a single internal collection workflow."
        actions={<StatusBadge label="Receipt-first flow" tone="good" />}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Collection desk flow"
          description="Use this sequence to keep the cashbook and system totals aligned."
        >
          <ol className="space-y-3 text-sm leading-6 text-slate-700">
            {collectionFlow.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </SectionCard>

        <SectionCard
          title="Accepted payment modes"
          description="Keep mode labels consistent across receipts and reports."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {activeFeeRules.acceptedPaymentModes.map((mode) => (
              <div
                key={mode}
                className="rounded-[22px] border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-sm font-medium text-slate-700"
              >
                {mode}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Receipt controls"
        description="Collections should be easy for staff and difficult to dispute later."
      >
        <ul className="space-y-3 text-sm leading-6 text-slate-700">
          {receiptControls.map((item) => (
            <li key={item} className="rounded-[22px] bg-slate-50 px-4 py-3">
              {item}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

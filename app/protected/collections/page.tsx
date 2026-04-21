import { SectionCard } from "@/components/admin/section-card";

export default function CollectionsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Collections</h1>
        <p className="mt-1 text-sm text-slate-600">
          Record installments, receipts, and payment modes with clear timestamps.
        </p>
      </header>

      <SectionCard
        title="Operational checklist"
        description="Use this sequence to keep daily cashbook and system collections aligned."
      >
        <ol className="space-y-2 text-sm text-slate-700">
          <li>1. Verify student admission number</li>
          <li>2. Select pending installment</li>
          <li>3. Enter paid amount and mode</li>
          <li>4. Save and print or share receipt</li>
        </ol>
      </SectionCard>
    </div>
  );
}

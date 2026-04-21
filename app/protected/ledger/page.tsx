import { PlaceholderPage } from "@/components/admin/placeholder-page";

const metrics = [
  {
    title: "View type",
    value: "Student-wise",
    hint: "Each student should have a clear due and payment trail.",
  },
  {
    title: "Corrections",
    value: "Visible",
    hint: "Adjustments should add history, not remove it.",
  },
  {
    title: "Purpose",
    value: "Verification",
    hint: "Ledger review should help staff trust balances quickly.",
  },
] as const;

const blocks = [
  {
    title: "Planned workflow",
    description: "Ledger views are for verification first, not hidden edits.",
    items: [
      "Show installment dues, payments, and adjustments in one readable timeline.",
      "Keep ledger entries easy to scan during parent or office queries.",
      "Preserve receipt references so staff can reconcile line items later.",
    ],
  },
  {
    title: "Operational notes",
    description: "This placeholder reserves the ledger review surface.",
    items: [
      "The page should support quick checks by student, class, and session.",
      "Append-only financial history remains the rule here as well.",
      "Read-only staff should be able to use this page safely once access is enforced.",
    ],
  },
] as const;

export default function LedgerPage() {
  return (
    <PlaceholderPage
      eyebrow="Ledger"
      title="Student ledger"
      description="Review installment balances, payment history, and future adjustment trails from one straightforward ledger screen."
      statusLabel="Review placeholder"
      statusTone="neutral"
      metrics={metrics}
      blocks={blocks}
      links={[
        { href: "/protected/payments", label: "Payments" },
        { href: "/protected/receipts", label: "Receipts" },
        { href: "/protected/defaulters", label: "Defaulters" },
      ]}
    />
  );
}

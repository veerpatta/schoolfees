import { PlaceholderPage } from "@/components/admin/placeholder-page";
import { activeFeeRules } from "@/lib/config/fee-rules";

const metrics = [
  {
    title: "Accepted modes",
    value: `${activeFeeRules.acceptedPaymentModes.length} modes`,
    hint: activeFeeRules.acceptedPaymentModes.join(", "),
  },
  {
    title: "Entry model",
    value: "Single desk",
    hint: "One office-friendly flow for posting collections.",
  },
  {
    title: "History rule",
    value: "Append-only",
    hint: "Corrections should be separate events, not rewrites.",
  },
] as const;

const blocks = [
  {
    title: "Planned workflow",
    description: "Payments should be fast to post and easy to trace later.",
    items: [
      "Find the student, confirm the dues, then record the amount and mode.",
      "Attach the payment to the right ledger item before generating the receipt.",
      "Use adjustment or reversal flows later instead of editing posted history.",
    ],
  },
  {
    title: "Operational notes",
    description: "This placeholder reserves the collection desk view.",
    items: [
      "Receipt number, payment mode, and staff identity should all stay visible.",
      "End-of-day totals will fit naturally into this page header and cards.",
      "The UI is intentionally kept minimal for counter-speed data entry.",
    ],
  },
] as const;

export default function PaymentsPage() {
  return (
    <PlaceholderPage
      eyebrow="Payments"
      title="Payment entry desk"
      description="Use this section for day-to-day collection posting, with clean inputs and a correction-safe audit trail."
      statusLabel="Workflow placeholder"
      statusTone="good"
      metrics={metrics}
      blocks={blocks}
      links={[
        { href: "/protected/ledger", label: "Ledger" },
        { href: "/protected/receipts", label: "Receipts" },
        { href: "/protected/defaulters", label: "Defaulters" },
      ]}
    />
  );
}

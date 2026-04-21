import { PlaceholderPage } from "@/components/admin/placeholder-page";
import { schoolProfile } from "@/lib/config/school";

const metrics = [
  {
    title: "Receipt prefix",
    value: schoolProfile.receiptPrefix,
    hint: "Stable numbering should remain visible and printable.",
  },
  {
    title: "Reprints",
    value: "Planned",
    hint: "Office staff should be able to retrieve prior receipts quickly.",
  },
  {
    title: "Audit trail",
    value: "Required",
    hint: "Receipt history should remain tied to payment records.",
  },
] as const;

const blocks = [
  {
    title: "Planned workflow",
    description: "Receipts need to be simple to issue and simple to verify.",
    items: [
      "Generate a receipt immediately after posting a payment.",
      "Keep receipt references searchable for reprint and dispute handling.",
      "Avoid any workflow that breaks the link between payment and receipt.",
    ],
  },
  {
    title: "Operational notes",
    description: "This placeholder reserves the receipt management area.",
    items: [
      "Receipt print styling can evolve later without changing the route structure.",
      "Numbering should remain stable across payment, ledger, and report views.",
      "This page is intended for school staff, not external self-service use.",
    ],
  },
] as const;

export default function ReceiptsPage() {
  return (
    <PlaceholderPage
      eyebrow="Receipts"
      title="Receipts and reprints"
      description="Prepare receipt lookup, print, and reprint flows in a dedicated section separate from payment entry."
      statusLabel="Receipt placeholder"
      statusTone="accent"
      metrics={metrics}
      blocks={blocks}
      links={[
        { href: "/protected/payments", label: "Payments" },
        { href: "/protected/ledger", label: "Ledger" },
        { href: "/protected/settings", label: "Settings" },
      ]}
    />
  );
}

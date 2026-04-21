import { PlaceholderPage } from "@/components/admin/placeholder-page";

const metrics = [
  {
    title: "Focus",
    value: "Outstanding dues",
    hint: "Built for practical daily follow-up, not BI dashboards.",
  },
  {
    title: "Primary cuts",
    value: "Class and student",
    hint: "Staff should reach the right list quickly.",
  },
  {
    title: "Actionability",
    value: "High",
    hint: "The page should support follow-up, not just display totals.",
  },
] as const;

const blocks = [
  {
    title: "Planned workflow",
    description: "Defaulter views should be practical for office follow-up.",
    items: [
      "Filter by class, session, and due window before reviewing individual students.",
      "Highlight overdue balances clearly without hiding ledger detail.",
      "Link back to student, ledger, and receipt context when staff need verification.",
    ],
  },
  {
    title: "Operational notes",
    description: "This placeholder reserves the follow-up reporting surface.",
    items: [
      "The page should stay lightweight enough for quick daily use.",
      "Outstanding totals should come from auditable balance views rather than manual notes.",
      "Read-only staff should be able to review this page without gaining write access.",
    ],
  },
] as const;

export default function DefaultersPage() {
  return (
    <PlaceholderPage
      eyebrow="Defaulters"
      title="Outstanding follow-up"
      description="Track overdue balances and class-level follow-up lists from a clean internal reporting page."
      statusLabel="Report placeholder"
      statusTone="warning"
      metrics={metrics}
      blocks={blocks}
      links={[
        { href: "/protected/students", label: "Students" },
        { href: "/protected/ledger", label: "Ledger" },
        { href: "/protected/payments", label: "Payments" },
      ]}
    />
  );
}

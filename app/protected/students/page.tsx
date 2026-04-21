import { PlaceholderPage } from "@/components/admin/placeholder-page";

const metrics = [
  {
    title: "Master record",
    value: "Ready",
    hint: "Admission and identity fields will live here.",
  },
  {
    title: "Status tracking",
    value: "Planned",
    hint: "Active, inactive, left, and graduated states.",
  },
  {
    title: "Import fit",
    value: "Later",
    hint: "Import mapping will plug into the same student model.",
  },
] as const;

const blocks = [
  {
    title: "Planned workflow",
    description: "Keep student records office-friendly and traceable.",
    items: [
      "Search by admission number, student name, or class before adding a duplicate.",
      "Capture core identity, class, guardian, and contact fields first.",
      "Use explicit statuses instead of deleting students with financial history.",
    ],
  },
  {
    title: "Operational notes",
    description: "This page is a shell placeholder for the student master area.",
    items: [
      "Changes should keep created_by and updated_by traceable.",
      "Historical fee and receipt visibility must survive student corrections.",
      "Source tracking should stay compatible with later workbook imports.",
    ],
  },
] as const;

export default function StudentsPage() {
  return (
    <PlaceholderPage
      eyebrow="Students"
      title="Student master"
      description="Create, review, and maintain student records from a single internal screen without losing auditability."
      statusLabel="Placeholder"
      statusTone="warning"
      metrics={metrics}
      blocks={blocks}
      links={[
        { href: "/protected/fee-setup", label: "Go to Fee Setup" },
        { href: "/protected/payments", label: "Go to Payments" },
        { href: "/protected/ledger", label: "Go to Ledger" },
      ]}
    />
  );
}

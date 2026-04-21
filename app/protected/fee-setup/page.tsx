import { PlaceholderPage } from "@/components/admin/placeholder-page";
import { activeFeeRules } from "@/lib/config/fee-rules";
import { formatInr } from "@/lib/helpers/currency";

const metrics = [
  {
    title: "Late fee",
    value: formatInr(activeFeeRules.lateFeeFlatRupees),
    hint: "Current school default is flat, not per-day.",
  },
  {
    title: "Installments",
    value: `${activeFeeRules.defaultInstallmentCount} parts`,
    hint: activeFeeRules.installmentDueDates.join(", "),
  },
  {
    title: "Class 12 Science",
    value: formatInr(activeFeeRules.class12ScienceAnnualFeeRupees),
    hint: "Starter annual fee default from current policy.",
  },
] as const;

const blocks = [
  {
    title: "Planned workflow",
    description: "Fee setup should be explicit before collections begin.",
    items: [
      "Define class-wise annual amounts and installment structure first.",
      "Keep concessions and overrides visible instead of burying them in notes.",
      "Separate policy changes from payment entry so history stays clear.",
    ],
  },
  {
    title: "Operational notes",
    description: "This placeholder reserves the main fee configuration surface.",
    items: [
      "Current due dates remain 20 April, 20 July, 20 October, and 20 January.",
      "Changes to fee policy should update config, settings, and docs together.",
      "Generated ledgers should follow these defaults rather than workbook habits.",
    ],
  },
] as const;

export default function FeeSetupPage() {
  return (
    <PlaceholderPage
      eyebrow="Fee Setup"
      title="Fee policy and class defaults"
      description="Set annual fee plans, installment timing, and fee defaults from one controlled admin area."
      statusLabel="Policy placeholder"
      statusTone="accent"
      metrics={metrics}
      blocks={blocks}
      links={[
        { href: "/protected/students", label: "Students" },
        { href: "/protected/payments", label: "Payments" },
        { href: "/protected/settings", label: "Settings" },
      ]}
    />
  );
}

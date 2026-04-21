import Link from "next/link";

import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { activeFeeRules } from "@/lib/config/fee-rules";
import { formatInr } from "@/lib/helpers/currency";
import { createClient } from "@/lib/supabase/server";

const workstreams = [
  {
    href: "/protected/students",
    title: "Student master",
    description:
      "Admission numbers, class-section mapping, session status, and source tracking for imported records.",
  },
  {
    href: "/protected/imports",
    title: "Workbook import",
    description:
      "Batch spreadsheet migration in a controlled sequence with verify-and-freeze checkpoints.",
  },
  {
    href: "/protected/fee-structure",
    title: "Fee configuration",
    description:
      "Define class-wise annual fee plans, installment due dates, and ledger defaults before collection starts.",
  },
  {
    href: "/protected/collections",
    title: "Collection desk",
    description:
      "Capture payment mode, receipt reference, amount received, and timestamps from one internal workflow.",
  },
] as const;

const rolloutChecklist = [
  "Import the active student master first, one class at a time.",
  "Confirm fee structures before generating annual ledgers.",
  "Use receipt references and payment modes on every collection.",
  "Run daily reconciliation while workbook and app operate in parallel.",
] as const;

const controlPoints = [
  "Avoid deleting collection rows; prefer corrections with traceable audit notes.",
  "Keep staff access limited to invited internal users only.",
  "Treat workbook import batches as checkpoints, not one-time blind uploads.",
  "Update fee-rule config, settings UI, and README together whenever policy changes.",
] as const;

export default async function ProtectedPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const staffName = data?.claims?.email ?? "Authorized staff";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations Overview"
        title="Daily control panel for fee operations."
        description={`Welcome, ${staffName}. Use this dashboard to keep workbook migration controlled while fee plans, collections, and reports move into the app.`}
        actions={<StatusBadge label="Workbook migration mode" tone="warning" />}
      />

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard
          title="Late fee default"
          value={formatInr(activeFeeRules.lateFeeFlatRupees)}
          hint="Applied as a flat penalty in current school policy."
        />
        <MetricCard
          title="Installments"
          value={`${activeFeeRules.defaultInstallmentCount} windows`}
          hint={activeFeeRules.installmentDueDates.join(", ")}
        />
        <MetricCard
          title="Class 12 Science"
          value={formatInr(activeFeeRules.class12ScienceAnnualFeeRupees)}
          hint="Starter annual fee default for fee settings."
        />
        <MetricCard
          title="Access model"
          value="Internal only"
          hint="Use invited staff accounts, not public signups."
        />
      </section>

      <SectionCard
        title="Core workstreams"
        description="These modules are the backbone of the production scaffold."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {workstreams.map((workstream) => (
            <Link
              key={workstream.href}
              href={workstream.href}
              className="rounded-[24px] border border-slate-200/80 bg-slate-50/90 p-5 transition hover:border-slate-300 hover:bg-white"
            >
              <p className="text-base font-semibold text-slate-950">
                {workstream.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {workstream.description}
              </p>
            </Link>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Start here this week"
          description="Recommended sequence for the first live rollout."
        >
          <ol className="space-y-3 text-sm leading-6 text-slate-700">
            {rolloutChecklist.map((item, index) => (
              <li key={item} className="flex gap-3">
                <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </SectionCard>

        <SectionCard
          title="Control points"
          description="These guardrails keep the app auditable as usage grows."
        >
          <ul className="space-y-3 text-sm leading-6 text-slate-700">
            {controlPoints.map((item) => (
              <li key={item} className="rounded-2xl bg-slate-50 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900">
        Internal app notice: This system is for school admin staff only. Do not
        share credentials externally.
      </div>
    </div>
  );
}

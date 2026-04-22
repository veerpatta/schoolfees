import Link from "next/link";

import { MetricCard } from "@/components/admin/metric-card";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { schoolProfile } from "@/lib/config/school";
import { getFeePolicySummary } from "@/lib/fees/data";
import { hasRequiredEnvVars } from "@/lib/env";
import { formatInr } from "@/lib/helpers/currency";

const moduleCards = [
  {
    href: "/protected/students",
    title: "Student master",
    description:
      "Maintain admission numbers, class mapping, session status, and source tracking for migrated records.",
  },
  {
    href: "/protected/imports",
    title: "Workbook imports",
    description:
      "Bring spreadsheet data into controlled batches so verification happens class by class instead of all at once.",
  },
  {
    href: "/protected/collections",
    title: "Collection desk",
    description:
      "Record payments, receipt references, modes, and timestamps from a single internal counter workflow.",
  },
  {
    href: "/protected/reports",
    title: "Audit and reports",
    description:
      "Prepare outstanding, ledger, and day-book style outputs that can be checked against workbook totals.",
  },
] as const;

const rolloutSteps = [
  "Create the Supabase project and run the starter SQL schema.",
  "Invite or create the first admin staff account, then disable open signups.",
  "Prepare student master CSV batches from the workbook.",
  "Seed class-wise fee structures before generating ledgers.",
  "Start collections in the app and reconcile totals daily during migration.",
] as const;

export default async function Home() {
  const policy = await getFeePolicySummary({ useAdmin: true });

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(127,29,29,0.12),_transparent_28%),linear-gradient(180deg,_#f8f4ea_0%,_#f6f6f5_45%,_#eef2f7_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-6 md:px-6 md:py-8">
        <header className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[34px] border border-slate-200/80 bg-white/88 p-6 shadow-2xl shadow-slate-200/50 backdrop-blur md:p-8">
            <StatusBadge label="Internal Admin Application" tone="accent" />
            <h1 className="mt-4 max-w-4xl text-3xl font-semibold leading-tight tracking-tight text-slate-950 md:text-5xl">
              Fee management for {schoolProfile.name}, built for staff who are
              replacing spreadsheet work without losing audit control.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 md:text-lg">
              This app is for office and accounts staff only. It supports
              student master maintenance, fee structures, ledger generation,
              collections, reporting, and gradual workbook migration. It is not
              a parent portal.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/auth/login">Staff sign in</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/protected">Open dashboard</Link>
              </Button>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <MetricCard
                title="Late fee"
                value={formatInr(policy.lateFeeFlatAmount)}
                hint="Flat default across collection and ledger workflows."
              />
              <MetricCard
                title="Installments"
                value={`${policy.installmentCount} windows`}
                hint={policy.installmentSchedule.map((item) => item.dueDateLabel).join(", ")}
              />
              <MetricCard
                title="Access model"
                value="Internal only"
                hint="Invited staff accounts, not parent-facing access."
              />
            </div>
          </div>

          <div className="space-y-5">
            <SectionCard
              title="Operational posture"
              description="The product intent stays narrow so staff can adopt it safely."
            >
              <ul className="space-y-3 text-sm leading-6 text-slate-700">
                <li>- Keep workflows simple enough for office and accounts teams.</li>
                <li>- Replace workbook processes gradually, not in one risky cutover.</li>
                <li>- Preserve audit-safe timestamps, receipts, and change history.</li>
              </ul>
            </SectionCard>

            <SectionCard
              title="Environment readiness"
              description="The app can load immediately, but login requires Supabase values."
              actions={
                <StatusBadge
                  label={hasRequiredEnvVars ? "Env configured" : "Env required"}
                  tone={hasRequiredEnvVars ? "good" : "warning"}
                />
              }
            >
              <p className="text-sm leading-6 text-slate-700">
                Required values: <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>. Add them in{" "}
                <code>.env.local</code> for local work and again in Vercel for
                deployment.
              </p>
            </SectionCard>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <SectionCard
            title="What ships in this scaffold"
            description="The core internal work areas are already separated into clear modules."
          >
            <div className="grid gap-3 md:grid-cols-2">
              {moduleCards.map((module) => (
                <Link
                  key={module.href}
                  href={module.href}
                  className="rounded-[24px] border border-slate-200/80 bg-slate-50/90 p-5 transition hover:border-slate-300 hover:bg-white"
                >
                  <p className="text-base font-semibold text-slate-950">
                    {module.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {module.description}
                  </p>
                </Link>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Suggested rollout path"
            description="Use a controlled rollout so workbook and app totals can be reconciled."
          >
            <ol className="space-y-3 text-sm leading-6 text-slate-700">
              {rolloutSteps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </SectionCard>
        </section>

        <div className="mt-auto rounded-[28px] border border-amber-200 bg-amber-50/95 px-5 py-4 text-sm leading-6 text-amber-900 shadow-sm">
          Current school policy is loaded from the canonical config service for session {policy.academicSessionLabel}: late fee {policy.lateFeeLabel.toLowerCase()}, due dates {policy.installmentSchedule.map((item) => item.dueDateLabel).join(" / ")}, and receipt prefix {policy.receiptPrefix}.
        </div>
      </div>
    </main>
  );
}

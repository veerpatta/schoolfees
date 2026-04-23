import Link from "next/link";
import {
  ArrowRight,
  BadgeIndianRupee,
  BookText,
  ReceiptText,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { MetricCard } from "@/components/admin/metric-card";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { SchoolBrand } from "@/components/branding/school-brand";
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
    icon: UsersRound,
  },
  {
    href: "/protected/imports",
    title: "Workbook imports",
    description:
      "Bring spreadsheet data into controlled batches so verification happens class by class instead of all at once.",
    icon: BookText,
  },
  {
    href: "/protected/collections",
    title: "Collection desk",
    description:
      "Record payments, receipt references, modes, and timestamps from a single internal counter workflow.",
    icon: BadgeIndianRupee,
  },
  {
    href: "/protected/reports",
    title: "Audit and reports",
    description:
      "Prepare outstanding, ledger, and day-book style outputs that can be checked against workbook totals.",
    icon: ReceiptText,
  },
] as const;

const rolloutSteps = [
  "Create the Supabase project and run the starter SQL schema.",
  "Invite or create the first admin staff account, then disable open signups.",
  "Prepare student master CSV batches from the workbook.",
  "Seed class-wise fee structures before generating ledgers.",
  "Start collections in the app and reconcile totals daily during migration.",
] as const;

const valueProps = [
  {
    title: "Internal by design",
    description:
      "Built for office and accounts staff, with no public or parent-facing access paths.",
    icon: ShieldCheck,
  },
  {
    title: "Workbook-friendly operations",
    description:
      "Keeps staff on familiar fee, dues, and receipt workflows while gradually replacing spreadsheets.",
    icon: BookText,
  },
  {
    title: "Fast collection desk UX",
    description:
      "Modern blue-and-white shell with clear navigation, quick scanning, and smooth interactions.",
    icon: BadgeIndianRupee,
  },
] as const;

export default async function Home() {
  const policy = await getFeePolicySummary({ useAdmin: true });

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.16),transparent_24%),linear-gradient(180deg,#f8fbff_0%,#eef5ff_42%,#f8fbff_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
        <header className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="relative overflow-hidden rounded-[38px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(239,246,255,0.92))] p-6 shadow-[0_40px_100px_-50px_rgba(37,99,235,0.38)] md:p-8">
            <div className="brand-grid absolute inset-0 opacity-30" />
            <div className="animate-float-slow absolute -right-8 top-10 size-40 rounded-full bg-sky-200/35 blur-3xl" />
            <div className="animate-float-delayed absolute bottom-0 left-8 size-48 rounded-full bg-blue-200/25 blur-3xl" />

            <div className="relative">
              <StatusBadge label="Internal Admin Application" tone="accent" />
              <SchoolBrand variant="hero" priority className="mt-8" />

              <h1 className="mt-8 max-w-4xl font-heading text-4xl font-semibold leading-tight tracking-tight text-slate-950 md:text-6xl">
                Modern school fee operations for staff who need speed, clarity,
                and audit control.
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 md:text-lg">
                {schoolProfile.name} uses this internal workspace for student
                master maintenance, fee setup, ledger recalculation, payment
                entry, receipts, and workbook migration. It is not a parent
                portal.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/auth/login">
                    Staff sign in
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/protected">Open workspace</Link>
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
                  hint={policy.installmentSchedule
                    .map((item) => item.dueDateLabel)
                    .join(", ")}
                />
                <MetricCard
                  title="Access model"
                  value="Internal only"
                  hint="Invited staff accounts, not parent-facing access."
                />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <SectionCard
              title="Operational posture"
              description="The product stays narrow on purpose so staff can adopt it safely and quickly."
            >
              <div className="grid gap-3">
                {valueProps.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.title}
                      className="rounded-[24px] border border-sky-100/80 bg-white/82 p-4 shadow-[0_18px_44px_-28px_rgba(15,23,42,0.22)]"
                    >
                      <div className="inline-flex rounded-2xl bg-sky-50 p-2 text-sky-700">
                        <Icon className="size-4" />
                      </div>
                      <p className="mt-4 font-heading text-base font-semibold text-slate-950">
                        {item.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {item.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard
              title="Environment readiness"
              description="The public shell can load now, but staff sign-in requires the Supabase values."
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

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <SectionCard
            title="What ships in this workspace"
            description="The core internal work areas are separated into clear modules with workbook-friendly navigation."
          >
            <div className="grid gap-3 md:grid-cols-2">
              {moduleCards.map((module) => {
                const Icon = module.icon;

                return (
                  <Link
                    key={module.href}
                    href={module.href}
                    className="group rounded-[26px] border border-white/80 bg-white/82 p-5 shadow-[0_18px_44px_-28px_rgba(15,23,42,0.22)] transition duration-200 hover:-translate-y-0.5 hover:border-sky-100 hover:bg-sky-50/70"
                  >
                    <div className="inline-flex rounded-2xl bg-sky-50 p-2 text-sky-700 transition group-hover:bg-white">
                      <Icon className="size-4" />
                    </div>
                    <p className="mt-4 font-heading text-base font-semibold text-slate-950">
                      {module.title}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {module.description}
                    </p>
                  </Link>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            title="Suggested rollout path"
            description="Use a controlled rollout so workbook and app totals can be reconciled without cutting over blindly."
          >
            <ol className="space-y-3 text-sm leading-6 text-slate-700">
              {rolloutSteps.map((step, index) => (
                <li
                  key={step}
                  className="flex gap-3 rounded-[22px] border border-white/80 bg-white/78 px-4 py-3 shadow-[0_16px_36px_-26px_rgba(15,23,42,0.2)]"
                >
                  <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#1d4ed8_0%,#0ea5e9_100%)] text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </SectionCard>
        </section>

        <div className="mt-auto rounded-[30px] border border-sky-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(239,246,255,0.9))] px-5 py-4 text-sm leading-6 text-slate-700 shadow-[0_24px_60px_-40px_rgba(37,99,235,0.28)]">
          Current school policy is loaded from the canonical config service for
          session {policy.academicSessionLabel}: late fee{" "}
          {policy.lateFeeLabel.toLowerCase()}, due dates{" "}
          {policy.installmentSchedule
            .map((item) => item.dueDateLabel)
            .join(" / ")}, and receipt prefix {policy.receiptPrefix}.
        </div>
      </div>
    </main>
  );
}

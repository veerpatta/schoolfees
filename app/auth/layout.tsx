import Link from "next/link";
import {
  ArrowUpRight,
  BadgeIndianRupee,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";

import { StatusBadge } from "@/components/admin/status-badge";
import { SchoolBrand } from "@/components/branding/school-brand";
import { Button } from "@/components/ui/button";
import { schoolProfile } from "@/lib/config/school";
import { getFeePolicySummary } from "@/lib/fees/data";
import { formatInr } from "@/lib/helpers/currency";

const authNotes = [
  {
    title: "Internal access only",
    description:
      "Invited staff accounts are used for office and accounts workflows. Public signup remains disabled.",
    icon: ShieldCheck,
  },
  {
    title: "Fast daily desk work",
    description:
      "Open fee setup, payment posting, due follow-up, and receipt reprints from one consistent workspace.",
    icon: BadgeIndianRupee,
  },
  {
    title: "Audit-safe finance history",
    description:
      "Receipts and payments stay traceable so corrections remain explicit instead of silent rewrites.",
    icon: ReceiptText,
  },
] as const;

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const policy = await getFeePolicySummary({ useAdmin: true });

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.16),transparent_24%),linear-gradient(180deg,#f7fbff_0%,#eef5ff_46%,#f8fbff_100%)]">
      <div className="mx-auto grid min-h-screen max-w-7xl items-center gap-6 px-4 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-6 lg:py-8">
        <section className="relative overflow-hidden rounded-[38px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(239,246,255,0.92))] p-6 shadow-[0_40px_100px_-48px_rgba(37,99,235,0.45)] md:p-8">
          <div className="animate-float-slow absolute -right-10 top-10 size-40 rounded-full bg-sky-200/35 blur-3xl" />
          <div className="animate-float-delayed absolute bottom-0 left-10 size-48 rounded-full bg-blue-200/30 blur-3xl" />
          <div className="brand-grid absolute inset-0 opacity-35" />

          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusBadge label="Staff Sign In" tone="accent" />
              <Button asChild size="sm" variant="outline">
                <Link href="/">
                  Back to overview
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            </div>

            <SchoolBrand variant="hero" priority className="mt-8" />

            <h1 className="mt-8 max-w-3xl font-heading text-4xl font-semibold leading-tight tracking-tight text-slate-950 md:text-5xl">
              Blue-white school admin access designed for fast office work, not
              generic demo screens.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 md:text-lg">
              Open the internal fee admin workspace for staff collections, dues
              follow-up, workbook migration, and correction-safe finance
              workflows at {schoolProfile.name}.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="glass-panel rounded-[26px] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700/80">
                  Live Session
                </p>
                <p className="mt-2 font-heading text-xl font-semibold text-slate-950">
                  {policy.academicSessionLabel}
                </p>
              </div>
              <div className="glass-panel rounded-[26px] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700/80">
                  Late Fee
                </p>
                <p className="mt-2 font-heading text-xl font-semibold text-slate-950">
                  {formatInr(policy.lateFeeFlatAmount)}
                </p>
              </div>
              <div className="glass-panel rounded-[26px] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700/80">
                  Receipt Prefix
                </p>
                <p className="mt-2 font-heading text-xl font-semibold text-slate-950">
                  {policy.receiptPrefix}
                </p>
              </div>
            </div>

            <div className="mt-8 rounded-[28px] border border-sky-100/90 bg-white/82 p-5 shadow-[0_24px_60px_-38px_rgba(37,99,235,0.35)] backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700/80">
                Current Collection Rules
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Installment due dates:{" "}
                {policy.installmentSchedule
                  .map((item) => item.dueDateLabel)
                  .join(", ")}
              </p>
              <p className="mt-1.5 text-sm leading-6 text-slate-700">
                Accepted payment modes: {policy.acceptedPaymentModes.join(", ")}
              </p>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {authNotes.map((note) => {
                const Icon = note.icon;

                return (
                  <div
                    key={note.title}
                    className="glass-panel rounded-[26px] p-4"
                  >
                    <div className="inline-flex rounded-2xl bg-sky-50 p-2 text-sky-700">
                      <Icon className="size-4" />
                    </div>
                    <h2 className="mt-4 font-heading text-base font-semibold text-slate-950">
                      {note.title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {note.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="relative flex items-center justify-center overflow-hidden rounded-[38px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(241,245,255,0.92))] p-6 shadow-[0_40px_100px_-54px_rgba(15,23,42,0.35)]">
          <div className="absolute inset-0 brand-grid opacity-40" />
          <div className="absolute -left-10 top-14 size-40 rounded-full bg-sky-200/30 blur-3xl" />
          <div className="absolute -right-8 bottom-10 size-44 rounded-full bg-blue-200/30 blur-3xl" />
          <div className="relative z-10 flex w-full items-center justify-center">
            <div className="animate-reveal-up w-full max-w-md">{children}</div>
          </div>
        </section>
      </div>
    </div>
  );
}

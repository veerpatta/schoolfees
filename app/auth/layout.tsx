import Link from "next/link";

import { StatusBadge } from "@/components/admin/status-badge";
import { schoolProfile } from "@/lib/config/school";
import { getFeePolicySummary } from "@/lib/fees/data";
import { formatInr } from "@/lib/helpers/currency";

const authNotes = [
  "Use invited staff access for school office and accounts workflows.",
  "Keep the app internal-admin only and avoid public or parent-facing accounts.",
  "Preserve auditability by pairing staff identity with every meaningful action.",
] as const;

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const policy = await getFeePolicySummary({ useAdmin: true });

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f5ee_0%,#f1f5f9_100%)]">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-6 px-4 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusBadge label="Staff Sign In" tone="accent" />
            <Link
              href="/"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-950"
            >
              Back to overview
            </Link>
          </div>

          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            {schoolProfile.shortName}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            Internal fee office access for school staff.
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            Sign in with the staff account used for fee setup, payment entry,
            receipts, and follow-up reporting. This app is for internal office
            use only.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Late fee
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {formatInr(policy.lateFeeFlatAmount)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Installment due dates
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {policy.installmentSchedule.map((item) => item.dueDateLabel).join(", ")}
              </p>
            </div>
          </div>

          <div className="mt-8 space-y-3">
            {authNotes.map((note) => (
              <div
                key={note}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700"
              >
                {note}
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center">{children}</section>
      </div>
    </div>
  );
}

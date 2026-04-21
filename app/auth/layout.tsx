import Link from "next/link";

import { StatusBadge } from "@/components/admin/status-badge";
import { activeFeeRules } from "@/lib/config/fee-rules";
import { productPrinciples, schoolProfile } from "@/lib/config/school";
import { formatInr } from "@/lib/helpers/currency";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(127,29,29,0.12),_transparent_28%),linear-gradient(180deg,_#f8f4ea_0%,_#f6f6f5_50%,_#eef2f7_100%)]">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-6 px-4 py-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-6">
        <section className="rounded-[34px] border border-slate-200/80 bg-white/88 p-6 shadow-2xl shadow-slate-200/50 backdrop-blur md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusBadge label="Internal Staff Access" tone="accent" />
            <Link
              href="/"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-950"
            >
              Back to overview
            </Link>
          </div>

          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            {schoolProfile.shortName}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            Sign in to the school fee operations workspace.
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            Use invited staff accounts for office and accounts workflows. Keep
            access restricted, keep fee records auditable, and replace workbook
            steps class by class instead of all at once.
          </p>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {productPrinciples.map((principle) => (
              <div
                key={principle}
                className="rounded-[24px] border border-slate-200/80 bg-slate-50/90 p-4"
              >
                <p className="text-sm leading-6 text-slate-700">{principle}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <div className="rounded-[24px] border border-slate-200/80 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Late fee
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {formatInr(activeFeeRules.lateFeeFlatRupees)}
              </p>
            </div>
            <div className="rounded-[24px] border border-slate-200/80 bg-white p-4 md:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Installment due dates
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {activeFeeRules.installmentDueDates.join(", ")}
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-[28px] border border-amber-200 bg-amber-50/95 px-5 py-4 text-sm leading-6 text-amber-900">
            Preferred production setup: create or invite staff users in
            Supabase Auth, then disable open signups. Keep this app internal.
          </div>
        </section>

        <section className="flex items-center justify-center">{children}</section>
      </div>
    </div>
  );
}

import Link from "next/link";
import {
  ArrowLeft,
  BadgeIndianRupee,
  CalendarDays,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";

import { SchoolBrand } from "@/components/branding/school-brand";
import { Button } from "@/components/ui/button";
import { schoolProfile } from "@/lib/config/school";
import { getFeePolicySummary } from "@/lib/fees/data";
import { formatInr } from "@/lib/helpers/currency";

const deskNotes = [
  {
    title: "Staff-only access",
    description: "Admin, accounts, and read-only staff roles stay separated.",
    icon: ShieldCheck,
  },
  {
    title: "Payment desk",
    description: "Post collections, check dues, and reprint receipts quickly.",
    icon: BadgeIndianRupee,
  },
  {
    title: "Receipt trail",
    description: "Payments and receipts remain traceable after posting.",
    icon: ReceiptText,
  },
] as const;

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const policy = await getFeePolicySummary({ useAdmin: true });
  const paymentModeLabels = policy.acceptedPaymentModes
    .map((mode) => mode.label)
    .join(", ");

  return (
    <div className="min-h-screen bg-[#f6f9fc] text-slate-950">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-8 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center lg:py-8">
        <section className="order-2 flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.35)] sm:p-7 lg:order-1 lg:min-h-[42rem] lg:p-8">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-5">
              <SchoolBrand variant="compact" priority />
              <Button asChild size="sm" variant="ghost">
                <Link href="/">
                  <ArrowLeft className="size-4" />
                  Back to overview
                </Link>
              </Button>
            </div>

            <p className="mt-10 text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">
              Staff fee office
            </p>
            <h1 className="mt-4 max-w-3xl font-heading text-4xl font-semibold leading-tight text-slate-950 md:text-5xl">
              Sign in to manage VPPS fees with a clear daily workspace.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
              {schoolProfile.name} uses this internal app for fee setup,
              collections, dues follow-up, receipts, and staff-only account
              access.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  Session
                </p>
                <p className="mt-2 font-heading text-2xl font-semibold text-slate-950">
                  {policy.academicSessionLabel}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  Late Fee
                </p>
                <p className="mt-2 font-heading text-2xl font-semibold text-slate-950">
                  {formatInr(policy.lateFeeFlatAmount)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  Receipts
                </p>
                <p className="mt-2 font-heading text-2xl font-semibold text-slate-950">
                  {policy.receiptPrefix}
                </p>
              </div>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {deskNotes.map((note) => {
                const Icon = note.icon;

                return (
                  <div
                    key={note.title}
                    className="rounded-lg border border-slate-200 bg-white p-4"
                  >
                    <div className="inline-flex rounded-md bg-sky-50 p-2 text-sky-700">
                      <Icon className="size-4" />
                    </div>
                    <h2 className="mt-4 text-sm font-semibold text-slate-950">
                      {note.title}
                    </h2>
                    <p className="mt-2 text-sm leading-5 text-slate-600">
                      {note.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            <div className="flex items-start gap-3">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-sky-700" />
              <p>
                Due dates:{" "}
                {policy.installmentSchedule
                  .map((item) => item.dueDateLabel)
                  .join(", ")}
                . Payment modes: {paymentModeLabels}.
              </p>
            </div>
          </div>
        </section>

        <section className="order-1 flex items-center justify-center lg:order-2">
          <div className="w-full">
            <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:hidden">
              <SchoolBrand variant="compact" priority />
            </div>
            <div className="animate-reveal-up w-full">{children}</div>
          </div>
        </section>
      </div>
    </div>
  );
}

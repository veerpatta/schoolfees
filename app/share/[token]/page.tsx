import { notFound } from "next/navigation";

import { formatInr } from "@/lib/helpers/currency";
import { formatMediumDate, formatShortDate } from "@/lib/helpers/date";
import {
  getParentShareView,
  recordShareLinkView,
  validateShareLinkToken,
} from "@/lib/share-links/data";

type Props = {
  params: Promise<{ token: string }>;
};

export const dynamic = "force-dynamic";

const STATUS_PILL_CLASS: Record<
  "paid" | "partial" | "overdue" | "pending" | "waived",
  { wrap: string; text: string; label: string }
> = {
  paid: {
    wrap: "border-green-300 bg-green-50 text-green-900",
    text: "text-green-900",
    label: "Paid",
  },
  waived: {
    wrap: "border-blue-300 bg-blue-50 text-blue-900",
    text: "text-blue-900",
    label: "Waived",
  },
  partial: {
    wrap: "border-amber-300 bg-amber-50 text-amber-900",
    text: "text-amber-900",
    label: "Partly paid",
  },
  overdue: {
    wrap: "border-red-300 bg-red-50 text-red-900",
    text: "text-red-900",
    label: "Overdue",
  },
  pending: {
    wrap: "border-slate-300 bg-slate-50 text-slate-700",
    text: "text-slate-700",
    label: "Upcoming",
  },
};

const PAYMENT_MODE_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  discount: "Closed as discount (no cash)",
};

export default async function ParentSharePage({ params }: Props) {
  const { token } = await params;
  const validation = await validateShareLinkToken(token);

  if (!validation.ok) {
    if (validation.reason === "not_found") {
      notFound();
    }
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12 text-center">
        <h1 className="text-xl font-semibold text-foreground">
          {validation.reason === "expired" ? "Link expired" : "Link revoked"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please ask the school office for a fresh link.
        </p>
      </main>
    );
  }

  const view = await getParentShareView(validation.studentId);
  await recordShareLinkView(validation.link.id);

  const fees = view.financial;
  const hasDiscount = fees.discountAmount > 0;
  const lateFeePending = Math.max(fees.lateFeeTotal - fees.lateFeeWaived, 0);
  const hasLateFee = fees.lateFeeTotal > 0;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:py-12">
      {/* Identity header */}
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Shri Veer Patta Senior Secondary School
        </p>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {view.student.fullName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {view.student.classLabel} · SR {view.student.admissionNo}
          {view.sessionLabel ? ` · Session ${view.sessionLabel}` : ""}
        </p>
      </header>

      {/* Money summary — explicit lines: total due / paid / outstanding */}
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Fees summary
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Total due (year)</dt>
            <dd className="text-xl font-semibold tabular-nums">{formatInr(fees.totalDue)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Total paid</dt>
            <dd className="text-xl font-semibold tabular-nums text-green-700">
              {formatInr(fees.totalPaid)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Outstanding</dt>
            <dd
              className={`text-xl font-semibold tabular-nums ${
                fees.outstandingAmount > 0 ? "text-destructive" : "text-success"
              }`}
            >
              {formatInr(fees.outstandingAmount)}
            </dd>
          </div>
        </dl>

        {(hasDiscount || hasLateFee) && (
          <div className="mt-4 grid gap-2 rounded-lg border border-dashed border-border bg-surface-2/40 p-3 text-xs sm:grid-cols-2">
            {hasDiscount ? (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Discount applied
                </p>
                <p className="mt-0.5 text-sm font-semibold text-green-700 tabular-nums">
                  −{formatInr(fees.discountAmount)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Reduces what you owe for the year.
                </p>
              </div>
            ) : null}
            {hasLateFee ? (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Late fee
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">
                  Charged {formatInr(fees.lateFeeTotal)}
                  {fees.lateFeeWaived > 0
                    ? ` · waived ${formatInr(fees.lateFeeWaived)}`
                    : ""}
                </p>
                {lateFeePending > 0 ? (
                  <p className="mt-0.5 text-[11px] text-destructive">
                    {formatInr(lateFeePending)} still owed
                  </p>
                ) : (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    No late fee pending.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}

        {fees.nextDueLabel ? (
          <div className="mt-4 rounded-lg bg-warning-soft/60 px-3 py-2 text-sm text-warning-soft-foreground">
            <p className="font-medium">
              Next instalment: {fees.nextDueLabel}
              {fees.nextDueAmount ? ` — ${formatInr(fees.nextDueAmount)}` : ""}
            </p>
            {fees.nextDueDate ? (
              <p className="text-xs">Due {formatMediumDate(fees.nextDueDate)}</p>
            ) : null}
          </div>
        ) : fees.outstandingAmount === 0 ? (
          <div className="mt-4 rounded-lg bg-success-soft/60 px-3 py-2 text-sm font-medium text-success-soft-foreground">
            ✓ All fees settled for the year. Thank you.
          </div>
        ) : null}
      </section>

      {/* Per-installment status — parent sees exactly what is paid and what's pending */}
      {view.installments && view.installments.length > 0 ? (
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Instalments
          </h2>
          <ul className="mt-3 space-y-2">
            {view.installments.map((inst) => {
              const meta = STATUS_PILL_CLASS[inst.balanceStatus] ?? STATUS_PILL_CLASS.pending;
              return (
                <li
                  key={inst.installmentId}
                  className={`rounded-lg border px-3 py-2 ${meta.wrap}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        Instalment {inst.installmentNo}
                        <span className="ml-1 font-normal opacity-70">
                          · {inst.installmentLabel}
                        </span>
                      </p>
                      <p className="text-[11px] opacity-70">
                        Due {formatShortDate(inst.dueDate)}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full bg-white/60 px-2 py-0.5 text-[11px] font-medium">
                      {meta.label}
                    </span>
                  </div>
                  <dl className="mt-1.5 grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <dt className="opacity-70">Charge</dt>
                      <dd className="font-mono font-semibold tabular-nums">
                        {formatInr(inst.baseCharge + inst.finalLateFee)}
                      </dd>
                    </div>
                    <div>
                      <dt className="opacity-70">Paid</dt>
                      <dd className="font-mono font-semibold tabular-nums">
                        {formatInr(inst.paidAmount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="opacity-70">Pending</dt>
                      <dd className="font-mono font-semibold tabular-nums">
                        {formatInr(inst.pendingAmount)}
                      </dd>
                    </div>
                  </dl>
                  {inst.finalLateFee > 0 ? (
                    <p className="mt-1 text-[11px] opacity-80">
                      Includes late fee of {formatInr(inst.finalLateFee)}.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Receipt history */}
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Receipts
        </h2>
        {view.student.receipts.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No receipts yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {view.student.receipts.map((receipt) => {
              const modeLabel =
                PAYMENT_MODE_LABEL[receipt.paymentMode] ?? receipt.paymentMode;
              const isDiscountCloseout = receipt.paymentMode === "discount";
              return (
                <li
                  key={receipt.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {receipt.receiptNumber}
                      {isDiscountCloseout ? (
                        <span className="ml-2 inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-800">
                          non-cash
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatMediumDate(receipt.paymentDate)} · {modeLabel}
                    </p>
                  </div>
                  <p className="font-mono text-sm font-semibold tabular-nums">
                    {formatInr(receipt.totalAmount)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-center text-xs text-muted-foreground">
        Read-only view shared by the school office. Contact the office for any
        corrections or to make a payment.
      </p>
    </main>
  );
}

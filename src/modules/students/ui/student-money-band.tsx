import { WaiveLateFeeTrigger } from "@/modules/payments/ui/waive-late-fee-trigger";
import type { WaivableInstallment } from "@/modules/payments/ui/waive-late-fee-sheet";
import { TrustBadge } from "@/ui/trust/trust-badge";
import { KpiCard } from "@/ui/primitives/kpi-card";
import { Money } from "@/ui/primitives/money";
import { formatInr } from "@/platform/helpers/currency";
import { formatMediumDate } from "@/platform/helpers/date";
import { cn } from "@/platform/utils";

type Ribbon = {
  tone: "success" | "info" | "danger" | "warning" | "neutral";
  title: string;
  detail: string;
};

const ribbonTone: Record<Ribbon["tone"], string> = {
  success: "bg-success-soft text-success-soft-foreground",
  info: "bg-info-soft text-info-soft-foreground",
  danger: "bg-destructive-soft text-destructive-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  neutral: "bg-surface-2 text-foreground",
};

/**
 * Where this student stands, in four figures and one sentence.
 *
 * Replaces `StudentFinanceGlance` and `StudentStatCards`, which between them
 * put roughly forty money figures above the tabs — `outstandingAmount` alone
 * appeared under eight different labels. Each figure here has exactly one home
 * on the page; everything else moved into the tab it belongs to.
 *
 * The ribbon states are mutually exclusive and ordered by what the office needs
 * to act on first. Only one ever renders.
 */
export function StudentMoneyBand({
  outstandingAmount,
  overdueAmount,
  pendingLateFeeAmount,
  creditBalance,
  paidThisSession,
  discountClosedAmount,
  sessionFeeTotal,
  installmentsPaid,
  installmentsTotal,
  installmentsPending,
  receiptCount,
  nextDue,
  lastReceipt,
  emiPlan,
  waive,
  encodedReturnTo,
}: {
  outstandingAmount: number;
  overdueAmount: number;
  pendingLateFeeAmount: number;
  creditBalance: number;
  /** Cash collected this session, net of adjustments. */
  paidThisSession: number;
  discountClosedAmount: number;
  /** What the ledger charged this session. Not the policy resolver's answer. */
  sessionFeeTotal: number;
  installmentsPaid: number;
  installmentsTotal: number;
  installmentsPending: number;
  /** Receipts on file, for the Paid strip's hint. */
  receiptCount: number;
  nextDue: { label: string; amount: number; dueDate: string } | null;
  lastReceipt: {
    id: string;
    receiptNumber: string;
    totalAmount: number;
    paymentDate: string;
  } | null;
  emiPlan: { monthlyAmount: number; statusLabel: string; reviewNeeded: boolean } | null;
  waive?: {
    canWaive: boolean;
    studentId: string;
    studentLabel: string;
    studentAdmissionNo: string;
    classLabel: string;
    currentWaiverAmount: number;
    sessionLabel: string;
    waivableInstallments: WaivableInstallment[];
  };
  encodedReturnTo: string;
}) {
  const ribbon: Ribbon = (() => {
    if (emiPlan?.reviewNeeded) {
      return {
        tone: "warning",
        title: "EMI plan needs review",
        detail:
          "A fee this plan covers changed, or a new charge appeared inside its scope. Nothing was altered automatically.",
      };
    }

    if (emiPlan) {
      return {
        tone: "info",
        title: `On a monthly EMI plan — ${emiPlan.statusLabel}`,
        detail: `Paying ${formatInr(emiPlan.monthlyAmount)} a month. The dues below keep their own figures; the plan sets when they are collected.`,
      };
    }

    if (overdueAmount > 0) {
      return {
        tone: "danger",
        title: "Overdue",
        detail:
          pendingLateFeeAmount > 0
            ? `${formatInr(overdueAmount)} is past its due date, plus ${formatInr(pendingLateFeeAmount)} in late fees.`
            : `${formatInr(overdueAmount)} is past its due date.`,
      };
    }

    if (creditBalance > 0) {
      return {
        tone: "info",
        title: "Credit balance",
        detail: `${formatInr(creditBalance)} to refund or adjust on the next receipt.`,
      };
    }

    if (outstandingAmount <= 0) {
      return {
        tone: "success",
        title: "Year clear",
        detail: "Nothing outstanding for this session.",
      };
    }

    if (nextDue) {
      return {
        tone: "neutral",
        title: `Next due ${formatMediumDate(nextDue.dueDate)}`,
        detail: `${nextDue.label} — ${formatInr(nextDue.amount)}. Nothing is overdue.`,
      };
    }

    return {
      tone: "neutral",
      title: "Dues outstanding",
      detail: "Nothing is overdue yet.",
    };
  })();

  return (
    <section aria-label="Money summary" className="space-y-3">
      <div className={cn("rounded-lg px-4 py-2.5", ribbonTone[ribbon.tone])}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] leading-snug">
            <span className="font-extrabold">{ribbon.title}</span>
            <span className="mx-1.5 opacity-50">·</span>
            <span className="opacity-90">{ribbon.detail}</span>
          </p>
          {/* Waiving belongs next to the late fee it forgives, not in a header
              two sections away. */}
          {waive?.canWaive && waive.waivableInstallments.length > 0 ? (
            <WaiveLateFeeTrigger
              studentId={waive.studentId}
              studentLabel={waive.studentLabel}
              studentAdmissionNo={waive.studentAdmissionNo}
              classLabel={waive.classLabel}
              currentWaiverAmount={waive.currentWaiverAmount}
              pendingLateFeeAmount={pendingLateFeeAmount}
              sessionLabel={waive.sessionLabel}
              waivableInstallments={waive.waivableInstallments}
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          variant="strip"
          accent={outstandingAmount > 0 ? "danger" : "success"}
          label="Outstanding"
          value={<Money value={outstandingAmount} />}
          hint={
            pendingLateFeeAmount > 0 ? (
              <>
                incl. <Money value={pendingLateFeeAmount} size="xs" /> late fee ·{" "}
                {installmentsPending} installment{installmentsPending === 1 ? "" : "s"} pending
              </>
            ) : (
              `${installmentsPending} installment${installmentsPending === 1 ? "" : "s"} pending`
            )
          }
          trailing={<TrustBadge source="Workbook v1" />}
        />

        <KpiCard
          variant="strip"
          accent="success"
          label="Paid this session"
          value={<Money value={paidThisSession} />}
          hint={
            discountClosedAmount > 0 ? (
              <>
                plus <Money value={discountClosedAmount} size="xs" /> closed as discount
              </>
            ) : (
              // Not the installment count — that is Session fee's hint, and two
              // strips repeating one sentence is exactly the noise this band
              // exists to remove.
              `across ${receiptCount} receipt${receiptCount === 1 ? "" : "s"}`
            )
          }
        />

        <KpiCard
          variant="strip"
          label="Session fee"
          value={<Money value={sessionFeeTotal} />}
          hint={`${installmentsPaid} of ${installmentsTotal} installments settled`}
        />

        {lastReceipt ? (
          <KpiCard
            variant="strip"
            accent="info"
            label="Last receipt"
            value={<Money value={lastReceipt.totalAmount} />}
            hint={`${lastReceipt.receiptNumber} · ${formatMediumDate(lastReceipt.paymentDate)}`}
            href={`/protected/receipts/${lastReceipt.id}?returnTo=${encodedReturnTo}`}
          />
        ) : (
          <KpiCard
            variant="strip"
            label="Last receipt"
            value="—"
            hint="No payment collected yet"
          />
        )}
      </div>
    </section>
  );
}

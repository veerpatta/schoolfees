import { CheckCircle2, Clock, IndianRupee, TrendingUp, CalendarClock } from "lucide-react";

import { KpiCard } from "@/components/ui/kpi-card";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";

export type StudentStatCardsProps = {
  installmentProgress: {
    paid: number;
    overdue: number;
    partial: number;
    total: number;
  };
  totalCollected: number;
  annualTotal: number;
  lastPayment: {
    date: string;
    amount: number;
    mode: string;
  } | null;
  reliability: {
    onTimeCount: number;
    totalCount: number;
    percent: number;
  } | null;
  nextPending: {
    label: string;
    amount: number;
    dueDate: string;
    isOverdue: boolean;
  } | null;
};

export function StudentStatCards({
  installmentProgress,
  totalCollected,
  annualTotal,
  lastPayment,
  reliability,
  nextPending,
}: StudentStatCardsProps) {
  const { paid, overdue, partial, total } = installmentProgress;

  const progressAccent =
    total === 0
      ? ("neutral" as const)
      : paid === total
        ? ("success" as const)
        : overdue > 0
          ? ("danger" as const)
          : partial > 0
            ? ("warning" as const)
            : ("neutral" as const);

  const progressHint =
    total === 0
      ? "No installments prepared yet"
      : paid === total
        ? "All installments cleared"
        : overdue > 0
          ? `${overdue} installment${overdue !== 1 ? "s" : ""} overdue`
          : partial > 0
            ? `${partial} partial · ${total - paid} remaining`
            : `${total - paid} of ${total} remaining`;

  const lastPaymentValue = lastPayment ? formatShortDate(lastPayment.date) : "None yet";
  const lastPaymentHint = lastPayment
    ? `${formatInr(lastPayment.amount)} · ${lastPayment.mode}`
    : "No payments posted this session";

  // Card 4: on-time rate if enough data, next due otherwise, all-clear if settled
  let card4Label: string;
  let card4Value: string;
  let card4Hint: string;
  let card4Accent: "neutral" | "success" | "warning" | "danger" | "info";
  let Card4Icon: React.ElementType;

  if (reliability !== null) {
    card4Label = "On-Time Rate";
    card4Value = `${reliability.percent}%`;
    card4Hint = `${reliability.onTimeCount} of ${reliability.totalCount} payments before due date`;
    card4Accent =
      reliability.percent >= 80 ? "success" : reliability.percent >= 50 ? "warning" : "danger";
    Card4Icon = TrendingUp;
  } else if (nextPending !== null) {
    card4Label = "Next Due";
    card4Value = nextPending.label;
    card4Hint = `${formatInr(nextPending.amount)} · ${formatShortDate(nextPending.dueDate)}${nextPending.isOverdue ? " · Overdue" : ""}`;
    card4Accent = nextPending.isOverdue ? "danger" : "warning";
    Card4Icon = CalendarClock;
  } else {
    card4Label = "Payment Status";
    card4Value = "All Clear";
    card4Hint = "No outstanding dues remaining";
    card4Accent = "success";
    Card4Icon = CheckCircle2;
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <KpiCard
        label="Installment Progress"
        value={total === 0 ? "—" : `${paid} / ${total}`}
        hint={progressHint}
        accent={progressAccent}
        trailing={
          <CheckCircle2 className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
        }
      />
      <KpiCard
        label="Total Collected"
        value={formatInr(totalCollected)}
        hint={annualTotal > 0 ? `of ${formatInr(annualTotal)} annual fee` : "This session"}
        accent="info"
        trailing={
          <IndianRupee className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
        }
      />
      <KpiCard
        label="Last Payment"
        value={lastPaymentValue}
        hint={lastPaymentHint}
        accent="neutral"
        trailing={<Clock className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />}
      />
      <KpiCard
        label={card4Label}
        value={card4Value}
        hint={card4Hint}
        accent={card4Accent}
        trailing={
          <Card4Icon className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
        }
      />
    </div>
  );
}

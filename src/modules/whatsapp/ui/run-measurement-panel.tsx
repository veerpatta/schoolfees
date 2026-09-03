import { formatInr } from "@/platform/helpers/currency";
import {
  daysToPayHistogram,
  describeRunCost,
  medianDaysToPay,
} from "@/modules/whatsapp/domain/run-measurement";

/**
 * How long the money took, and what the run cost.
 *
 * A SERVER component: it is arithmetic over data the page already has, with no
 * state and no handlers, and `/protected/reminders` sits under a gzip ceiling.
 *
 * The bars follow the house chart language from `src/ui/charts.tsx` — a
 * rounded-full track with a filled portion — rather than importing `BarRow`,
 * which renders its value through `Money`. These are counts of families, and
 * rendering a count of three through a currency formatter is exactly the kind of
 * thing nobody notices until a parent is quoted it.
 *
 * **"Paid after", never "because of".** Payments here are spiky: 17 August
 * posted 107 families in one day against 2-9 on a normal day, which is counter
 * cash entered in a batch, and no join can tell that apart from a response. The
 * only number here that is causal is the holdout comparison, and it is labelled
 * differently for that reason.
 */

type Props = {
  daysToPay: number[];
  messaged: number;
  moneyCollected: number;
  /** Second numbers make a run cost more messages than it has families. */
  messagesBilled: number;
  /** Present only when this run held a control group back. */
  holdout?: { heldOut: number; heldOutPaid: number } | null;
  familiesPaid: number;
};

export function RunMeasurementPanel({
  daysToPay,
  messaged,
  moneyCollected,
  messagesBilled,
  holdout,
  familiesPaid,
}: Props) {
  const median = medianDaysToPay(daysToPay);
  const buckets = daysToPayHistogram(daysToPay);
  const peak = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const cost = describeRunCost({ messages: messagesBilled, collected: moneyCollected });

  const messagedRate = messaged > 0 ? Math.round((familiesPaid / messaged) * 1000) / 10 : null;
  const heldOutRate =
    holdout && holdout.heldOut > 0
      ? Math.round((holdout.heldOutPaid / holdout.heldOut) * 1000) / 10
      : null;

  return (
    // flex gap, never space-y: the holdout block is conditional and space-y
    // leaves a margin around a hidden child.
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-bold text-foreground">How long the money took</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {median === null ? (
            "Nobody has paid yet."
          ) : (
            <>
              Median <span className="font-semibold text-foreground">{median}</span>{" "}
              {median === 1 ? "day" : "days"} between the message and the first receipt. Paid{" "}
              <em>after</em> the reminder — not necessarily because of it.
            </>
          )}
        </p>
      </div>

      {/* Fixed buckets, so two runs can be read against each other. */}
      <ul className="flex flex-col gap-2">
        {buckets.map((bucket) => {
          const pct = Math.round((bucket.count / peak) * 100);
          return (
            <li key={bucket.label} className="px-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium text-foreground">{bucket.label}</span>
                <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                  {bucket.count}
                </span>
              </div>
              <div
                className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
                role="progressbar"
                aria-label={`${bucket.label}: ${bucket.count} families`}
                aria-valuemin={0}
                aria-valuemax={peak}
                aria-valuenow={bucket.count}
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {/* ------------------------------------------------------------- cost */}
      <div className="border-t border-border pt-3">
        <h2 className="text-sm font-bold text-foreground">What it cost</h2>
        {/* Wraps to one column on a phone. */}
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Messages</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">{cost.messages}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Cost</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">
              {formatInr(cost.cost)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Per rupee spent
            </dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">
              {/* Null rather than a division by zero. "∞" teaches nobody anything. */}
              {cost.returnPerRupee === null ? "—" : `${formatInr(cost.returnPerRupee)} in`}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Billed per message, so a family reached on a second number counts twice.
        </p>
      </div>

      {/* ---------------------------------------------------------- holdout */}
      {holdout && holdout.heldOut > 0 ? (
        <div className="border-t border-border pt-3">
          <h2 className="text-sm font-bold text-foreground">Against the families held back</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{heldOutRate ?? 0}%</span> of the{" "}
            {holdout.heldOut} held back paid, against{" "}
            <span className="font-semibold text-foreground">{messagedRate ?? 0}%</span> of the{" "}
            {messaged} messaged.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            This is the only comparison here that says anything about cause. Everything above is
            what happened after the message, which is not the same thing.
          </p>
        </div>
      ) : null}
    </section>
  );
}

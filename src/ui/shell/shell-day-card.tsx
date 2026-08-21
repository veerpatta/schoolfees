import { formatInr } from "@/platform/helpers/currency";
import type { ShellPulse } from "@/lib/dashboard/shell-metrics";

/**
 * The sidebar footer's "Day so far" card: today's collected total and receipt
 * count, so the desk clerk sees the day's money without leaving the screen.
 *
 * It is its own async component because its two reads are the slow half of the
 * workspace shell. `getShellPulse` is tagged `session:{label}`, which every
 * payment posting busts — so on a busy desk it is cold far more often than it
 * is warm, and it used to hold up the entire page while it recomputed.
 */

type ShellDayCardProps = {
  pulse: Promise<ShellPulse>;
  receiptPrefix: Promise<string | null>;
};

const cardShell =
  "mt-2 rounded-xl bg-nav-surface px-3 py-2.5";
const cardLabel =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-nav-muted";

export async function ShellDayCard({ pulse, receiptPrefix }: ShellDayCardProps) {
  const [{ todayTotalAmount, todayReceiptCount }, prefix] = await Promise.all([
    pulse,
    receiptPrefix,
  ]);

  return (
    <div className={cardShell}>
      <p className={cardLabel}>Day so far</p>
      <p className="font-display-money mt-0.5 text-xl leading-tight text-nav-foreground">
        {formatInr(todayTotalAmount)}
      </p>
      <p className="mt-0.5 text-[11px] tabular-nums text-nav-muted">
        {todayReceiptCount === 1 ? "1 receipt today" : `${todayReceiptCount} receipts today`}
        {prefix ? ` · ${prefix}` : null}
      </p>
    </div>
  );
}

/**
 * Same box, same height, no numbers. Matching the height matters: the card
 * sits in the sidebar footer, and a shorter placeholder would let the nav list
 * above it grow and then snap back when the figures land.
 */
export function ShellDayCardSkeleton() {
  return (
    <div className={cardShell} aria-hidden="true">
      <p className={cardLabel}>Day so far</p>
      <p className="mt-1 h-[22px] w-24 rounded bg-nav-hover" />
      <p className="mt-1.5 h-[11px] w-28 rounded bg-nav-hover" />
    </div>
  );
}

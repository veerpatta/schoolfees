import {
  compareByHour,
  compareByLanguage,
  compareByLeadTime,
  compareByWeekday,
  type ComparableRun,
  type ComparisonRow,
} from "@/modules/whatsapp/domain/run-measurement";

/**
 * Which reminders work better: Hindi or English, Tuesday or Friday, ten days out
 * or three.
 *
 * A SERVER component over runs the page already loaded — no state, no fetch, and
 * this route has a bundle ceiling.
 *
 * Every table says "paid after", never "because of". Read across a handful of
 * runs these are suggestive, not conclusive, and the screen says so once rather
 * than hedging in every row.
 */

type Props = { runs: ComparableRun[] };

/** Below this, a row is noise dressed as evidence. */
const MIN_MESSAGED_TO_SHOW = 20;

function ComparisonTable({ title, hint, rows }: { title: string; hint: string; rows: ComparisonRow[] }) {
  const shown = rows.filter((row) => row.messaged >= MIN_MESSAGED_TO_SHOW);
  if (shown.length < 2) return null;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {/* Scrolls inside itself on a phone rather than pushing the page sideways. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[26rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="py-1.5 pr-3 font-semibold">
                &nbsp;
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-semibold">
                Messaged
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-semibold">
                Paid after
              </th>
              <th scope="col" className="py-1.5 text-right font-semibold">
                Median days
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.key} className="border-b border-border/60 last:border-0">
                <th scope="row" className="py-1.5 pr-3 text-left font-medium text-foreground">
                  {row.label}
                </th>
                <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                  {row.messaged}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-foreground">
                  {/* Null means nobody was messaged, which is not 0%. */}
                  {row.responseRate === null ? "—" : `${row.responseRate}%`}
                </td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                  {row.medianDays === null ? "—" : row.medianDays}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RunComparisons({ runs }: Props) {
  const tables = [
    {
      title: "Hindi or English",
      hint: "Which language the message went out in.",
      rows: compareByLanguage(runs),
    },
    {
      title: "How much warning",
      hint: "Days between the send and the date the message named.",
      rows: compareByLeadTime(runs),
    },
    {
      title: "Day of the week",
      hint: "The school's day, not the server's.",
      rows: compareByWeekday(runs),
    },
    {
      title: "Time of day",
      hint: "Two-hour bands, IST.",
      rows: compareByHour(runs),
    },
  ];

  const visible = tables.filter(
    (table) => table.rows.filter((row) => row.messaged >= MIN_MESSAGED_TO_SHOW).length >= 2,
  );

  if (visible.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-bold text-foreground">What works better</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Not enough runs to compare yet. Two groups of at least {MIN_MESSAGED_TO_SHOW} messaged
          families are needed before a difference means anything.
        </p>
      </section>
    );
  }

  return (
    // flex gap: tables drop out as the data thins, and space-y would leave a band
    // where one used to be.
    <section className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-bold text-foreground">What works better</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Families who paid <em>after</em> a run, not because of it — over a handful of runs these
          are worth trying, not worth trusting. Groups under {MIN_MESSAGED_TO_SHOW} messaged are
          hidden rather than shown as noise.
        </p>
      </div>
      {visible.map((table) => (
        <ComparisonTable key={table.title} {...table} />
      ))}
    </section>
  );
}

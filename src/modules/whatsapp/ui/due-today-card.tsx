import Link from "next/link";

import { describeSchedule, type DueCampaign } from "@/modules/whatsapp/domain/campaign-schedule";

/**
 * The campaigns whose scheduled slot has arrived and has not gone out.
 *
 * A SERVER component, deliberately. It is static markup driven entirely by data
 * the page already has — no state, no handlers — and `/protected/reminders` sits
 * under a gzip ceiling that only ratchets down. A client island here would ship
 * `describeSchedule`, the schedule types and this markup to every visit to save
 * nothing.
 *
 * Every row is a link that loads the campaign on the send screen with its
 * settings applied. **Nothing here sends.** A campaign with `auto` on says so
 * out loud, because a campaign that will send itself is a different thing from
 * one waiting to be pressed, and the office must be able to tell at a glance.
 */

type Props = {
  due: DueCampaign[];
  /** Where a row links to, so the dashboard and the send screen can differ. */
  hrefFor: (campaign: DueCampaign) => string;
  /** The dashboard shows a tighter version with no explanatory copy. */
  compact?: boolean;
};

function overdueLabel(daysOverdue: number): string {
  if (daysOverdue === 0) return "due today";
  if (daysOverdue === 1) return "1 day late";
  return `${daysOverdue} days late`;
}

export function DueTodayCard({ due, hrefFor, compact = false }: Props) {
  if (due.length === 0) return null;

  return (
    <section
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      aria-labelledby="reminders-due-today"
    >
      {/* flex gap, never space-y: `space-y` also puts a margin around a
          `hidden` child, which leaves a visible band on the phone wherever a
          desk-only line is hidden. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="reminders-due-today" className="text-sm font-bold text-foreground">
            Due to run {due.length === 1 ? "" : "— "}
            <span className="tabular-nums">{due.length}</span>
            {due.length === 1 ? " campaign" : " campaigns"}
          </h2>
          {!compact ? (
            <p className="text-xs text-muted-foreground">
              Scheduled slots that have arrived. Opening one applies its settings; you still press Send.
            </p>
          ) : null}
        </div>

        <ul className="flex flex-col gap-2">
          {due.map((campaign) => (
            <li key={campaign.id}>
              <Link
                href={hrefFor(campaign)}
                // min-h-11 so the row is a comfortable tap target on a phone;
                // the desk gets the same row and loses nothing by it.
                className="focus-ring flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-border bg-surface-2 px-3 py-2 transition-colors hover:border-border-strong"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {campaign.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {describeSchedule(campaign.schedule)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {campaign.auto ? (
                    <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning-foreground">
                      sends itself
                    </span>
                  ) : null}
                  <span
                    className={
                      campaign.daysOverdue > 0
                        ? "text-xs font-bold text-danger"
                        : "text-xs font-semibold text-muted-foreground"
                    }
                  >
                    {overdueLabel(campaign.daysOverdue)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

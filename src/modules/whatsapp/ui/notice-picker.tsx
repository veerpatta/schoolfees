import Link from "next/link";

import {
  isCampaignApproved,
  isLedgerQuotedSituation,
  isRunDateFreeSituation,
  NOTICE_LANGUAGES,
  NOTICE_SITUATIONS,
  type NoticeLanguage,
  type NoticeSituation,
} from "@/modules/whatsapp/domain/campaigns";
import { LATE_FEE_BASES, lateFeePhrase } from "@/modules/whatsapp/domain/late-fee";
import { PendingSubmitButton } from "@/ui/shell/pending-submit-button";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { SelectNative } from "@/ui/primitives/select-native";
import { cn } from "@/platform/utils";
import { reminderQuery, type ReminderQueryKey } from "@/modules/whatsapp/domain/audience";
import { CarriedFilterFields } from "@/modules/whatsapp/ui/carried-filter-fields";
import type { ReminderFilters } from "@/modules/whatsapp/domain/fee-reminders";

/**
 * Which notice is going out, in which language, by when, and with what late fee.
 *
 * A SERVER component since 2026-09-08. It has no state and never had — it is
 * links and form fields — and moving it off the client took the twelve notice
 * labels, `isCampaignApproved`, `LATE_FEE_BASES` and `lateFeePhrase` out of the
 * browser bundle on a route with ~480 gzip bytes of headroom. That is what paid
 * for the audience builder beside it.
 *
 * Links, not buttons. The server action re-derives the run from the very same
 * query string, so a choice held in client state could send a different message
 * than the office is looking at — and the screen has to stay linkable and
 * back-navigable, the same rule the Dashboard boards follow.
 *
 * **The chips no longer carry audience counts.** Until this change the notice
 * decided who was on the list, so "Balance 171" was a real number. It does not
 * decide that any more — the filters do — and the counts moved to the preset
 * row in `AudienceBuilder`, which is the only place they can honestly describe
 * anything. What a chip carries now is the opposite question: how many families
 * ON THE CURRENT LIST this template would have to quote a missing fact at.
 */

type Props = {
  filters: ReminderFilters;
  /**
   * Per template, how many of the families now on the list cannot fill one of
   * its slots — a "Late fee applied" with no late fee renders ₹0. A warning,
   * never a block: the office asked for the freedom and there are real uses for
   * it.
   */
  noticeGaps: Record<NoticeSituation, number>;
  /** How many families are on the list at all, so a gap can be read as a share. */
  candidateCount: number;
  /** Rendered inside the GET filter form, so the date round-trips with everything else. */
  dateFieldId: string;
  /** Shown when the phrase will not match what the ledger charges. Never blocks. */
  lateFeeWarning: string | null;
  /**
   * The Apply action, passed in rather than imported.
   *
   * `src/modules/**` may not reach into `src/app/**` — `npm run quality:architecture`
   * counts every such edge and only lets the count fall. A server action is a
   * value, so the composition root hands it down like any other prop and the
   * layering holds.
   */
  applyAction: (formData: FormData) => void | Promise<void>;
};

/**
 * Keeps every other setting while changing one thing.
 *
 * Deliberately NOT `presetHref`: switching the TEMPLATE must leave the audience
 * exactly as the office built it. That is the whole split — the message and the
 * list are separate choices now, and a chip that quietly rebuilt the list would
 * put it straight back together. `AudienceBuilder`'s preset row is the control
 * that changes the audience, and it says so.
 */
function hrefWith(
  filters: ReminderFilters,
  override: Partial<Pick<ReminderFilters, "situation" | "language">>,
): string {
  return `?${reminderQuery(filters, {
    situation: override.situation ?? filters.situation,
    language: override.language ?? filters.language,
  }).toString()}`;
}

const CHIP_BASE =
  "focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[12.5px] font-bold transition-colors";

export function NoticePicker({
  filters,
  noticeGaps,
  candidateCount,
  dateFieldId,
  lateFeeWarning,
  applyAction,
}: Props) {
  const isPrevYear = filters.situation === "prevyear";
  const isWaiver =
    filters.situation === "late_fee_waiver" || filters.situation === "waiver_last_call";
  // The late fee on these notices is the LEDGER's figure per family, not a
  // lever the office sets. The control is replaced by hidden inputs so the
  // office's last setting still round-trips to the next notice.
  const ledgerQuoted = isLedgerQuotedSituation(filters.situation);
  // These print no run-wide date: none at all, or each family's own promise.
  const runDateFree = isRunDateFreeSituation(filters.situation);
  // Exactly what slot 7 will carry, rendered here so the office reads the
  // sentence rather than inferring it from a number and a dropdown.
  const phrase = lateFeePhrase(filters.lateFeeAmount, filters.lateFeeBasis, filters.language);

  return (
    // The form lives HERE, not on the page, so the Apply button inside it can
    // read `useFormStatus`. A server action rather than a GET: Apply also
    // REMEMBERS the date and the late fee, so tomorrow's screen opens on them,
    // then redirects to the same query string a GET would have built — the
    // notice stays linkable and the back button honest.
    <form
      action={applyAction}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm md:rounded-lg md:p-4"
    >
      {/* One line on a 390px screen: scroll rather than wrap, so the row never
          reflows under a thumb mid-tap. `no-scrollbar` because Windows Chrome
          paints a persistent grey bar under an `overflow-x-auto` row, which
          reads as broken chrome rather than as an affordance — and there are
          two of these rows now, this one and the presets. Above `md` there is
          room to wrap, so the overflow is dropped entirely rather than hidden. */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        {NOTICE_SITUATIONS.map((entry) => {
          const active = entry.value === filters.situation;
          const gap = noticeGaps[entry.value] ?? 0;
          // A notice whose template Meta has not approved yet is shown and
          // disabled, never hidden. The office needs to know the notice exists
          // and why it cannot be sent — a missing chip is a mystery, and the
          // alternative is learning it from `400 Campaign does not exist.`
          if (!isCampaignApproved(entry.value, filters.language)) {
            return (
              <span
                key={entry.value}
                aria-disabled="true"
                title={`${entry.hint} — awaiting Meta approval`}
                className={cn(
                  CHIP_BASE,
                  "cursor-not-allowed border-dashed border-border bg-surface-2 text-muted-foreground",
                )}
              >
                <span className="whitespace-nowrap">{entry.label}</span>
                <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide">
                  awaiting Meta approval
                </span>
              </span>
            );
          }

          return (
            <Link
              key={entry.value}
              href={hrefWith(filters, { situation: entry.value })}
              scroll={false}
              title={entry.hint}
              aria-current={active ? "page" : undefined}
              className={cn(
                CHIP_BASE,
                active
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-card text-foreground hover:border-border-strong",
                // Dimmed, never hidden. A template that fits nobody on today's
                // list is information; hiding it would move the row under a
                // finger mid-tap.
                gap > 0 && gap === candidateCount && !active && "opacity-45",
              )}
            >
              <span className="whitespace-nowrap">{entry.label}</span>
              {gap > 0 ? (
                // How many on the CURRENT list this template cannot quote
                // properly. Not an audience count — the template has no say in
                // the audience any more.
                <span
                  title={`${gap} of ${candidateCount} on the list are missing something this message names`}
                  className={cn(
                    "tabular-nums text-[11px] font-extrabold",
                    active ? "opacity-80" : "text-warning-foreground",
                  )}
                >
                  ⚠ {gap}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div className="flex items-center gap-1 rounded-[14px] bg-surface-2 p-1">
          {NOTICE_LANGUAGES.map((entry) => {
            const active = entry.value === (filters.language as NoticeLanguage);
            return (
              <Link
                key={entry.value}
                href={hrefWith(filters, { language: entry.value })}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring grid h-8 min-w-[72px] place-items-center rounded-[10px] px-3 text-xs font-extrabold transition-colors",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {entry.label}
              </Link>
            );
          })}
        </div>

        {runDateFree ? (
          // Hidden, never dropped: the office's date must survive a trip
          // through a notice that had no use for it.
          <input type="hidden" name="lastDate" value={filters.lastDate} />
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor={dateFieldId}>
              {isPrevYear
                ? "Settle by"
                : isWaiver
                  ? "Last date without late fee"
                  : "Last date on the message"}
            </Label>
            <Input
              id={dateFieldId}
              name="lastDate"
              inputSize="sm"
              defaultValue={filters.lastDate}
              placeholder="DD-MM-YYYY"
              className="w-36"
            />
          </div>
        )}

        {ledgerQuoted ? (
          <>
            <input type="hidden" name="lateFeeAmount" value={filters.lateFeeAmount} />
            <input type="hidden" name="lateFeeBasis" value={filters.lateFeeBasis} />
            <PendingSubmitButton
              variant="outline"
              size="sm"
              className="h-11 self-end md:h-9"
              pendingLabel="Applying…"
            >
              Apply
            </PendingSubmitButton>
          </>
        ) : (
          // An amount and a basis, never a free-text box: a typo here is a number
          // a parent will hold the school to.
          <div className="space-y-1.5">
            <Label htmlFor="lateFeeAmount">Late fee on the message</Label>
            <div className="flex items-center gap-2">
              <Input
                id="lateFeeAmount"
                name="lateFeeAmount"
                type="number"
                min={0}
                inputSize="sm"
                defaultValue={filters.lateFeeAmount}
                className="w-24"
              />
              <SelectNative
                id="lateFeeBasis"
                name="lateFeeBasis"
                defaultValue={filters.lateFeeBasis}
                className="h-9 w-40 text-sm"
              >
                {LATE_FEE_BASES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </SelectNative>
              <PendingSubmitButton
                variant="outline"
                size="sm"
                className="h-11 md:h-9"
                pendingLabel="Applying…"
              >
                Apply
              </PendingSubmitButton>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {ledgerQuoted ? (
          <>
            The late fee on this notice is{" "}
            <span className="font-semibold text-foreground">the ledger&rsquo;s figure, per family</span>
            {" — "}read from the installment balances, never typed here.
            {runDateFree ? " It prints no date." : ""}
          </>
        ) : runDateFree ? (
          <>
            The message will say:{" "}
            <span className="font-semibold text-foreground">{phrase}</span>, and the date on it is{" "}
            <span className="font-semibold text-foreground">each family&rsquo;s own promised date</span>.
          </>
        ) : (
          <>
            The message will say:{" "}
            <span className="font-semibold text-foreground">{phrase}</span>
          </>
        )}
      </p>

      {lateFeeWarning ? (
        // Warn, never block. The office may deliberately quote something the
        // ledger will not charge — that is what this control is for — but they
        // should press Send knowing it.
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
          <strong className="font-semibold">Heads up.</strong> {lateFeeWarning}
        </p>
      ) : null}

      {/* The picker owns the notice, the language, the date and the late fee.
          Everything else rides along, or submitting a date would reset the
          audience the office just built. */}
      <CarriedFilterFields filters={filters} except={NOTICE_FORM_KEYS} />
    </form>
  );
}

/**
 * The keys this card's own form posts.
 *
 * `campaignId` is deliberately not here: it is not a filter, it rides along on
 * every form so a run started from a saved campaign stays attributed to it
 * through an Apply.
 */
const NOTICE_FORM_KEYS = [
  "situation",
  "language",
  "lastDate",
  "lateFeeAmount",
  "lateFeeBasis",
] as const satisfies readonly ReminderQueryKey[];

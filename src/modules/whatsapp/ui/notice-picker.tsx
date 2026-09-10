import Link from "next/link";

import {
  isCampaignApproved,
  ledgerLateFeePhrase,
  isLedgerQuotedSituation,
  isRunDateFreeSituation,
  NOTICE_LANGUAGES,
  NOTICE_SITUATIONS,
  type NoticeLanguage,
  type NoticeSituation,
} from "@/modules/whatsapp/domain/campaigns";
import {
  LATE_FEE_BASES,
  LATE_FEE_SOURCES,
  lateFeePhrase,
} from "@/modules/whatsapp/domain/late-fee";
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
  override: Partial<Pick<ReminderFilters, "situation" | "language" | "lateFeeSource">>,
): string {
  return `?${reminderQuery(filters, {
    situation: override.situation ?? filters.situation,
    language: override.language ?? filters.language,
    lateFeeSource: override.lateFeeSource ?? filters.lateFeeSource,
  }).toString()}`;
}

const CHIP_BASE =
  // 44px on a phone, the desk's own 36 above md — the same rule as every other
  // control on this screen, which chips were quietly exempt from at 36px. The
  // tighter horizontal padding on a phone is what lets four fit per row rather
  // than three, so wrapping twelve of them costs three rows instead of four.
  "focus-ring inline-flex h-11 shrink-0 snap-start items-center gap-1 rounded-full border px-3 text-[12px] font-bold transition-colors md:h-9 md:gap-1.5 md:px-4 md:text-[12.5px]";

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
  /**
   * Does this notice's WORDING state the fee as already on the account?
   *
   * These three print a number, not a rate: "the late fee on your account is
   * ₹X". That is what makes custom mode a claim about the ledger here and only
   * a lever everywhere else.
   */
  const statesAccountBalance = isLedgerQuotedSituation(filters.situation);
  // These print no run-wide date: none at all, or each family's own promise.
  const runDateFree = isRunDateFreeSituation(filters.situation);
  /**
   * Which of the two modes this run is in.
   *
   * Until 2026-09-10 the TEMPLATE decided, and the office could not reach the
   * other half from either side. Now it is a choice on every notice, and the
   * amount box appears exactly when there is something to type.
   */
  const usesLedger = filters.lateFeeSource === "ledger";
  // Exactly what slot 7 will carry, rendered here so the office reads the
  // sentence rather than inferring it from a number and a dropdown.
  const phrase = lateFeePhrase(filters.lateFeeAmount, filters.lateFeeBasis, filters.language);
  /**
   * Exactly what slot {{7}} will carry in ledger mode, from the SAME function
   * the send path uses.
   *
   * It used to recompute the policy rate here, which is how the message came to
   * say "not charged" on a carry-forward balance while this line beside it still
   * promised Rs 1,000 per installment. The office reads this line to decide, so
   * the copy that was wrong was the one that mattered.
   */
  /**
   * The exact wording `lateFeePhrase` uses for "no late fee", from the same
   * function rather than a literal — so a run that mentions none can be
   * detected without hardcoding a Hindi or English string here.
   */
  const noLateFeeWording = lateFeePhrase(0, "none", filters.language);
  const policyPhrase = ledgerLateFeePhrase({
    situation: filters.situation,
    language: filters.language,
    // No `charged`: a run-level preview cannot know one family from another, so
    // it states the school's rate rather than somebody's accrued total.
    policyLateFeeAmount: filters.policyLateFeeAmount,
    fallbackAmount: filters.lateFeeAmount,
    fallbackBasis: filters.lateFeeBasis,
  });
  /**
   * Does this run mention a late fee at all?
   *
   * Derived from the resolved PHRASE, not from the basis dropdown. The basis is
   * only half the answer in custom mode (a nil amount also means none), and it
   * is no answer at all in ledger mode — where `prevyear` resolves to "not
   * charged" whatever the dropdown says. Reading the basis produced "or [not
   * applicable on this amount] applies", which is not a sentence.
   */
  const mentionsLateFee =
    (usesLedger ? policyPhrase : phrase) !== noLateFeeWording;

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
      {/* Numbered, and it says so: this row picks the WORDING and nothing else.
          Its twelve chips used to sit above twelve audience chips carrying the
          same twelve names, and nothing on the page distinguished them. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-extrabold text-accent-foreground">
            1
          </span>
          What it says
        </h3>
        <p className="text-[11.5px] text-muted-foreground">
          Picking a message never changes who is on the list.
        </p>
      </div>

      {/* One SNAPPING row on a phone, with an edge fade and a count; wrapped
          above md.

          All three arrangements were measured at 390px, where the card's inner
          width is 298px and these twelve labels run 68-133px wide:

          - Scrolling, `no-scrollbar`, no affordance (until 2026-09-10): 1571px
            of row in a 298px viewport, so **nine of the twelve messages sat
            off-screen and nothing on the page said they existed**.
          - Wrapped: everything visible, but **six rows and 304px** — 35% of an
            861px card, spent on the control the office changes least, which
            pushed "Who gets it" to 1156px on an 844px screen.
          - This: 44px, still one tap, and nothing hidden unknowingly. `snap-x`
            so a flick lands on a chip rather than mid-label, plus the fade and
            the count line below, which is the affordance `no-scrollbar` took
            away.

          The audience chips next door WRAP instead, and the difference is the
          point: five chips the office retunes every run must all be visible at
          once; twelve messages picked once need only be reachable. */}
      <div className="relative md:static">
        <div className="no-scrollbar -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
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
              )}
            >
              <span className="whitespace-nowrap">{entry.label}</span>
              {/* NEVER dimmed for a gap. A template whose slots this audience
                  cannot fill is still a template the office may deliberately
                  want to send — that freedom is the whole point of separating
                  the message from the list — and a greyed chip reads as
                  "unavailable". The ⚠ says what is missing; it does not
                  discourage. Only an unapproved template is visually held
                  back, above, because Meta really will refuse it. */}
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
        {/* The affordance, phone only: `from-card` matches the card it sits on,
            so the last chip fades out rather than being cut flat. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-card to-transparent md:hidden"
        />
      </div>
      <p className="text-[10.5px] leading-tight text-muted-foreground md:hidden">
        Swipe for all {NOTICE_SITUATIONS.length} messages.
      </p>

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

        {/* ------------------------------------------------- the late fee */}
        {/* TWO MODES, on every notice. Which one you got used to be decided by
            the template — the three ledger-quoted notices always read the
            ledger and hid this control, the other nine always used the typed
            amount and could not read the ledger at all — so neither half was
            reachable from the other. A segmented link pair, not a select,
            because it changes what a parent is told about money and should
            read as a mode rather than as one option among four. */}
        <div className="space-y-1.5">
          <Label htmlFor="lateFeeAmount">Late fee on the message</Label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-[14px] bg-surface-2 p-1">
              {LATE_FEE_SOURCES.map((entry) => {
                const active = entry.value === filters.lateFeeSource;
                return (
                  <Link
                    key={entry.value}
                    href={hrefWith(filters, { lateFeeSource: entry.value })}
                    scroll={false}
                    prefetch={false}
                    title={entry.hint}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "focus-ring grid h-9 min-w-[104px] place-items-center rounded-[10px] px-3 text-[11.5px] font-extrabold transition-colors",
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

            {usesLedger ? (
              // Nothing to type. The values still ride along so switching back
              // to Custom finds what the office last set, rather than a zero.
              <>
                <input type="hidden" name="lateFeeAmount" value={filters.lateFeeAmount} />
                <input type="hidden" name="lateFeeBasis" value={filters.lateFeeBasis} />
              </>
            ) : (
              // An amount and a basis, never a free-text box: a typo here is a
              // number a parent will hold the school to.
              <>
                <Input
                  id="lateFeeAmount"
                  name="lateFeeAmount"
                  type="number"
                  min={0}
                  inputSize="sm"
                  defaultValue={filters.lateFeeAmount}
                  className="h-11 w-24 md:h-9"
                />
                <SelectNative
                  id="lateFeeBasis"
                  name="lateFeeBasis"
                  aria-label="How the late fee applies"
                  defaultValue={filters.lateFeeBasis}
                  className="h-11 w-40 text-sm md:h-9"
                >
                  {LATE_FEE_BASES.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </SelectNative>
              </>
            )}

            <input type="hidden" name="lateFeeSource" value={filters.lateFeeSource} />
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
      </div>

      {/* -------------------------------------------------- what a parent reads */}
      {/* ONE sentence, on every template, saying what actually goes out about
          the deadline and the late fee.
          
          This is the fix for the real complaint: the same late-fee control
          means three different things depending on the chip above it — typed
          here on nine notices, taken from the ledger per family on the waiver
          pair and `late_fee_applied`, and printed not at all where the notice
          has no date slot. Nothing on screen said which you were looking at,
          so the office could not tell a waiver note that quotes the ledger
          from a fee-due note quoting whatever was last typed. Now they do not
          have to work it out: the sentence says it. */}
      <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
          What a parent reads
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-foreground">
          {/* The sentence follows the MODE, not the template. Which one you are
              in is the thing that decides what a parent is told about money,
              and it is now a choice rather than a property of the chip above. */}
          {statesAccountBalance ? (
            <>
              {usesLedger ? (
                <>
                  Their own late fee,{" "}
                  <span className="font-semibold">taken from the ledger for each family</span> —
                  nothing typed here reaches them.
                </>
              ) : (
                <>
                  The late fee on their account, stated as{" "}
                  <span className="font-semibold">{phrase}</span> — a figure you typed, the same
                  for every family, not what the ledger holds.
                </>
              )}
              {isWaiver && filters.lastDate ? (
                <>
                  {" "}It is not charged if the fees arrive by{" "}
                  <span className="font-semibold">{filters.lastDate}</span>.
                </>
              ) : runDateFree ? (
                <> The message carries no date.</>
              ) : null}
            </>
          ) : runDateFree ? (
            <>
              <span className="font-semibold">{usesLedger ? policyPhrase : phrase}</span>, against{" "}
              <span className="font-semibold">each family&rsquo;s own promised date</span> from the
              contact log.
            </>
          ) : (
            <>
              Pay by <span className="font-semibold">{filters.lastDate || "— pick a date"}</span>
              {!mentionsLateFee ? (
                <>
                  .{" "}
                  {usesLedger && filters.situation === "prevyear"
                    ? "No late fee — a carry-forward balance never accrues one."
                    : "No late fee is mentioned."}
                </>
              ) : (
                <>
                  , or <span className="font-semibold">{usesLedger ? policyPhrase : phrase}</span>{" "}
                  applies
                  {usesLedger ? (
                    <>
                      {" "}— <span className="font-semibold">the school&rsquo;s own rate</span>, so
                      the message and the receipt cannot disagree
                    </>
                  ) : null}
                  .
                </>
              )}
            </>
          )}
        </p>
      </div>

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
  "lateFeeSource",
] as const satisfies readonly ReminderQueryKey[];

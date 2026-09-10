import Link from "next/link";
import type { ReactNode } from "react";
import { Plus, RotateCcw, X } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { PendingSubmitButton } from "@/ui/shell/pending-submit-button";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { SelectNative } from "@/ui/primitives/select-native";
import { cn } from "@/platform/utils";
import { formatInr } from "@/platform/helpers/currency";
import {
  DEFAULT_MAX_TOTAL_PAID,
  describeAudience,
  INSTALLMENT_MATCHES,
  installmentMatchHref,
  installmentTileHref,
  lastYearTileHref,
  PAID_OPTIONS,
  PROMISE_OPTIONS,
  reminderQuery,
  TRI_OPTIONS,
  type ReminderQueryKey,
} from "@/modules/whatsapp/domain/audience";
import {
  defaultInstallmentsFor,
  describeInstallmentTile,
  type InstallmentCalendar,
} from "@/modules/whatsapp/domain/installment-calendar";
import {
  describeTileMoney,
  type ReminderAudience,
  type ReminderFilters,
} from "@/modules/whatsapp/domain/fee-reminders";
import type { StudentBrief } from "@/modules/whatsapp/data/student-lookup";
import { CarriedFilterFields } from "@/modules/whatsapp/ui/carried-filter-fields";

/**
 * Who gets this message — the installment tiles, and nothing the template
 * decides.
 *
 * ONE main control: Inst 1 · 2 · 3 · 4 · Last year. Each tile says what the
 * calendar makes of it ("Overdue since 20-04-2026", "Due 20-10-2026") and how
 * many families it alone would reach, so due-versus-overdue is read off the
 * tile rather than asked for as a filter. Tap to select; two or more tiles
 * bring up "owing on all of them / any of them". Everything else — class, paid
 * so far, a late fee on the ledger, a minimum, the promise hold-back — sits
 * folded under "Narrow down", because those are the questions the office asks
 * rarely and the tiles are the one it asks every day.
 *
 * Until 2026-09-10 this card carried nine audience chips (each borrowing a
 * TEMPLATE's old audience as a preset) and twelve controls, most of them
 * yes/no/either facts nobody could explain without knowing the rule they were
 * extracted from. The owner's words were "very confusing", and the owner's
 * mental model was installment-first, so this is installment-first.
 *
 * A SERVER component, and that is not a style choice. `/protected/reminders`
 * sits ~1000 gzip bytes under its ceiling in `quality/route-bundle-baseline.json`,
 * and that file's rule is that ceilings ratchet down. Everything here is a
 * `<Link>`, a GET form or a server action — none of which needs a byte of
 * client JavaScript — so the whole audience builder costs the browser nothing.
 */

type Props = {
  filters: ReminderFilters;
  audience: ReminderAudience;
  /** Names for the ids in `?include=` — a row of UUIDs is unreadable before a send. */
  included: StudentBrief[];
  excluded: StudentBrief[];
  /**
   * Matches for a search that did not resolve to exactly one student, so the
   * office picks. Empty on the ordinary path.
   */
  matches: StudentBrief[];
  /** What was typed, echoed back beside the matches. */
  searchQuery: string;
  /**
   * What today makes of the fee calendar — the same one the audience was
   * counted with. Passed in rather than recomputed: a tile's label has to
   * describe the SAME state its count was built on, or a tile reading
   * "Overdue" and 201 lands on a different 201.
   */
  calendar: InstallmentCalendar;
  /**
   * The add-a-student action, passed in rather than imported — see the same
   * note on `NoticePicker`. `src/modules/**` may not reach into `src/app/**`,
   * and the architecture gate counts every edge that does.
   */
  addAction: (formData: FormData) => void | Promise<void>;
};

/** A label above a compact control. */
function Field({
  id,
  label,
  hint,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-[11.5px] leading-tight">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[10.5px] leading-tight text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// 44px on a phone, the desk's own 36 above md. Every control on this panel, so
// a thumb never has to find a 28px select between two others.
const CONTROL = "h-11 w-full text-[13px] md:h-9";

/**
 * One tile. The whole surface is the tap target, and a tile whose tap would
 * leave zero tiles selected is rendered inert rather than as a link — zero
 * tiles is not a state, because the quoted amount is derived from them.
 */
function Tile({
  href,
  selected,
  title,
  subtitle,
  count,
}: {
  href: string | null;
  selected: boolean;
  title: string;
  subtitle: string;
  count: number;
}) {
  // A zero-count tile is dimmed by COLOUR, never by opacity: opacity composites
  // the text too, and took a chip label to 2.88:1 against the 4.5 axe requires.
  // `text-muted-foreground` on `surface-2` measures 5.21:1 in light and 8.04:1
  // in dark, so the tile still reads as quiet without becoming unreadable.
  const className = cn(
    "focus-ring flex min-h-11 min-w-0 flex-col justify-center gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors md:min-h-14",
    selected
      ? "border-accent bg-accent/12 text-foreground"
      : count === 0
        ? "border-border/60 bg-surface-2 text-muted-foreground"
        : "border-border bg-card text-foreground hover:border-border-strong",
  );
  const body = (
    <>
      <span className="flex w-full items-baseline justify-between gap-2">
        <span className="whitespace-nowrap text-[13px] font-extrabold">{title}</span>
        <span
          className={cn(
            "tabular-nums text-[12px] font-extrabold",
            selected ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      </span>
      <span className="truncate text-[10.5px] leading-tight text-muted-foreground">{subtitle}</span>
    </>
  );
  if (href === null) {
    return (
      <span aria-current="true" aria-disabled="true" className={className}>
        {body}
      </span>
    );
  }
  return (
    <Link
      href={href}
      scroll={false}
      prefetch={false}
      aria-current={selected ? "true" : undefined}
      className={className}
    >
      {body}
    </Link>
  );
}

/** One person, as a removable chip. */
function StudentChip({
  brief,
  href,
  title,
  tone,
}: {
  brief: StudentBrief;
  href: string;
  title: string;
  tone: "included" | "excluded";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-1 text-[11.5px] font-semibold",
        tone === "included"
          ? "border-accent/40 bg-accent/10 text-foreground"
          : "border-border bg-surface-2 text-muted-foreground line-through",
      )}
    >
      <span className="max-w-[11rem] truncate">
        {brief.studentName} · {brief.admissionNo}
      </span>
      <Link
        href={href}
        scroll={false}
        prefetch={false}
        title={title}
        aria-label={`${title}: ${brief.studentName}`}
        className="focus-ring grid size-7 shrink-0 place-items-center rounded-full hover:bg-background"
      >
        {tone === "included" ? (
          <X className="size-3.5" aria-hidden="true" />
        ) : (
          <RotateCcw className="size-3.5" aria-hidden="true" />
        )}
      </Link>
    </span>
  );
}

export function AudienceBuilder({
  filters,
  audience,
  included,
  excluded,
  matches,
  searchQuery,
  calendar,
  addAction,
}: Props) {
  /** Drop `id` from a comma list in the query string, keeping everything else. */
  const without = (key: "include" | "exclude", id: string) => {
    const source = key === "include" ? filters.includeStudentIds : filters.excludeStudentIds;
    const next = source.filter((value) => value !== id);
    return `?${reminderQuery(filters, { [key]: next.join(",") || null }).toString()}`;
  };

  const selectedInstallments = filters.lastYear ? [] : filters.installments;
  const calendarDefault = defaultInstallmentsFor(calendar);
  // The courtesy-notice rule only means something when nothing selected is
  // overdue (`calendar.overdue`, strictly past — the row due today is not); on
  // an overdue tile everybody is overdue by definition, and the tile hrefs
  // drop the key there for the same reason.
  const offerSkipOverdue =
    !filters.lastYear &&
    selectedInstallments.length > 0 &&
    selectedInstallments.every((installment) => !calendar.overdue.includes(installment));

  const classLabel =
    audience.classOptions.find((option) => option.classId === filters.classId)?.label ?? null;
  const narrowing = [
    classLabel,
    filters.paid !== "any"
      ? (PAID_OPTIONS.find((entry) => entry.value === filters.paid)?.label ?? null)
      : null,
    filters.lateFee !== "any" ? `late fee: ${filters.lateFee}` : null,
    filters.minDueAmount > 1 ? `at least ${formatInr(filters.minDueAmount)}` : null,
    filters.promise !== "skip_open"
      ? (PROMISE_OPTIONS.find((entry) => entry.value === filters.promise)?.label ?? null)
      : null,
    filters.skipOverdue ? "not overdue on anything earlier" : null,
    filters.includeRte ? "RTE included" : null,
  ].filter((entry): entry is string => Boolean(entry));

  const handPicked = included.length + excluded.length;

  /**
   * The sentence, built from what this run actually landed on.
   *
   * `quotedTotal` sums the SAME `dueAmount` each family will be messaged, so
   * the figure on screen is the figure that goes out — not a re-derivation that
   * could disagree with it.
   */
  const sentence = describeAudience(filters, {
    count: audience.candidates.length,
    quotedTotal: audience.candidates.reduce((sum, candidate) => sum + candidate.dueAmount, 0),
    heldByPromise: audience.paused.filter((family) => family.reason === "promise_open").length,
    // Everything else in `paused` is a cadence decision: never, snoozed, or
    // messaged too recently. The tile counts these families and the send does
    // not, so the sentence has to account for them or the two numbers look
    // like they disagree.
    heldByCadence: audience.paused.filter((family) => family.reason !== "promise_open").length,
    className: classLabel,
  });
  // The reconciliation with the Dashboard, composed server-side (this is a
  // server component, and `fee-reminders` is `server-only`), so the office
  // sees every rupee of the difference named without a byte reaching the
  // client bundle.
  const notes = [...sentence.notes, ...describeTileMoney(filters, audience.money)];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm md:rounded-lg md:p-4">
      {/* Numbered, because the two cards on this screen answer two questions
          that used to be one. Without the numbers they read as two rows of
          chips doing the same job. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-extrabold text-accent-foreground">
            2
          </span>
          Who gets it
        </h3>
        <p className="text-[11.5px] text-muted-foreground">
          Pick the installments they still owe on. Changing the message above never changes the list.
        </p>
      </div>

      {/* ------------------------------------------------------- the sentence */}
      {/* The answer to "who gets it", in words, above the tiles that decide it.

          Three weights, not one. As a single string this measured six lines
          and 124px of uniform semibold at 390px, and it is both the first thing
          on the card and what a person reads before sending a few hundred
          billed messages. The two figures they actually check land in one
          glance; the qualifiers stay legible without competing.

          `aria-live` sits on the wrapper so a screen reader hears the whole
          thing as one update rather than three. */}
      <div
        aria-live="polite"
        className="flex flex-col gap-1 rounded-lg border border-accent/25 bg-accent/[0.06] px-3 py-2.5"
      >
        <p className="text-[15px] font-extrabold leading-tight tracking-tight text-foreground tabular-nums md:text-[14px]">
          {sentence.headline}
        </p>
        <p className="text-[12.5px] font-semibold leading-snug text-foreground">
          {sentence.claim}
        </p>
        {notes.length > 0 ? (
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            {notes.join(" ")}
          </p>
        ) : null}
      </div>

      {/* ------------------------------------------------------------- tiles */}
      {/* Two columns on a phone, five across at the desk — a GRID that wraps,
          never a scrolling row: this is the control the office retunes on
          every run, and five counts are only comparable when all five are on
          screen. Each tile is the
          whole tap target; the count is who THAT tile alone would reach under
          the same narrowing, class and hold-backs as the list — so with one
          tile selected, its number is the list. */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {[1, 2, 3, 4].map((installment) => {
          const tile = describeInstallmentTile(installment, calendar);
          return (
            <Tile
              key={installment}
              href={installmentTileHref(filters, installment, calendar)}
              selected={selectedInstallments.includes(installment)}
              title={`Installment ${installment}`}
              subtitle={tile.label}
              count={audience.tileCounts.byInstallment[installment - 1] ?? 0}
            />
          );
        })}
        <Tile
          href={lastYearTileHref(filters, calendarDefault)}
          selected={filters.lastYear}
          title="Last year"
          subtitle="Carried forward from last session"
          count={audience.tileCounts.lastYear}
        />
      </div>

      {/* "Owing on all of them" is the default — the office asked for it — and
          the difference is not small: 187 against 345 on installments 1 and 2
          the day this shipped. Only shown when it can mean anything. */}
      {selectedInstallments.length > 1 ? (
        <div
          role="group"
          aria-label="How many of the selected installments they must still owe on"
          className="inline-flex w-fit overflow-hidden rounded-lg border border-border"
        >
          {INSTALLMENT_MATCHES.map((entry) => {
            const active = entry.value === filters.installmentMatch;
            return (
              <Link
                key={entry.value}
                href={installmentMatchHref(filters, entry.value)}
                scroll={false}
                prefetch={false}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "focus-ring inline-flex min-h-11 items-center px-3.5 text-[12px] font-bold transition-colors md:min-h-9",
                  active
                    ? "bg-accent/12 text-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {entry.label}
              </Link>
            );
          })}
        </div>
      ) : null}

      {/* ------------------------------------------------------- narrow down */}
      {/* Folded on every viewport. Open by itself the moment any of it is
          applied, so a narrowed list never hides the fact; the summary line
          carries what is applied either way. */}
      <details open={narrowing.length > 0} className="border-t border-border pt-3">
        <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-1 text-[12.5px] font-bold text-foreground md:min-h-0">
          <span>Narrow down</span>
          <span className="max-w-[62%] truncate text-[11px] font-semibold text-muted-foreground">
            {narrowing.length > 0 ? narrowing.join(" · ") : "Every class, whatever they have paid"}
          </span>
        </summary>
        <form method="get" className="pt-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 md:grid-cols-4">
            <Field id="classId" label="Class">
              <SelectNative
                id="classId"
                name="classId"
                defaultValue={filters.classId ?? ""}
                className={CONTROL}
              >
                <option value="">All classes</option>
                {/* Counted before the class filter is applied, so picking a class
                    does not empty the dropdown that picked it. */}
                {audience.classOptions.map((option) => (
                  <option key={option.classId} value={option.classId}>
                    {option.label} ({option.count})
                  </option>
                ))}
              </SelectNative>
            </Field>

            <Field
              id="paid"
              label="Paid so far"
              hint={`Nothing yet is at most ${formatInr(DEFAULT_MAX_TOTAL_PAID)} received.`}
            >
              <SelectNative id="paid" name="paid" defaultValue={filters.paid} className={CONTROL}>
                {PAID_OPTIONS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </SelectNative>
            </Field>

            <Field
              id="lateFee"
              label="Late fee on the ledger"
              hint="On the selected installments."
            >
              <SelectNative
                id="lateFee"
                name="lateFee"
                defaultValue={filters.lateFee}
                className={CONTROL}
              >
                {TRI_OPTIONS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </SelectNative>
            </Field>

            <Field id="minDueAmount" label="Owing at least">
              <Input
                id="minDueAmount"
                name="minDueAmount"
                type="number"
                min={0}
                inputMode="numeric"
                defaultValue={filters.minDueAmount}
                className={CONTROL}
              />
            </Field>

            <Field
              id="promise"
              label="Promise to pay"
              hint="From the office's own contact log."
              className="col-span-2"
            >
              <SelectNative
                id="promise"
                name="promise"
                defaultValue={filters.promise}
                className={CONTROL}
              >
                {PROMISE_OPTIONS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </SelectNative>
            </Field>

            <div className="col-span-2 flex flex-col justify-end gap-1.5">
              {offerSkipOverdue ? (
                <label className="flex min-h-11 items-center gap-2 text-[12.5px] font-semibold md:min-h-0">
                  <input
                    type="checkbox"
                    name="skipOverdue"
                    defaultChecked={filters.skipOverdue}
                    className="size-4 rounded border-border-strong accent-accent"
                  />
                  Skip families already overdue on an earlier installment
                </label>
              ) : null}
              <label className="flex min-h-11 items-center gap-2 text-[12.5px] font-semibold md:min-h-0">
                <input
                  type="checkbox"
                  name="includeRte"
                  defaultChecked={filters.includeRte}
                  className="size-4 rounded border-border-strong accent-accent"
                />
                Include RTE students
              </label>
            </div>

            <div className="col-span-2 flex justify-end md:col-span-4">
              {/* `max-md:h-11`, not `h-11`: the button primitive carries a
                  compound variant `{ size: "sm", class: "max-md:h-10" }` that a
                  bare `h-11` loses to inside the media query, so Apply measured
                  40px beside 44px selects. Same variant level is what wins. */}
              <Button type="submit" variant="primary" size="sm" className="max-md:h-11 px-6 md:h-9">
                Apply
              </Button>
            </div>
          </div>
          {/* The tiles are NOT this form's keys, so they ride along as hidden
              inputs and pressing Apply cannot reset them. */}
          <CarriedFilterFields filters={filters} except={FILTER_FORM_KEYS} />
        </form>
      </details>

      {/* ---------------------------------------------------- by hand */}
      {/* A disclosure, not an always-open block. On a phone the search field,
          its button and three lines of standing explanation cost six rows
          above a list the office is scrolling to — for an action they take
          rarely. Open by default the moment anybody IS hand-picked, so a list
          that has been edited never hides that fact; the summary carries the
          counts either way, because a hand-picked student changes who gets a
          billed message and must never be invisible. */}
      <details
        open={handPicked > 0 || matches.length > 0 || Boolean(searchQuery)}
        className="border-t border-border pt-3"
      >
        <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-1 text-[12.5px] font-bold text-foreground md:min-h-0">
          <span className="inline-flex items-center gap-1.5">
            <Plus className="size-3.5" aria-hidden="true" />
            Add or remove specific students
          </span>
          {handPicked > 0 ? (
            <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-extrabold text-foreground">
              {included.length > 0 ? `${included.length} added` : null}
              {included.length > 0 && excluded.length > 0 ? " · " : null}
              {excluded.length > 0 ? `${excluded.length} removed` : null}
            </span>
          ) : null}
        </summary>
      <div className="flex flex-col gap-2 pt-2.5">
        <form
          action={addAction}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
            <Label htmlFor="addStudent" className="text-[11.5px] leading-tight">
              Add someone the filters missed
            </Label>
            <Input
              id="addStudent"
              name="addStudent"
              defaultValue={searchQuery}
              placeholder="Name or admission number"
              autoComplete="off"
              className="h-11 text-[13px] md:h-9"
            />
          </div>
          {/* A server action, so the tap has to say it landed — this form
              navigates, and on a phone a silent 400ms is a second tap. */}
          <PendingSubmitButton
            variant="outline"
            size="sm"
            className="max-md:h-11 px-4 md:h-9"
            pendingLabel="Finding…"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add
          </PendingSubmitButton>
          <CarriedFilterFields filters={filters} />
        </form>

        {matches.length > 0 ? (
          <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-2 p-2.5">
            <p className="text-[11.5px] font-semibold text-foreground">
              {matches.length} match{matches.length === 1 ? "" : "es"} for &ldquo;{searchQuery}
              &rdquo; — pick one:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {matches.map((brief) => (
                <Link
                  key={brief.studentId}
                  href={`?${reminderQuery(filters, {
                    include: [...filters.includeStudentIds, brief.studentId].join(","),
                  }).toString()}`}
                  scroll={false}
                  prefetch={false}
                  className="focus-ring inline-flex min-h-9 items-center rounded-full border border-border bg-card px-3 text-[11.5px] font-semibold hover:border-border-strong"
                >
                  {brief.studentName} · {brief.admissionNo} · {brief.studentClass}
                  {brief.phoneOnRecord ? "" : " · no phone"}
                </Link>
              ))}
            </div>
          </div>
        ) : searchQuery && included.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground">
            Nobody in this session matches &ldquo;{searchQuery}&rdquo;.
          </p>
        ) : null}

        {handPicked > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {included.map((brief) => (
              <StudentChip
                key={brief.studentId}
                brief={brief}
                tone="included"
                title="Remove from the list"
                href={without("include", brief.studentId)}
              />
            ))}
            {excluded.map((brief) => (
              <StudentChip
                key={brief.studentId}
                brief={brief}
                tone="excluded"
                title="Put back on the list"
                href={without("exclude", brief.studentId)}
              />
            ))}
          </div>
        ) : null}

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Someone added by hand joins the list whatever the filters and their reminder cadence say —
          naming them is the more recent decision. It cannot get past the three things that mean a
          family is uncontactable: off the roll having never paid, flagged no-call, or no usable
          number.
        </p>
      </div>
      </details>
    </div>
  );
}

/**
 * The keys the Narrow-down form owns. Everything else — the tiles, the notice,
 * the language, the deadline, the hand-picked students — rides along as a
 * hidden input, or pressing Apply would reset choices the office made, all of
 * which a parent then reads.
 */
const FILTER_FORM_KEYS = [
  "paid",
  "minDueAmount",
  "lateFee",
  "promise",
  "skipOverdue",
  "classId",
  "includeRte",
] as const satisfies readonly ReminderQueryKey[];

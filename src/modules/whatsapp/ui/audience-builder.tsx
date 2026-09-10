import Link from "next/link";
import type { ReactNode } from "react";
import { Plus, RotateCcw, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { PendingSubmitButton } from "@/ui/shell/pending-submit-button";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { SelectNative } from "@/ui/primitives/select-native";
import { cn } from "@/platform/utils";
import {
  AUDIENCE_SHORTCUTS,
  describeAudience,
  INSTALLMENT_MATCHES,
  matchingShortcut,
  OVERDUE_OPTIONS,
  PROMISE_OPTIONS,
  QUOTE_BASES,
  reminderQuery,
  shortcutHref,
  TRI_OPTIONS,
  type AudienceShortcutKey,
  type ReminderQueryKey,
} from "@/modules/whatsapp/domain/audience";
import type { ReminderAudience, ReminderFilters } from "@/modules/whatsapp/domain/fee-reminders";
import type { StudentBrief } from "@/modules/whatsapp/data/student-lookup";
import { CarriedFilterFields } from "@/modules/whatsapp/ui/carried-filter-fields";

/**
 * Who gets this message — one sentence, five chips, and everything else folded
 * away until it is asked for.
 *
 * A SERVER component, and that is not a style choice. `/protected/reminders`
 * has ~480 gzip bytes of headroom against its ceiling in
 * `quality/route-bundle-baseline.json`, and that file's rule is that ceilings
 * ratchet down. Everything here is a GET form, a `<Link>` or a server action —
 * none of which needs a byte of client JavaScript — so the whole audience
 * builder costs the browser nothing. The Fine-tune disclosure is a `<details>`
 * for the same reason: a collapsed `<details>` still submits the inputs inside
 * it, so folding the panel away costs neither state nor a second form.
 *
 * What this looked like until 2026-09-10, and why it changed. The office's word
 * for it was "confusing", three times over:
 *
 * - **Nine chips, four of them furniture.** Two ("Promised, due now", "Promise
 *   broken") could not match a single family, because there are no promises on
 *   record at all. One ("Everyone who owes") was the 479-family audience that a
 *   reminder must never mean. See `AUDIENCE_SHORTCUTS` for where each went.
 * - **Twelve controls above the list.** All twelve survive — the office builds
 *   real audiences with them ("installments 1 and 2 pending, paid so far at
 *   most ₹1,100") — but they are behind Fine-tune now, because ten selects
 *   between the question and the answer is not a simpler screen for having
 *   every lever on it.
 * - **A summary line that named the fields, not the decision.** `Inst 1+2 all ·
 *   paid ≤ 1100 · overdue yes` is accurate and unusable. `describeAudience`
 *   states the claim instead.
 *
 * One thing that has NOT changed and must not: only these filters decide the
 * list. Picking a template never moves a family on or off it.
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
   * What today makes of the fee calendar — the same values `presetFor` needs.
   *
   * Passed in rather than recomputed: a shortcut's href has to describe the
   * SAME filters the audience was counted with, or a chip reading 345 lands on
   * a different 345.
   */
  calendarArgs: { activeInstallments: readonly number[]; nextInstallment: number | null };
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
 * The two questions worth asking on the way past: which class, and how small an
 * amount is still worth a message.
 *
 * Top level rather than behind Fine-tune because they are the two the office
 * changes on an ordinary run — a class teacher's list, or "don't chase anyone
 * for under ₹500".
 */
function PrimaryFields({
  filters,
  classOptions,
}: {
  filters: ReminderFilters;
  classOptions: ReminderAudience["classOptions"];
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
      <Field id="classId" label="Class">
        <SelectNative
          id="classId"
          name="classId"
          defaultValue={filters.classId ?? ""}
          className={CONTROL}
        >
          <option value="">All classes</option>
          {/* Counted before the class filter is applied, so picking a class does
              not empty the dropdown that picked it. */}
          {classOptions.map((option) => (
            <option key={option.classId} value={option.classId}>
              {option.label} ({option.count})
            </option>
          ))}
        </SelectNative>
      </Field>

      <Field id="minDueAmount" label="Amount at least" hint="Skip anyone owing less.">
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
    </div>
  );
}

/**
 * Everything else. Folded away, never removed.
 *
 * Each of these decided an audience on its own before the chips were cut down
 * to five, so this is where the four dropped shortcuts still live: "Everyone
 * who owes" is the overdue select on "All open dues", "Part paid, still owing"
 * is the paid-so-far floor, and the promise pair is the promise dropdown.
 */
function FineTuneFields({ filters }: { filters: ReminderFilters }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 md:grid-cols-4 lg:grid-cols-6">
      <Field
        id="overdue"
        label="Overdue installment"
        hint="The default. A reminder is about money that is late."
        className="col-span-2"
      >
        {/* Its own option list, in the app's own words — "Overdue only" and
            "All open dues" are what the Defaulters screen says, and "Not due
            yet" is what the student list says. This control read "Past a due
            date / Either / Yes / No", a phrasing used nowhere else. */}
        <SelectNative
          id="overdue"
          name="overdue"
          defaultValue={filters.overdue}
          className={CONTROL}
        >
          {OVERDUE_OPTIONS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </SelectNative>
      </Field>

      <Field
        id="quote"
        label="Message quotes"
        hint="The figure the parent reads."
        className="col-span-2"
      >
        <SelectNative id="quote" name="quote" defaultValue={filters.quote} className={CONTROL}>
          {QUOTE_BASES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </SelectNative>
      </Field>

      <Field
        id="promise"
        label="Promise to pay"
        hint="The office's own contact log."
        className="col-span-2"
      >
        <SelectNative id="promise" name="promise" defaultValue={filters.promise} className={CONTROL}>
          {PROMISE_OPTIONS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </SelectNative>
      </Field>

      <Field
        id="installmentMatch"
        label="Installments still carrying fees"
        className="col-span-2 lg:col-span-3"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {[1, 2, 3, 4].map((installment) => {
            const on = filters.installments.includes(installment);
            return (
              // The whole pill is the tap target. A 16px box is not one.
              <label
                key={installment}
                className={cn(
                  "focus-within:ring-accent/40 flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 text-[12.5px] font-bold transition-colors focus-within:ring-2 md:min-h-9",
                  on
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                <input
                  type="checkbox"
                  name="installments"
                  value={String(installment)}
                  defaultChecked={on}
                  className="size-3.5 rounded border-border-strong accent-accent"
                />
                {installment}
              </label>
            );
          })}
          {/* "all" is "nothing has been received on any of these"; "any" is
              "still owing on at least one". Asking the wrong one is what put 87
              fully paid-up families on the live balance list. */}
          <SelectNative
            id="installmentMatch"
            name="installmentMatch"
            defaultValue={filters.installmentMatch}
            className="h-11 w-full text-[13px] md:h-9 md:w-44"
          >
            {INSTALLMENT_MATCHES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </SelectNative>
        </div>
      </Field>

      <Field id="maxTotalPaid" label="Paid so far, at most" hint="Blank: no ceiling.">
        <Input
          id="maxTotalPaid"
          name="maxTotalPaid"
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="no limit"
          defaultValue={filters.maxTotalPaid ?? ""}
          className={CONTROL}
        />
      </Field>

      <Field id="minTotalPaid" label="Paid so far, over" hint="Blank: no floor.">
        <Input
          id="minTotalPaid"
          name="minTotalPaid"
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="no limit"
          defaultValue={filters.minTotalPaid ?? ""}
          className={CONTROL}
        />
      </Field>

      <Field id="lateFee" label="Late fee charged">
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

      <Field id="carryForward" label="Last session's balance">
        <SelectNative
          id="carryForward"
          name="carryForward"
          defaultValue={filters.carryForward}
          className={CONTROL}
        >
          {TRI_OPTIONS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </SelectNative>
      </Field>

      <label className="col-span-2 flex min-h-11 items-center gap-2 text-[12.5px] font-semibold md:min-h-0">
        <input
          type="checkbox"
          name="includeRte"
          defaultChecked={filters.includeRte}
          className="size-4 rounded border-border-strong accent-accent"
        />
        Include RTE students
      </label>
    </div>
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
  calendarArgs,
  addAction,
}: Props) {
  /** Which shortcut the current filters are, or null when narrowed by hand. */
  const activeShortcut: AudienceShortcutKey | null = matchingShortcut(filters, calendarArgs);
  /** Drop `id` from a comma list in the query string, keeping everything else. */
  const without = (key: "include" | "exclude", id: string) => {
    const source = key === "include" ? filters.includeStudentIds : filters.excludeStudentIds;
    const next = source.filter((value) => value !== id);
    return `?${reminderQuery(filters, { [key]: next.join(",") || null }).toString()}`;
  };

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
    // messaged too recently. The chip counts these families and the send does
    // not, so the sentence has to account for them or the two numbers look
    // like they disagree.
    heldByCadence: audience.paused.filter((family) => family.reason !== "promise_open").length,
    className:
      audience.classOptions.find((option) => option.classId === filters.classId)?.label ?? null,
  });

  const handPicked = included.length + excluded.length;
  /**
   * Open Fine-tune when it is doing something, so a narrowed list never hides
   * why. Everything here is off in the default audience, which is what makes a
   * closed disclosure honest on an ordinary run.
   */
  const fineTuned =
    filters.installments.length > 0 ||
    filters.maxTotalPaid !== null ||
    filters.minTotalPaid !== null ||
    filters.lateFee !== "any" ||
    filters.carryForward !== "any" ||
    filters.promise !== "skip_open" ||
    filters.includeRte;

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
          Only these filters decide the list. Changing the message above never changes it.
        </p>
      </div>

      {/* ------------------------------------------------------- the sentence */}
      {/* The answer to "who is eligible", in words, above the controls that
          decide it. This is the line that replaced `Inst 1+2 all · paid ≤ 1100
          · overdue yes`. */}
      <p
        aria-live="polite"
        className="rounded-lg border border-accent/25 bg-accent/[0.06] px-3 py-2.5 text-[12.5px] font-semibold leading-relaxed text-foreground"
      >
        {sentence}
      </p>

      {/* --------------------------------------------------- audience shortcuts */}
      {/* Five, in escalation order, named for WHO they describe. `no-scrollbar`
          because Windows Chrome paints a persistent grey bar under an
          `overflow-x-auto` row; above `md` it wraps instead. */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        {AUDIENCE_SHORTCUTS.map((entry) => {
          const active = entry.key === activeShortcut;
          const count = audience.counts[entry.key] ?? 0;
          return (
            <Link
              key={entry.key}
              href={shortcutHref(filters, entry.key, calendarArgs)}
              scroll={false}
              prefetch={false}
              title={entry.hint}
              aria-current={active ? "true" : undefined}
              className={cn(
                "focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-bold transition-colors",
                active
                  ? "border-accent bg-accent/12 text-foreground"
                  : "border-border bg-surface-2 text-foreground hover:border-border-strong",
                // Dims the chrome, never the label. `opacity-45` here would
                // take 12.5px bold text to 2.88:1 against 4.5 required — the
                // same violation the smoke sweep found on the students
                // segment chips, which this row was copied from.
                count === 0 && !active && "border-border/60 bg-surface-2 text-muted-foreground",
              )}
            >
              <span className="whitespace-nowrap">{entry.label}</span>
              <span
                className={cn(
                  "tabular-nums text-[11px] font-extrabold",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {count}
              </span>
            </Link>
          );
        })}
        {/* Nothing matches, so the office narrowed it by hand. Saying so beats
            leaving every chip unselected for no visible reason. */}
        {activeShortcut === null ? (
          <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-accent bg-accent/12 px-3.5 text-[12px] font-bold text-foreground">
            Custom
            <span className="tabular-nums text-[11px] font-extrabold">
              {audience.candidates.length}
            </span>
          </span>
        ) : null}
      </div>

      {/* ------------------------------------------------------------ filters */}
      {/* ONE form at every viewport. There were two — a phone `<details>` and a
          desk grid — which meant every control existed twice in the DOM and
          every `<Label htmlFor>` needed an `idPrefix` to avoid pointing at a
          duplicated id. Folding the rare controls away instead of the whole
          panel makes the second copy unnecessary: the phone now sees the
          sentence, the chips, the class and the minimum without a tap.

          The `<details>` sits INSIDE the form deliberately. A collapsed
          `<details>` still submits the inputs within it, so Fine-tune keeps its
          values through Apply with no hidden mirror and no client state. */}
      <form method="get" className="flex flex-col gap-3">
        <PrimaryFields filters={filters} classOptions={audience.classOptions} />

        <details open={fineTuned} className="rounded-lg border border-border bg-surface-2/60">
          <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-[12.5px] font-bold text-foreground">
            {/* `shrink-0` and `whitespace-nowrap`, because at 390px the hint
                beside it squeezed the label into two lines reading "Fine-" /
                "tune". The hint is the half that should give way. */}
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              Fine-tune
            </span>
            <span className="truncate text-right text-[11px] font-semibold text-muted-foreground">
              {fineTuned ? "narrowed" : "installments, paid so far, promises"}
            </span>
          </summary>
          <div className="border-t border-border p-3">
            <FineTuneFields filters={filters} />
          </div>
        </details>

        <div className="flex items-center justify-end">
          <Button type="submit" variant="primary" size="sm" className="h-11 px-6 md:h-9">
            Apply
          </Button>
        </div>

        <CarriedFilterFields filters={filters} except={FILTER_FORM_KEYS} />
      </form>

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
          <form action={addAction} className="flex flex-wrap items-end gap-2">
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
              className="h-11 px-4 md:h-9"
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
            Someone added by hand joins the list whatever the filters and their reminder cadence say
            — naming them is the more recent decision. It cannot get past the three things that mean
            a family is uncontactable: off the roll having never paid, flagged no-call, or no usable
            number.
          </p>
        </div>
      </details>
    </div>
  );
}

/**
 * The keys the filter form owns. Everything else rides along as a hidden input,
 * or pressing Apply would reset the notice, the language, the deadline and the
 * hand-picked students — none of which the office chose, all of which a parent
 * then reads.
 *
 * Still all twelve after the Fine-tune fold: a collapsed `<details>` submits its
 * inputs, so the form owns exactly what it owned before. Moving a control into
 * Fine-tune and forgetting to leave its key here would make that control reset
 * itself on every Apply.
 */
const FILTER_FORM_KEYS = [
  "installments",
  "installmentMatch",
  "maxTotalPaid",
  "minTotalPaid",
  "minDueAmount",
  "lateFee",
  "overdue",
  "carryForward",
  "promise",
  "quote",
  "classId",
  "includeRte",
] as const satisfies readonly ReminderQueryKey[];

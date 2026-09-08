import Link from "next/link";
import type { ReactNode } from "react";
import { Plus, RotateCcw, X } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { PendingSubmitButton } from "@/ui/shell/pending-submit-button";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { SelectNative } from "@/ui/primitives/select-native";
import { cn } from "@/platform/utils";
import {
  INSTALLMENT_MATCHES,
  presetHref,
  PROMISE_OPTIONS,
  QUOTE_BASES,
  reminderQuery,
  TRI_OPTIONS,
  type ReminderQueryKey,
} from "@/modules/whatsapp/domain/audience";
import { NOTICE_SITUATIONS } from "@/modules/whatsapp/domain/campaigns";
import type { ReminderAudience, ReminderFilters } from "@/modules/whatsapp/domain/fee-reminders";
import type { StudentBrief } from "@/modules/whatsapp/data/student-lookup";
import { CarriedFilterFields } from "@/modules/whatsapp/ui/carried-filter-fields";

/**
 * Who gets this message — stated as filters, on every template, always visible.
 *
 * A SERVER component, and that is not a style choice. `/protected/reminders`
 * has ~480 gzip bytes of headroom against its ceiling in
 * `quality/route-bundle-baseline.json`, and that file's rule is that ceilings
 * ratchet down. Everything here is a GET form, a `<Link>` or a server action —
 * none of which needs a byte of client JavaScript — so the whole audience
 * builder costs the browser nothing. `holdoutControl` and `listActions` already
 * follow the same rule for the same reason.
 *
 * Three things this replaced, all consequences of the template having gated the
 * audience until 2026-09-08:
 *
 * - **Controls hidden per notice.** `SITUATION_FILTERS` hid the installment,
 *   paid-so-far and minimum fields on any notice whose rule ignored them, so
 *   the office could not see the levers it was not allowed to pull. Every
 *   filter now applies to every template.
 * - **A count on each template chip.** That count WAS the template's audience.
 *   The counts now belong to the presets, which is the only thing they can
 *   honestly describe.
 * - **No way to name a family.** Include and exclude ride the query string, so
 *   the send action rebuilds the identical list and the collection lists print
 *   it.
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
 * The filter controls, mounted twice — behind a disclosure on a phone, as the
 * desk grid above `md`.
 *
 * `idPrefix` is load-bearing, not decoration: both branches sit in the DOM at
 * every viewport, so without it every `<Label htmlFor>` would point at a
 * duplicated id. The two copies live in two separate `<form>` elements, so only
 * the one actually submitted contributes to the query string. Mounting twice
 * costs the browser nothing now that this renders on the server.
 */
function FilterFields({
  filters,
  classOptions,
  idPrefix,
}: {
  filters: ReminderFilters;
  classOptions: ReminderAudience["classOptions"];
  idPrefix: string;
}) {
  const tri = (
    key: "lateFee" | "overdue" | "carryForward",
    label: string,
    hint?: string,
  ) => (
    <Field id={`${idPrefix}${key}`} label={label} hint={hint}>
      <SelectNative
        id={`${idPrefix}${key}`}
        name={key}
        defaultValue={filters[key]}
        className={CONTROL}
      >
        {TRI_OPTIONS.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </SelectNative>
    </Field>
  );

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 md:grid-cols-4 lg:grid-cols-6">
      <Field
        id={`${idPrefix}installmentMatch`}
        label="Installments still carrying fees"
        className="col-span-2 lg:col-span-3"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {[1, 2, 3, 4].map((installment) => {
            const on = filters.installments.includes(installment);
            return (
              // The whole pill is the tap target. A 16px box is not one, and
              // this row is the control the office reaches for most.
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
            id={`${idPrefix}installmentMatch`}
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

      <Field
        id={`${idPrefix}quote`}
        label="Message quotes"
        hint="The figure the parent reads."
        className="col-span-2 lg:col-span-3"
      >
        <SelectNative
          id={`${idPrefix}quote`}
          name="quote"
          defaultValue={filters.quote}
          className={CONTROL}
        >
          {QUOTE_BASES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </SelectNative>
      </Field>

      <Field id={`${idPrefix}maxTotalPaid`} label="Paid so far, at most" hint="Blank: no ceiling.">
        <Input
          id={`${idPrefix}maxTotalPaid`}
          name="maxTotalPaid"
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="no limit"
          defaultValue={filters.maxTotalPaid ?? ""}
          className={CONTROL}
        />
      </Field>

      <Field id={`${idPrefix}minTotalPaid`} label="Paid so far, over" hint="Blank: no floor.">
        <Input
          id={`${idPrefix}minTotalPaid`}
          name="minTotalPaid"
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="no limit"
          defaultValue={filters.minTotalPaid ?? ""}
          className={CONTROL}
        />
      </Field>

      <Field id={`${idPrefix}minDueAmount`} label="Quoted amount at least">
        <Input
          id={`${idPrefix}minDueAmount`}
          name="minDueAmount"
          type="number"
          min={0}
          inputMode="numeric"
          defaultValue={filters.minDueAmount}
          className={CONTROL}
        />
      </Field>

      {tri("lateFee", "Late fee charged")}
      {tri("overdue", "Past a due date")}
      {tri("carryForward", "Last session's balance")}

      <Field
        id={`${idPrefix}promise`}
        label="Promise to pay"
        hint="The office's own contact log."
        className="col-span-2"
      >
        <SelectNative
          id={`${idPrefix}promise`}
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

      <Field id={`${idPrefix}classId`} label="Class" className="col-span-2">
        <SelectNative
          id={`${idPrefix}classId`}
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

      <div className="col-span-2 flex items-center justify-between gap-3 md:col-span-4 lg:col-span-6">
        <label className="flex min-h-11 items-center gap-2 text-[12.5px] font-semibold md:min-h-0">
          <input
            type="checkbox"
            name="includeRte"
            defaultChecked={filters.includeRte}
            className="size-4 rounded border-border-strong accent-accent"
          />
          Include RTE students
        </label>
        <Button type="submit" variant="primary" size="sm" className="h-11 px-6 md:h-9">
          Apply
        </Button>
      </div>
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
  addAction,
}: Props) {
  /** Drop `id` from a comma list in the query string, keeping everything else. */
  const without = (key: "include" | "exclude", id: string) => {
    const source = key === "include" ? filters.includeStudentIds : filters.excludeStudentIds;
    const next = source.filter((value) => value !== id);
    return `?${reminderQuery(filters, { [key]: next.join(",") || null }).toString()}`;
  };

  const summary = [
    filters.installments.length > 0
      ? `Inst ${filters.installments.join("+")} ${filters.installmentMatch === "all" ? "all" : "any"}`
      : "any installment",
    filters.maxTotalPaid !== null ? `paid ≤ ${filters.maxTotalPaid}` : null,
    filters.minTotalPaid !== null ? `paid > ${filters.minTotalPaid}` : null,
    filters.lateFee !== "any" ? `late fee ${filters.lateFee}` : null,
    filters.overdue !== "any" ? `overdue ${filters.overdue}` : null,
    filters.carryForward !== "any" ? `carry-forward ${filters.carryForward}` : null,
    audience.classOptions.find((option) => option.classId === filters.classId)?.label ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  const handPicked = included.length + excluded.length;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm md:rounded-lg md:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold text-foreground">Who gets it</h3>
        <p className="text-[11.5px] text-muted-foreground">
          The filters decide the list, not the template. Any message can go to any of them.
        </p>
      </div>

      {/* ------------------------------------------------------------ presets */}
      {/* One line on a 390px screen: scroll rather than wrap, so the row never
          reflows under a thumb mid-tap. `no-scrollbar` for the same reason the
          notice chips carry it — Windows Chrome paints a persistent grey bar
          under an `overflow-x-auto` row. Above `md` it wraps instead.
          A preset DROPS every audience key, so it is also the "put it back how
          it was" after narrowing by hand. */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        <span className="shrink-0 self-center pr-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Start from
        </span>
        {NOTICE_SITUATIONS.map((entry) => (
          <Link
            key={entry.value}
            href={presetHref(filters, entry.value)}
            scroll={false}
            prefetch={false}
            title={entry.hint}
            className={cn(
              "focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3.5 text-[12px] font-bold text-foreground transition-colors hover:border-border-strong",
              audience.counts[entry.value] === 0 && "opacity-45",
            )}
          >
            <span className="whitespace-nowrap">{entry.label}</span>
            <span className="tabular-nums text-[11px] font-extrabold text-muted-foreground">
              {audience.counts[entry.value]}
            </span>
          </Link>
        ))}
      </div>

      {/* ------------------------------------------------------------ filters */}
      {/* Collapsed on a phone with the applied summary on the tab, because ten
          controls above a 300-card list is nine screens of scrolling before the
          first family. Open on the desk, where there is room. */}
      <details className="md:hidden">
        <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 text-[12.5px] font-bold text-foreground">
          <span>Filters</span>
          <span className="max-w-[62%] truncate text-[11px] font-semibold text-muted-foreground">
            {summary}
          </span>
        </summary>
        <form method="get" className="pt-3.5">
          <FilterFields
            filters={filters}
            classOptions={audience.classOptions}
            idPrefix="m-"
          />
          <CarriedFilterFields
            filters={filters}
            except={FILTER_FORM_KEYS}
          />
        </form>
      </details>

      <form method="get" className="hidden md:block">
        <FilterFields filters={filters} classOptions={audience.classOptions} idPrefix="" />
        <CarriedFilterFields filters={filters} except={FILTER_FORM_KEYS} />
      </form>

      {/* ---------------------------------------------------- by hand */}
      <div className="flex flex-col gap-2 border-t border-border pt-3">
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
          Someone added by hand joins the list whatever the filters and their reminder cadence say —
          naming them is the more recent decision. It cannot get past the three things that mean a
          family is uncontactable: off the roll having never paid, flagged no-call, or no usable
          number.
        </p>
      </div>
    </div>
  );
}

/**
 * The keys the filter form owns. Everything else rides along as a hidden input,
 * or pressing Apply would reset the notice, the language, the deadline and the
 * hand-picked students — none of which the office chose, all of which a parent
 * then reads.
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

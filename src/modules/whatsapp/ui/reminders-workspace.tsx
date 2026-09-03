"use client";

import { useActionState, useMemo, useState } from "react";
import { AlertTriangle, MessageCircle, Send } from "lucide-react";

import {
  sendRemindersAction,
  type SendRemindersState,
} from "@/app/protected/reminders/actions";
import { PendingSubmitButton } from "@/ui/shell/pending-submit-button";
import { MobileEmptyRows, MobileNote, MobileRecordCard } from "@/ui/mobile/mobile-kit";
import {
  ReminderCadenceControl,
  ResumeReminderButton,
} from "@/modules/whatsapp/ui/reminder-controls";
import { Button } from "@/ui/primitives/button";
import { Checkbox } from "@/ui/primitives/checkbox";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { Notice } from "@/ui/primitives/notice";
import { SelectNative } from "@/ui/primitives/select-native";
import { useActionFeedback } from "@/ui/hooks/use-action-feedback";
import { formatInr } from "@/platform/helpers/currency";
import { cn } from "@/platform/utils";
import { cadenceLabel } from "@/modules/whatsapp/domain/reminder-cadence";
import {
  installmentPhrase,
  NOTICE_SITUATIONS,
} from "@/modules/whatsapp/domain/campaigns";
import { NoticePicker } from "@/modules/whatsapp/ui/notice-picker";
import { SITUATION_FILTERS } from "@/modules/whatsapp/domain/campaigns";
import type { ReminderAudience, ReminderFilters } from "@/modules/whatsapp/domain/fee-reminders";

type Props = {
  filters: ReminderFilters;
  audience: ReminderAudience;
  canSend: boolean;
  campaignName: string | null;
  /** Composed server-side against the live fee policy. Null when they agree. */
  lateFeeWarning: string | null;
  /** Set when the office arrived via a saved campaign's Load button. */
  savedCampaign: { id: string; name: string } | null;
  /**
   * One line saying who this notice is about, and the wording for the families
   * it is not about.
   *
   * Props rather than a lookup here, because both are a single read keyed by a
   * situation the SERVER already knows. Shipping all seven of each to the
   * browser to pick one is ~900 gzip bytes of copy nobody reads, on a route
   * whose ceiling in `quality/route-bundle-baseline.json` only ratchets down.
   */
  situationRule: string;
  notThisNotice: string;
  /**
   * The body the top family on the list will read, rendered on the server.
   *
   * Was `campaignFor(...).renderPreview(...)` right here, which was wrong twice
   * over. `campaignFor` THROWS for a notice awaiting Meta approval, so
   * `?situation=upcoming` in a hand-edited URL took the whole screen down inside
   * a client render — the very thing `parseReminderFilters` falls back rather
   * than throws to prevent. And it pulled every approved template body into the
   * browser to render one of them, on a route with a gzip ceiling.
   *
   * Null when the selected notice has no sendable campaign, which is exactly
   * when there is no message to preview.
   */
  previewBody: string | null;
};

const IDLE_SEND: SendRemindersState = { status: "idle" };

const SKIP_LABELS: Array<{ key: keyof ReminderAudience["skipped"]; label: string }> = [
  { key: "leftAndNeverPaid", label: "left and never paid" },
  { key: "noCallFlagged", label: "flagged no-call by the office" },
  { key: "rteStudent", label: "RTE students" },
  { key: "belowMinimum", label: "below the minimum amount" },
  { key: "noPhoneOnRecord", label: "no phone on record" },
  { key: "phoneUnusable", label: "phone number unusable" },
  // Named in the office's own terms. This is not the ledger saying nothing is
  // owed — it is the family having already said when they will pay.
  { key: "promiseOpen", label: "inside a promise they have already given" },
  { key: "whatsappNever", label: "set to never remind" },
  { key: "whatsappSnoozed", label: "skipped for now" },
  { key: "whatsappTooSoon", label: "messaged too recently for their cadence" },
];

/**
 * The filter controls, rendered once and mounted twice — collapsed behind a
 * disclosure on a phone, as the desk grid above `md`.
 *
 * `idPrefix` is load-bearing, not decoration: both branches sit in the DOM at
 * every viewport, so without it every `<Label htmlFor>` on the page would point
 * at a duplicated id. The two copies live in two separate `<form>` elements, so
 * only the one actually submitted contributes to the query string.
 *
 * WHICH controls appear depends on the notice, from `SITUATION_FILTERS`. A
 * control the notice ignores is hidden rather than disabled, and its value goes
 * along as a hidden input — a filter the office set on one notice must survive a
 * trip through a notice that had no use for it, and a dropdown that reads as
 * applied while doing nothing is how 87 families got chased for installments
 * that were not due yet.
 */
function ReminderFilterFields({
  idPrefix,
  filters,
  classOptions,
}: {
  idPrefix: string;
  filters: ReminderFilters;
  classOptions: ReminderAudience["classOptions"];
}) {
  const applies = SITUATION_FILTERS[filters.situation];

  return (
    <>
      {applies.paidSoFar ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}maxTotalPaid`}>{applies.paidSoFar}</Label>
          <Input
            id={`${idPrefix}maxTotalPaid`}
            name="maxTotalPaid"
            type="number"
            min={0}
            defaultValue={filters.maxTotalPaid}
          />
        </div>
      ) : (
        <input type="hidden" name="maxTotalPaid" value={filters.maxTotalPaid} />
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}minDueAmount`}>{applies.minDue}</Label>
        <Input
          id={`${idPrefix}minDueAmount`}
          name="minDueAmount"
          type="number"
          min={0}
          defaultValue={filters.minDueAmount}
        />
      </div>

      {applies.installments ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}installments`}>{applies.installments}</Label>
          <SelectNative
            id={`${idPrefix}installments`}
            name="installments"
            defaultValue={filters.installments.join(",")}
          >
            <option value="1,2">1 and 2</option>
            <option value="1">1 only</option>
            <option value="2">2 only</option>
            <option value="1,2,3">1, 2 and 3</option>
            <option value="3">3 only</option>
          </SelectNative>
        </div>
      ) : (
        <input type="hidden" name="installments" value={filters.installments.join(",")} />
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}classId`}>Class</Label>
        <SelectNative id={`${idPrefix}classId`} name="classId" defaultValue={filters.classId ?? ""}>
          <option value="">All classes</option>
          {classOptions.map((option) => (
            <option key={option.classId} value={option.classId}>
              {option.label} ({option.count})
            </option>
          ))}
        </SelectNative>
      </div>

      {/* Which notice, which language and which date all live on the picker card,
          which is a different <form>. Without these, pressing Apply here would
          submit a query string missing all three — throwing the office back to the
          fee-due notice in Hindi with the default deadline, silently, in the middle
          of choosing who to send to. */}
      <input type="hidden" name="situation" value={filters.situation} />
      <input type="hidden" name="language" value={filters.language} />
      <input type="hidden" name="lastDate" value={filters.lastDate} />
      {/* The window decides which installments the calendar calls active, so it
          changes the audience and must travel with the rest of them. */}
      <input type="hidden" name="preDueWindowDays" value={filters.preDueWindowDays} />
      <input type="hidden" name="lateFeeAmount" value={filters.lateFeeAmount} />
      <input type="hidden" name="lateFeeBasis" value={filters.lateFeeBasis} />

      <div className="flex items-end gap-3 max-md:pt-1">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="includeRte"
            defaultChecked={filters.includeRte}
            className="size-4 rounded border-border-strong"
          />
          Include RTE
        </label>
        <Button type="submit" variant="outline" size="sm">
          Apply
        </Button>
      </div>
    </>
  );
}

export function RemindersWorkspace({
  filters,
  audience,
  canSend,
  campaignName,
  lateFeeWarning,
  savedCampaign,
  situationRule,
  notThisNotice,
  previewBody,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [sendState, sendFormAction] = useActionState(sendRemindersAction, IDLE_SEND);

  // Announce the result and re-derive the list, so the families just messaged
  // drop off on their own. `partial` is a warning status in the hook, which is
  // right: the send DID happen for some, and the failures are named in the
  // notice below rather than being flattened into a success.
  useActionFeedback(sendState, {
    successTitle: "Reminders sent",
    warningTitle: "Sent, with failures",
    errorTitle: "Nothing was sent",
  });

  // A family already messaged today cannot be messaged again — the unique index
  // would reject it anyway, so the checkbox says so up front rather than
  // letting staff select a row that will silently come back as "already sent".
  const selectable = useMemo(
    () => audience.candidates.filter((candidate) => !candidate.sentToday),
    [audience.candidates],
  );

  const toggle = (studentId: string) => {
    setConfirming(false);
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const selectAll = () => {
    setConfirming(false);
    setSelected(new Set(selectable.map((candidate) => candidate.studentId)));
  };

  const clearAll = () => {
    setConfirming(false);
    setSelected(new Set());
  };

  const selectedCandidates = audience.candidates.filter((candidate) =>
    selected.has(candidate.studentId),
  );
  const selectedTotal = selectedCandidates.reduce(
    (sum, candidate) => sum + candidate.dueAmount,
    0,
  );
  const sample = selectedCandidates[0] ?? audience.candidates[0] ?? null;

  // A live summary rather than an "N applied" count: a count would need
  // DEFAULT_REMINDER_FILTERS to know what "applied" means, and that constant
  // lives in the server-only module this client component may not import.
  const situationLabel =
    NOTICE_SITUATIONS.find((entry) => entry.value === filters.situation)?.label ?? "Notice";

  // The chip on the phone disclosure summarises what is applied. It must not
  // claim an installment filter on `prevyear`, which ignores one.
  const filterSummary = [
    situationLabel,
    SITUATION_FILTERS[filters.situation].installments
      ? `Inst ${filters.installments.join(" & ")}`
      : null,
    audience.classOptions.find((option) => option.classId === filters.classId)?.label ??
      "All classes",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      {/* ------------------------------------------------------------ the notice */}
      {/* Above the filters on purpose: which notice is going out decides the whole
          list, and the filters only trim it. On a phone this is the first thing
          under the header. */}
      {audience.candidates.length > 0 && selectable.length === 0 ? (
        // First thing on the screen, not buried under the filters: it explains
        // why every row below is greyed and why "Select all" reads 0.
        <div className="max-md:order-0">
          <Notice tone="success" title="Everyone on this list has been messaged today">
            <p>
              All {audience.candidates.length} of them, through{" "}
              <span className="font-mono">{campaignName}</span>. The same notice cannot go to a
              family twice in one day, which is why nothing below can be ticked.
            </p>
            <p className="mt-1.5">
              A <strong>different</strong> notice still can — the chips below show how many each
              would reach — and the list rebuilds tomorrow without whoever pays tonight.
            </p>
          </Notice>
        </div>
      ) : null}

      <form
        method="get"
        className="rounded-xl border border-border bg-card p-3.5 shadow-sm max-md:order-1 md:rounded-lg md:p-4"
      >
        {savedCampaign ? (
          <p className="-mt-0.5 mb-2.5 text-xs text-muted-foreground">
            Running the saved campaign{" "}
            <strong className="font-semibold text-foreground">{savedCampaign.name}</strong>. The
            list below is rebuilt from today&rsquo;s ledger, so anyone who has paid since the last run is
            already gone from it.
          </p>
        ) : null}
        <NoticePicker
          filters={filters}
          counts={audience.counts}
          dateFieldId="lastDate"
          lateFeeWarning={lateFeeWarning}
        />
        {/* The picker's links carry the other filters; these keep them on the
            date form too, so submitting a date does not reset the notice. */}
        <input type="hidden" name="situation" value={filters.situation} />
        <input type="hidden" name="language" value={filters.language} />
        <input type="hidden" name="maxTotalPaid" value={filters.maxTotalPaid} />
        <input type="hidden" name="minDueAmount" value={filters.minDueAmount} />
        <input type="hidden" name="installments" value={filters.installments.join(",")} />
        <input type="hidden" name="preDueWindowDays" value={filters.preDueWindowDays} />
        <input type="hidden" name="classId" value={filters.classId ?? ""} />
        {filters.includeRte ? <input type="hidden" name="includeRte" value="on" /> : null}
      </form>

      {/* ---------------------------------------------------------------- filters */}
      <details className="rounded-xl border border-border bg-card shadow-sm max-md:order-2 md:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground">
          <span>Filters</span>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            {filterSummary}
          </span>
        </summary>
        <div className="border-t border-border px-4 py-4">
          <form method="get" className="grid gap-4">
            <ReminderFilterFields
              idPrefix="m-"
              filters={filters}
              classOptions={audience.classOptions}
            />
          </form>
        </div>
      </details>

      <form
        method="get"
        // Auto-fit rather than a fixed five: `prevyear` hides two of the
        // controls, and a fixed count would leave holes in the row.
        className="hidden flex-wrap items-end gap-4 rounded-lg border border-border bg-surface-2 p-4 md:flex [&>div]:min-w-[9rem] [&>div]:max-w-[15rem] [&>div]:flex-1"
      >
        <ReminderFilterFields idPrefix="" filters={filters} classOptions={audience.classOptions} />
      </form>

      {/* --------------------------------------------------------------- who is out */}
      {/* The rule first, then the count. "Why is this family not here" is the
          question the office actually asks, and a list of exclusion counts
          answers it only if you already know what the notice is looking for. */}
      <p className="-mt-3 text-sm text-muted-foreground max-md:order-5 max-md:-mt-1">
        <strong className="font-semibold text-foreground">Who is on this list:</strong>{" "}
        {situationRule}
      </p>

      <p className="-mt-3 text-sm text-muted-foreground max-md:order-5">
        Excluded by these filters:{" "}
        {[
          { count: audience.skipped.installmentsClear, label: notThisNotice },
          ...SKIP_LABELS.map((entry) => ({
            count: audience.skipped[entry.key],
            label: entry.label,
          })),
        ]
          .filter((entry) => entry.count > 0)
          .map((entry) => `${entry.count} ${entry.label}`)
          .join(" · ") || "nobody"}
        .
      </p>

      {/* ------------------------------------------------------------ paused */}
      {audience.paused.length > 0 ? (
        <details className="rounded-lg border border-border bg-surface-2 p-4 text-sm max-md:order-6">
          <summary className="cursor-pointer font-medium">
            {audience.paused.length} famil{audience.paused.length === 1 ? "y is" : "ies are"} being
            held back by your settings — tap to review or undo
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            These owe money and would otherwise be on the list. Nothing here is permanent: a skip
            expires on its own, and a cadence can be changed back at any time.
          </p>
          <ul className="mt-3 space-y-2">
            {audience.paused.map((family) => (
              <li
                key={family.studentId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">
                    {family.studentName}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {family.studentClass} · {formatInr(family.dueAmount)}
                    </span>
                  </p>
                  <p className="text-[11.5px] text-muted-foreground">
                    {family.reason === "never"
                      ? "Set to never remind"
                      : family.reason === "snoozed"
                        ? `Skipped until ${family.returnsOn}`
                        : family.reason === "promise_open"
                          ? `Promised to pay by ${family.returnsOn}`
                          : `${cadenceLabel(family.cadence)} — next reminder from ${family.returnsOn}`}
                  </p>
                </div>
                {canSend ? <ResumeReminderButton studentId={family.studentId} /> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {audience.unreachable.length > 0 ? (
        <details className="rounded-lg border border-border bg-surface-2 p-4 text-sm max-md:order-6">
          <summary className="cursor-pointer font-medium">
            {audience.unreachable.length} families have no phone number at all — they need a call
          </summary>
          <ul className="mt-3 grid gap-1 md:grid-cols-2">
            {audience.unreachable.map((entry) => (
              <li key={entry.admissionNo + entry.studentName} className="text-muted-foreground">
                {entry.admissionNo} · {entry.studentName} · {entry.studentClass}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* ------------------------------------------------------------------ results */}
      {sendState.status === "success" || sendState.status === "partial" ? (
        <Notice
          tone={sendState.status === "partial" ? "warning" : "success"}
          title="Send finished"
          className="max-md:order-3"
        >
          <p>{sendState.message}</p>
          {sendState.failures && sendState.failures.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm">
              {sendState.failures.map((failure) => (
                <li key={failure.admissionNo}>
                  <strong>{failure.admissionNo}</strong> {failure.studentName} — {failure.error}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 text-sm">
            The list has been re-read from the ledger, so the families just messaged are already
            gone from it.
          </p>
        </Notice>
      ) : null}

      {sendState.status === "error" ? (
        <Notice tone="danger" title="Nothing was sent" className="max-md:order-3">
          {sendState.message}
        </Notice>
      ) : null}

      {/* -------------------------------------------------------------------- list */}
      <form action={sendFormAction} className="max-md:order-4">
        <input type="hidden" name="maxTotalPaid" value={filters.maxTotalPaid} />
        <input type="hidden" name="minDueAmount" value={filters.minDueAmount} />
        <input type="hidden" name="installments" value={filters.installments.join(",")} />
        <input type="hidden" name="preDueWindowDays" value={filters.preDueWindowDays} />
        <input type="hidden" name="classId" value={filters.classId ?? ""} />
        {filters.includeRte ? <input type="hidden" name="includeRte" value="on" /> : null}
        {/* The notice decides the audience the action rebuilds. Without these the
            send would re-derive the DEFAULT notice and message a different set of
            families than the office ticked. */}
        <input type="hidden" name="situation" value={filters.situation} />
        <input type="hidden" name="language" value={filters.language} />
        <input type="hidden" name="lastDate" value={filters.lastDate} />
        <input type="hidden" name="lateFeeAmount" value={filters.lateFeeAmount} />
        <input type="hidden" name="lateFeeBasis" value={filters.lateFeeBasis} />
        {/* ----------------------------------------------------- holdout */}
        {/* Behind a <details> so it is never the thing somebody sets by accident
            on the way to Send. Off unless opened AND typed into. */}
        {canSend ? (
          <details className="rounded-lg border border-dashed border-border bg-surface-2 px-3 py-2">
            <summary className="min-h-11 cursor-pointer list-none py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Hold some families back, to measure this
            </summary>
            <div className="flex flex-col gap-2 pb-2">
              <p className="text-xs text-muted-foreground">
                This run says who paid <em>after</em> a reminder, never because of it — payments
                are spiky and no join can tell a response apart from a batch of counter cash.
                Holding a random share back is the only way to find out.
              </p>
              <p className="text-xs font-semibold text-warning-foreground">
                It also means deliberately not chasing money these families owe. They get no
                message and no second chance in this run.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="holdoutPercent">Hold back</Label>
                  <SelectNative
                    id="holdoutPercent"
                    name="holdoutPercent"
                    defaultValue="0"
                    className="w-40"
                  >
                    <option value="0">Nobody (default)</option>
                    <option value="5">5% of the list</option>
                    <option value="10">10% of the list</option>
                    <option value="20">20% of the list</option>
                  </SelectNative>
                </div>
                <p className="text-xs text-muted-foreground">
                  Rounded down, and never everybody. The run page compares them afterwards.
                </p>
              </div>
            </div>
          </details>
        ) : null}

        {/* Ties the run to the saved campaign it came from. Absent for an ad-hoc
            send, which is still a run — just an unnamed one. */}
        {savedCampaign ? (
          <input type="hidden" name="campaignId" value={savedCampaign.id} />
        ) : null}
        {[...selected].map((studentId) => (
          <input key={studentId} type="hidden" name="studentId" value={studentId} />
        ))}

        <div className="mb-3 hidden flex-wrap items-center gap-3 md:flex">
          <Button type="button" variant="outline" size="sm" onClick={selectAll}>
            Select all {selectable.length}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
            Clear
          </Button>
          <span className="text-sm text-muted-foreground">
            {selected.size} selected · {formatInr(selectedTotal)} of dues behind them
          </span>
        </div>

        <div className="mb-2.5 flex items-center justify-between gap-2 md:hidden">
          <span className="text-[11.5px] font-semibold text-muted-foreground">
            {selected.size} of {selectable.length} picked
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={selectAll}>
              Select all
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
              Clear
            </Button>
          </div>
        </div>

        {/* The desk table says "Message says due" in a column header. A card has
            no header to lean on, so the rule is stated once here instead of on
            every card. */}
        <MobileNote className="mb-2.5 md:hidden">
          {filters.situation === "prevyear"
            ? "The amount on each card is last session's balance still outstanding. It carries no late fee."
            : filters.situation === "balance"
              ? "The amount on each card is what is still owed on this session's installments, after everything received."
              : `The amount on each card is the figure the message will quote — ${installmentPhrase(filters.installments, "en").toLowerCase()} of this session only, never last year's carry-forward.`}
        </MobileNote>

        <ul
          className="flex flex-col gap-2.5 md:hidden"
          // Constant, even with the bar absent, so the list does not jump when
          // the first family is ticked. 7.5rem because the bar grows to two rows
          // in the confirm state.
          //
          // `/protected/reminders` became a top-level tab on 22 Aug 2026, so it
          // is NO LONGER a mobile takeover: the tab bar renders, the send bar
          // sits above it, and the last card has to clear both.
          style={{
            paddingBottom:
              "calc(var(--mobile-bottom-nav-offset, 0px) + var(--mobile-safe-area-bottom, 0px) + 7.5rem)",
          }}
        >
          {audience.candidates.map((candidate) => {
            const already = Boolean(candidate.sentToday);
            const picked = selected.has(candidate.studentId);
            const locked = already || !canSend;

            return (
              <MobileRecordCard
                key={candidate.studentId}
                className={already ? "opacity-60" : undefined}
                title={candidate.studentName}
                subtitle={`${candidate.studentClass} · ${candidate.parentName}`}
                amount={formatInr(candidate.dueAmount)}
                status={
                  already ? (
                    <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {candidate.sentToday?.status === "sent"
                        ? "Sent today"
                        : candidate.sentToday?.status}
                    </span>
                  ) : null
                }
                fields={[
                  { label: "Adm", value: candidate.admissionNo },
                  {
                    label: "Number",
                    value: `${candidate.destination}${candidate.usedMotherPhone ? " (mother)" : ""}`,
                  },
                  { label: "Paid so far", value: formatInr(candidate.totalPaid) },
                ]}
                actions={
                  <>
                  <label className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 text-[12.5px] font-semibold">
                    {/* No `name` — the selection travels via the hidden
                        studentId inputs above. A name here would post a second,
                        unfiltered copy of it. A raw input rather than the Radix
                        Checkbox because that renders a <button role="checkbox">,
                        which a wrapping <label> does not reliably activate. */}
                    <input
                      type="checkbox"
                      className="size-5 shrink-0 rounded border-border-strong accent-accent"
                      checked={picked}
                      onChange={() => toggle(candidate.studentId)}
                      disabled={locked}
                      aria-label={`Select ${candidate.studentName}`}
                    />
                    <span className={locked ? "text-muted-foreground" : "text-foreground"}>
                      {already
                        ? "Already messaged today"
                        : !canSend
                          ? "Sending is off"
                          : picked
                            ? "Selected"
                            : "Select for this send"}
                    </span>
                  </label>
                  <ReminderCadenceControl
                    studentId={candidate.studentId}
                    cadence={candidate.cadence}
                    disabled={!canSend}
                    className="w-full justify-between border-t border-border pt-2.5"
                  />
                  </>
                }
              />
            );
          })}
          {audience.candidates.length === 0 ? (
            <MobileEmptyRows>
              Nobody matches these filters. Either everyone has paid, or the filters are too narrow.
            </MobileEmptyRows>
          ) : null}
        </ul>

        <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2">Adm</th>
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Class</th>
                <th className="px-3 py-2">Parent</th>
                <th className="px-3 py-2">Number</th>
                <th className="px-3 py-2 text-right">Paid</th>
                <th className="px-3 py-2 text-right">Message says</th>
                <th className="px-3 py-2">Today</th>
                <th className="px-3 py-2">Remind</th>
              </tr>
            </thead>
            <tbody>
              {audience.candidates.map((candidate) => {
                const already = Boolean(candidate.sentToday);
                return (
                  <tr
                    key={candidate.studentId}
                    className={`border-t border-border ${already ? "opacity-55" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={selected.has(candidate.studentId)}
                        onCheckedChange={() => toggle(candidate.studentId)}
                        disabled={already || !canSend}
                        aria-label={`Select ${candidate.studentName}`}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{candidate.admissionNo}</td>
                    <td className="px-3 py-2 font-medium">{candidate.studentName}</td>
                    <td className="px-3 py-2">{candidate.studentClass}</td>
                    <td className="px-3 py-2">{candidate.parentName}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {candidate.destination}
                      {candidate.usedMotherPhone ? (
                        <span className="ml-1 text-muted-foreground">(mother)</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatInr(candidate.totalPaid)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatInr(candidate.dueAmount)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {already ? (
                        <span className="rounded bg-surface-2 px-2 py-0.5">
                          {candidate.sentToday?.status === "sent" ? "Sent" : candidate.sentToday?.status}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <ReminderCadenceControl
                        studentId={candidate.studentId}
                        cadence={candidate.cadence}
                        disabled={!canSend}
                      />
                    </td>
                  </tr>
                );
              })}
              {audience.candidates.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                    Nobody matches these filters. Either everyone has paid, or the filters are too
                    narrow.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* ------------------------------------------------------------- send (desk) */}
        {/* Sticky, not in flow. On a 135-family list the button sat 8,210px down:
            you tick at the top and then scroll seven screens to reach it. It
            appears only once something is selected, so an empty list is not
            covered by a bar that can do nothing. */}
        <div
          className={cn(
            "mt-4 hidden flex-wrap items-center gap-3 md:flex",
            selected.size > 0 &&
              "sticky bottom-4 z-30 rounded-xl border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur print:static print:border-0 print:bg-transparent print:shadow-none",
          )}
        >
          {selected.size > 0 && !confirming ? (
            <span className="text-sm text-muted-foreground">
              <strong className="font-semibold text-foreground">{selected.size} selected</strong> ·{" "}
              {formatInr(selectedTotal)} of dues behind them
            </span>
          ) : null}
          {!confirming ? (
            <Button
              type="button"
              variant="primary"
              disabled={!canSend || selected.size === 0}
              onClick={() => setConfirming(true)}
            >
              <Send className="size-4" aria-hidden="true" />
              Send to {selected.size} {selected.size === 1 ? "family" : "families"}
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              <span className="text-sm">
                This sends {selected.size} real WhatsApp {selected.size === 1 ? "message" : "messages"}
                {campaignName ? ` through "${campaignName}"` : ""}, billed per message. It cannot be
                undone.
              </span>
              <PendingSubmitButton idleLabel="Yes, send now" pendingLabel="Sending…" />
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          )}
          {!canSend ? (
            <span className="text-sm text-muted-foreground">
              You have read-only access to this screen, or sending is not configured.
            </span>
          ) : null}
        </div>

        {/* ------------------------------------------------------------ send (phone) */}
        {selected.size > 0 ? (
          <div
            // A tab screen, not a takeover: the bottom nav is there, so this bar
            // sits ON TOP of it rather than over the home indicator. `md:bottom-0`
            // undoes the offset on the desk, where there is no tab bar.
            className="fixed inset-x-0 bottom-[var(--mobile-bottom-nav-offset,0px)] z-30 border-t border-border bg-background/95 px-4 pt-2.5 backdrop-blur md:bottom-0 md:hidden print:hidden"
            style={{ paddingBottom: "calc(var(--mobile-safe-area-bottom, 0px) + 0.75rem)" }}
          >
            {!confirming ? (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-extrabold text-foreground">
                    {selected.size} selected
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {formatInr(selectedTotal)} of dues behind them
                  </p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  className="h-12 px-5"
                  disabled={!canSend}
                  onClick={() => setConfirming(true)}
                >
                  <Send className="size-4" aria-hidden="true" />
                  Send
                </Button>
              </div>
            ) : (
              // Grows in place rather than opening a Sheet: a Sheet portals out
              // of this <form>, which would break useFormStatus and force the
              // form={id} + pinned-footer machinery.
              <div className="space-y-2.5">
                <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-[11.5px] leading-relaxed">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>
                    {selected.size} real WhatsApp {selected.size === 1 ? "message" : "messages"}
                    {campaignName ? ` through "${campaignName}"` : ""}, billed per message. It
                    cannot be undone.
                  </span>
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-12 flex-1"
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </Button>
                  <PendingSubmitButton
                    className="h-12 flex-1"
                    idleLabel="Yes, send now"
                    pendingLabel="Sending…"
                  />
                </div>
              </div>
            )}
          </div>
        ) : null}
      </form>

      {/* ----------------------------------------------------------------- preview */}
      {sample && previewBody ? (
        <div className="rounded-lg border border-border bg-surface-2 p-4 max-md:order-7">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <MessageCircle className="size-4" aria-hidden="true" />
            What {sample.parentName} will receive
          </div>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm text-muted-foreground">
            {previewBody}
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">
            A copy of the approved template for preview only — WhatsApp sends whatever Meta
            approved, not this text. The rest of the message carries the UPI link and office number.
          </p>
        </div>
      ) : null}
    </div>
  );
}

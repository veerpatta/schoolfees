"use client";

import { useActionState, useMemo, useState } from "react";
import { AlertTriangle, MessageCircle, Send } from "lucide-react";

import {
  sendRemindersAction,
  type SendRemindersState,
} from "@/app/protected/admin-tools/whatsapp-reminders/actions";
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
import { cadenceLabel } from "@/modules/whatsapp/domain/reminder-cadence";
import { renderReminderPreview } from "@/modules/whatsapp/domain/reminder-template";
import type { ReminderAudience, ReminderFilters } from "@/modules/whatsapp/domain/fee-reminders";

type Props = {
  sessionLabel: string;
  filters: ReminderFilters;
  audience: ReminderAudience;
  canSend: boolean;
  campaignName: string | null;
};

const IDLE_SEND: SendRemindersState = { status: "idle" };

const SKIP_LABELS: Array<{ key: keyof ReminderAudience["skipped"]; label: string }> = [
  { key: "installmentsClear", label: "nothing pending on those installments" },
  { key: "leftAndNeverPaid", label: "left and never paid" },
  { key: "noCallFlagged", label: "flagged no-call by the office" },
  { key: "rteStudent", label: "RTE students" },
  { key: "belowMinimum", label: "below the minimum amount" },
  { key: "noPhoneOnRecord", label: "no phone on record" },
  { key: "phoneUnusable", label: "phone number unusable" },
  { key: "whatsappNever", label: "set to never remind" },
  { key: "whatsappSnoozed", label: "skipped for now" },
  { key: "whatsappTooSoon", label: "messaged too recently for their cadence" },
];

/**
 * The filter controls, rendered once and mounted twice — collapsed behind a
 * disclosure on a phone, as the five-column desk grid above `md`.
 *
 * `idPrefix` is load-bearing, not decoration: both branches sit in the DOM at
 * every viewport, so without it every `<Label htmlFor>` on the page would point
 * at a duplicated id. The two copies live in two separate `<form>` elements, so
 * only the one actually submitted contributes to the query string.
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
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}maxTotalPaid`}>Paid so far, at most</Label>
        <Input
          id={`${idPrefix}maxTotalPaid`}
          name="maxTotalPaid"
          type="number"
          min={0}
          defaultValue={filters.maxTotalPaid}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}minDueAmount`}>Due at least</Label>
        <Input
          id={`${idPrefix}minDueAmount`}
          name="minDueAmount"
          type="number"
          min={0}
          defaultValue={filters.minDueAmount}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}installments`}>Installments pending</Label>
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
  sessionLabel,
  filters,
  audience,
  canSend,
  campaignName,
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
  const filterSummary = `Inst ${filters.installments.join(" & ")} · ${
    audience.classOptions.find((option) => option.classId === filters.classId)?.label ??
    "All classes"
  }`;

  return (
    <div className="flex flex-col gap-6">
      {/* ---------------------------------------------------------------- filters */}
      <details className="rounded-xl border border-border bg-card shadow-sm max-md:order-1 md:hidden">
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
        className="hidden gap-4 rounded-lg border border-border bg-surface-2 p-4 md:grid md:grid-cols-5"
      >
        <ReminderFilterFields idPrefix="" filters={filters} classOptions={audience.classOptions} />
      </form>

      {/* --------------------------------------------------------------- who is out */}
      <p className="text-sm text-muted-foreground max-md:order-4">
        Excluded by these filters:{" "}
        {SKIP_LABELS.filter((entry) => audience.skipped[entry.key] > 0)
          .map((entry) => `${audience.skipped[entry.key]} ${entry.label}`)
          .join(" · ") || "nobody"}
        .
      </p>

      {/* ------------------------------------------------------------ paused */}
      {audience.paused.length > 0 ? (
        <details className="rounded-lg border border-border bg-surface-2 p-4 text-sm max-md:order-5">
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
        <details className="rounded-lg border border-border bg-surface-2 p-4 text-sm max-md:order-5">
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
          className="max-md:order-2"
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
        <Notice tone="danger" title="Nothing was sent" className="max-md:order-2">
          {sendState.message}
        </Notice>
      ) : null}

      {/* -------------------------------------------------------------------- list */}
      <form action={sendFormAction} className="max-md:order-3">
        <input type="hidden" name="maxTotalPaid" value={filters.maxTotalPaid} />
        <input type="hidden" name="minDueAmount" value={filters.minDueAmount} />
        <input type="hidden" name="installments" value={filters.installments.join(",")} />
        <input type="hidden" name="classId" value={filters.classId ?? ""} />
        {filters.includeRte ? <input type="hidden" name="includeRte" value="on" /> : null}
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
          The amount on each card is the figure the message will quote — installments 1 and 2 of
          this session only, never last year&rsquo;s carry-forward.
        </MobileNote>

        <ul
          className="flex flex-col gap-2.5 md:hidden"
          // Constant, even with the bar absent, so the list does not jump when
          // the first family is ticked. 7.5rem because the bar grows to two rows
          // in the confirm state. This route is a mobile takeover
          // (`mobileTakeoverRoutes`), so there is no tab bar to clear — using
          // --mobile-bottom-nav-offset here would reserve 68px for nothing.
          style={{ paddingBottom: "calc(var(--mobile-safe-area-bottom, 0px) + 7.5rem)" }}
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
                <th className="px-3 py-2 text-right">Message says due</th>
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
        <div className="mt-4 hidden flex-wrap items-center gap-3 md:flex">
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
            // Takeover route: no tab bar to sit above, so clear the safe area
            // only. bottom-[--mobile-bottom-nav-offset] would float this 68px
            // above the home indicator.
            className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pt-2.5 backdrop-blur md:hidden print:hidden"
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
      {sample ? (
        <div className="rounded-lg border border-border bg-surface-2 p-4 max-md:order-6">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <MessageCircle className="size-4" aria-hidden="true" />
            What {sample.parentName} will receive
          </div>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm text-muted-foreground">
            {renderReminderPreview({ ...sample, sessionLabel })}
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

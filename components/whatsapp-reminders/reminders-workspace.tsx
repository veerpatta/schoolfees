"use client";

import { useActionState, useMemo, useState } from "react";
import { AlertTriangle, MessageCircle, Send } from "lucide-react";

import {
  sendRemindersAction,
  sendTestReminderAction,
  type SendRemindersState,
  type TestSendState,
} from "@/app/protected/admin-tools/whatsapp-reminders/actions";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { SelectNative } from "@/components/ui/select-native";
import { formatInr, formatRupeesPlain } from "@/lib/helpers/currency";
import type { ReminderAudience, ReminderFilters } from "@/lib/whatsapp/fee-reminders";

type Props = {
  sessionLabel: string;
  filters: ReminderFilters;
  audience: ReminderAudience;
  canSend: boolean;
  campaignName: string | null;
};

const IDLE_SEND: SendRemindersState = { status: "idle" };
const IDLE_TEST: TestSendState = { status: "idle" };

const SKIP_LABELS: Array<{ key: keyof ReminderAudience["skipped"]; label: string }> = [
  { key: "installmentsClear", label: "nothing pending on those installments" },
  { key: "leftAndNeverPaid", label: "left and never paid" },
  { key: "noCallFlagged", label: "flagged no-call by the office" },
  { key: "rteStudent", label: "RTE students" },
  { key: "belowMinimum", label: "below the minimum amount" },
  { key: "noPhoneOnRecord", label: "no phone on record" },
  { key: "phoneUnusable", label: "phone number unusable" },
];

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
  const [testState, testFormAction] = useActionState(sendTestReminderAction, IDLE_TEST);

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

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- filters */}
      <form method="get" className="grid gap-4 rounded-lg border border-border bg-surface-2 p-4 md:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="maxTotalPaid">Paid so far, at most</Label>
          <Input
            id="maxTotalPaid"
            name="maxTotalPaid"
            type="number"
            min={0}
            defaultValue={filters.maxTotalPaid}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="minDueAmount">Due at least</Label>
          <Input
            id="minDueAmount"
            name="minDueAmount"
            type="number"
            min={0}
            defaultValue={filters.minDueAmount}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="installments">Installments pending</Label>
          <SelectNative id="installments" name="installments" defaultValue={filters.installments.join(",")}>
            <option value="1,2">1 and 2</option>
            <option value="1">1 only</option>
            <option value="2">2 only</option>
            <option value="1,2,3">1, 2 and 3</option>
            <option value="3">3 only</option>
          </SelectNative>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="classId">Class</Label>
          <SelectNative id="classId" name="classId" defaultValue={filters.classId ?? ""}>
            <option value="">All classes</option>
            {audience.classOptions.map((option) => (
              <option key={option.classId} value={option.classId}>
                {option.label} ({option.count})
              </option>
            ))}
          </SelectNative>
        </div>

        <div className="flex items-end gap-3">
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
      </form>

      {/* --------------------------------------------------------------- who is out */}
      <p className="text-sm text-muted-foreground">
        Excluded by these filters:{" "}
        {SKIP_LABELS.filter((entry) => audience.skipped[entry.key] > 0)
          .map((entry) => `${audience.skipped[entry.key]} ${entry.label}`)
          .join(" · ") || "nobody"}
        .
      </p>

      {audience.unreachable.length > 0 ? (
        <details className="rounded-lg border border-border bg-surface-2 p-4 text-sm">
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
        <Notice tone={sendState.status === "partial" ? "warning" : "success"} title="Send finished">
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
          <p className="mt-2 text-sm">Reload the page to see the list without them.</p>
        </Notice>
      ) : null}

      {sendState.status === "error" ? (
        <Notice tone="danger" title="Nothing was sent">
          {sendState.message}
        </Notice>
      ) : null}

      {/* -------------------------------------------------------------------- table */}
      <form action={sendFormAction}>
        <input type="hidden" name="maxTotalPaid" value={filters.maxTotalPaid} />
        <input type="hidden" name="minDueAmount" value={filters.minDueAmount} />
        <input type="hidden" name="installments" value={filters.installments.join(",")} />
        <input type="hidden" name="classId" value={filters.classId ?? ""} />
        {filters.includeRte ? <input type="hidden" name="includeRte" value="on" /> : null}
        {[...selected].map((studentId) => (
          <input key={studentId} type="hidden" name="studentId" value={studentId} />
        ))}

        <div className="mb-3 flex flex-wrap items-center gap-3">
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

        <div className="overflow-x-auto rounded-lg border border-border">
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
                  </tr>
                );
              })}
              {audience.candidates.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    Nobody matches these filters. Either everyone has paid, or the filters are too
                    narrow.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* ------------------------------------------------------------- send */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
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
      </form>

      {/* ----------------------------------------------------------------- preview */}
      {sample ? (
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <MessageCircle className="size-4" aria-hidden="true" />
            What {sample.parentName} will receive
          </div>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm text-muted-foreground">
            {[
              "*फीस सूचना - किश्त 1 एवं 2*",
              `प्रिय ${sample.parentName},`,
              "",
              `श्री वीर पत्ता सीनियर सेकेंडरी स्कूल की ओर से सूचित किया जाता है कि ${sample.studentName} (${sample.studentClass}) की सत्र ${sessionLabel} की किश्त 1 एवं किश्त 2 की फीस अभी बकाया है।`,
              "",
              `देय राशि: रु. ${formatRupeesPlain(sample.dueAmount)}`,
              "अंतिम तिथि: 25 अगस्त 2026",
            ].join("\n")}
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">
            A copy of the approved template for preview only — WhatsApp sends whatever Meta
            approved, not this text. The rest of the message carries the UPI link and office number.
          </p>
        </div>
      ) : null}

      {/* -------------------------------------------------------------- test send */}
      <form
        action={testFormAction}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="testPhone">Send one test to your own number</Label>
          <Input
            id="testPhone"
            name="testPhone"
            type="tel"
            placeholder="10-digit mobile"
            className="w-48"
          />
        </div>
        {sample ? (
          <>
            <input type="hidden" name="parentName" value={sample.parentName} />
            <input type="hidden" name="studentName" value={sample.studentName} />
            <input type="hidden" name="studentClass" value={sample.studentClass} />
            <input type="hidden" name="dueAmount" value={sample.dueAmount} />
          </>
        ) : null}
        <PendingSubmitButton
          variant="outline"
          idleLabel="Send test"
          pendingLabel="Sending…"
          disabled={!canSend}
        />
        <span className="text-xs text-muted-foreground">
          Uses the top row&rsquo;s real values. Not recorded against that family, so they still
          appear in the list above.
        </span>
        {testState.status !== "idle" ? (
          <p
            className={`w-full text-sm ${testState.status === "error" ? "text-destructive" : "text-success"}`}
          >
            {testState.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}

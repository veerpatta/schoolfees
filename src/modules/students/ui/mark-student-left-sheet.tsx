"use client";

import { useEffect, useId, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { Sheet } from "@/ui/primitives/sheet";
import { Textarea } from "@/ui/primitives/textarea";
import { useActionFeedback } from "@/ui/hooks/use-action-feedback";

const FORM_ID = "mark-student-left-form";

const selectClassName =
  "mt-1 flex h-11 w-full appearance-none rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type MarkStudentLeftSheetProps = {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentLabel: string;
  studentAdmissionNo: string;
  /** Refuses a leave date before it, the same rule `students_check` enforces. */
  joinedOn: string | null;
  /**
   * The withdraw action's state, owned by the Danger Zone rather than by this
   * sheet. `src/modules` may not import `src/app` — `quality:architecture`
   * counts every such edge and only lets the count fall — and the Danger Zone
   * already holds that (baselined) import, so it binds the action there and
   * passes the three pieces down.
   */
  state: { status: "idle" | "success" | "error"; message: string | null };
  formAction: (formData: FormData) => void;
  pending: boolean;
};

/** School day in IST — the office's today, not the server's. */
function istToday() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Recording that a student has left, WITH the date.
 *
 * This replaced a bare "Withdraw" button that wrote `status = 'left'` and a
 * line of free text. The date is the part that matters: the fee engine reads
 * `students.left_on` to decide which installments stop being charged, and with
 * no date on file it cancelled every clean unpaid row — including the ones for
 * months the child had actually attended.
 */
export function MarkStudentLeftSheet({
  open,
  onClose,
  studentId,
  studentLabel,
  studentAdmissionNo,
  joinedOn,
  state,
  formAction,
  pending,
}: MarkStudentLeftSheetProps) {
  // The danger zone renders twice (phone branch + desktop branch, one hidden by
  // CSS but both in the DOM), so a hardcoded id would make the desktop <label>
  // focus the phone input.
  const fieldId = useId();
  const [leftOn, setLeftOn] = useState(istToday);
  const [leaveStatus, setLeaveStatus] = useState("left");
  const [reason, setReason] = useState("");
  const [tcNumber, setTcNumber] = useState("");
  useEffect(() => {
    if (open) {
      setLeftOn(istToday());
      setLeaveStatus("left");
      setReason("");
      setTcNumber("");
    }
  }, [open]);

  // Toasts and refreshes, the same way every other action surface in this tree
  // does. What it deliberately does NOT do is close the sheet: the action
  // reports how many installments were stopped and — the part that matters —
  // how many could not be, because money is already receipted against them.
  // That sentence is the whole reason a leaver's leftover balance stopped being
  // a surprise, and a five-second toast is not where it belongs.
  useActionFeedback(state, {
    successTitle: "Student marked as left",
    errorTitle: "Could not save",
  });

  const done = state.status === "success";

  const dateInvalid = Boolean(leftOn && joinedOn && leftOn < joinedOn);
  const canSubmit = Boolean(leftOn) && !dateInvalid && reason.trim().length >= 4;

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (pending) return;
        onClose();
      }}
      title="Mark as left"
      description="Records the date and stops the fee from that day. Nothing already paid is touched."
      size="full"
      /* Pinned outside the scroll body so the date/reason keyboard cannot bury
         the confirm action — the same shape the write-off sheet uses. */
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {done ? (
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" form={FORM_ID} disabled={pending || !canSubmit}>
                {pending ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Saving…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    Mark as left
                  </span>
                )}
              </Button>
            </>
          )}
        </div>
      }
    >
      <form id={FORM_ID} action={formAction} className="space-y-4 pb-2">
        <input type="hidden" name="studentId" value={studentId} />

        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Student</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{studentLabel}</p>
          <p className="text-xs text-muted-foreground">SR {studentAdmissionNo}</p>
        </div>

        <div>
          <Label htmlFor={`${fieldId}-date`}>Last day at school</Label>
          <Input
            id={`${fieldId}-date`}
            name="leftOn"
            type="date"
            value={leftOn}
            min={joinedOn ?? undefined}
            onChange={(event) => setLeftOn(event.target.value)}
            className="mt-1 h-11"
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Installments due after this date stop being charged. Anything due on or before it
            stays owed — they were a student those months.
          </p>
          {dateInvalid ? (
            <p role="alert" className="mt-1 text-xs font-medium text-destructive">
              This is before the joining date ({joinedOn}).
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor={`${fieldId}-status`}>Record as</Label>
          <select
            id={`${fieldId}-status`}
            name="leaveStatus"
            value={leaveStatus}
            onChange={(event) => setLeaveStatus(event.target.value)}
            className={selectClassName}
          >
            <option value="left">Left the school</option>
            <option value="graduated">Graduated</option>
            <option value="inactive">Inactive — may come back</option>
          </select>
        </div>

        <div>
          <Label htmlFor={`${fieldId}-tc`}>TC number (optional)</Label>
          <Input
            id={`${fieldId}-tc`}
            name="tcNumber"
            value={tcNumber}
            onChange={(event) => setTcNumber(event.target.value)}
            className="mt-1 h-11"
            autoComplete="off"
          />
        </div>

        <div>
          <Label htmlFor={`${fieldId}-reason`}>Reason (audit)</Label>
          <Textarea
            id={`${fieldId}-reason`}
            name="leaveReason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. TC issued, family relocated to Udaipur"
            rows={3}
            className="mt-1"
            required
          />
        </div>

        {state.status === "error" && state.message ? (
          <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-xs text-destructive-soft-foreground">
            {state.message}
          </p>
        ) : null}

        {done && state.message ? (
          <p
            role="status"
            className="rounded-md bg-success-soft px-3 py-2 text-xs text-success-soft-foreground"
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}

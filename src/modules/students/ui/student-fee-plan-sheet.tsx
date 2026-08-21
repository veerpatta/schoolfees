"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Plus, X } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { Sheet } from "@/ui/primitives/sheet";
import { Textarea } from "@/ui/primitives/textarea";
import { toast } from "@/ui/primitives/toast";
import { saveStudentFeePlanAction } from "@/app/protected/students/fee-plan-actions";
import {
  INITIAL_STUDENT_FEE_PLAN_ACTION_STATE,
  MAX_CUSTOM_FEE_HEADS,
  MAX_FEE_HEAD_LABEL_LENGTH,
} from "@/app/protected/students/fee-plan-action-state";
import { formatInr } from "@/platform/helpers/currency";

/** Lets the pinned footer button submit the form it sits outside of. */
const FEE_PLAN_FORM_ID = "student-fee-plan-form";

export type StudentFeePlanHead = {
  id: string;
  label: string;
  amount: number;
};

type HeadRow = {
  key: string;
  label: string;
  amount: string;
};

export type StudentFeePlanSheetProps = {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentLabel: string;
  sessionLabel: string;
  /** Current per-student override, or null when the student is on defaults. */
  currentTuitionOverride: number | null;
  currentTransportOverride: number | null;
  classDefaultTuitionFee: number;
  routeDefaultTransportFee: number;
  currentHeads: StudentFeePlanHead[];
  /** Conventional policies currently applied — drives the override warning. */
  conventionalDiscountLabels: string[];
};

let rowSequence = 0;
function nextRowKey() {
  rowSequence += 1;
  return `head-${rowSequence}`;
}

export function StudentFeePlanSheet({
  open,
  onClose,
  studentId,
  studentLabel,
  sessionLabel,
  currentTuitionOverride,
  currentTransportOverride,
  classDefaultTuitionFee,
  routeDefaultTransportFee,
  currentHeads,
  conventionalDiscountLabels,
}: StudentFeePlanSheetProps) {
  const [tuitionMode, setTuitionMode] = useState<"default" | "custom">("default");
  const [tuitionAmount, setTuitionAmount] = useState("");
  const [transportMode, setTransportMode] = useState<"default" | "custom">("default");
  const [transportAmount, setTransportAmount] = useState("");
  const [heads, setHeads] = useState<HeadRow[]>([]);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const router = useRouter();

  const [state, formAction, pending] = useActionState(
    saveStudentFeePlanAction,
    INITIAL_STUDENT_FEE_PLAN_ACTION_STATE,
  );

  useEffect(() => {
    if (!open) return;

    setTuitionMode(currentTuitionOverride !== null ? "custom" : "default");
    setTuitionAmount(currentTuitionOverride !== null ? String(currentTuitionOverride) : "");
    setTransportMode(currentTransportOverride !== null ? "custom" : "default");
    setTransportAmount(
      currentTransportOverride !== null ? String(currentTransportOverride) : "",
    );
    setHeads(
      currentHeads.map((head) => ({
        key: nextRowKey(),
        label: head.label,
        amount: String(head.amount),
      })),
    );
    setReason("");
    setSubmitted(false);
  }, [open, currentTuitionOverride, currentTransportOverride, currentHeads]);

  useEffect(() => {
    if (state.status === "success") {
      // Re-render the server data so the saved change is visible at once.
      router.refresh();
      toast({ title: "Fee plan updated", description: state.message ?? "" });
      onClose();
    }
    if (state.status === "error") {
      setSubmitted(false);
    }
  }, [state.status, state.message, onClose, router]);

  const tuitionValid =
    tuitionMode === "default" || /^\d+$/.test(tuitionAmount.trim());
  const transportValid =
    transportMode === "default" || /^\d+$/.test(transportAmount.trim());
  const headsValid = heads.every((row) => {
    const label = row.label.trim();
    const amount = row.amount.trim();
    if (!label && !amount) return true;
    return (
      Boolean(label) &&
      label.length <= MAX_FEE_HEAD_LABEL_LENGTH &&
      /^\d+$/.test(amount) &&
      Number(amount) > 0
    );
  });
  const canSubmit =
    tuitionValid &&
    transportValid &&
    headsValid &&
    reason.trim().length >= 4 &&
    !pending &&
    !submitted;

  const showsConventionalWarning =
    tuitionMode === "custom" && conventionalDiscountLabels.length > 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      title={`Custom fees — ${studentLabel}`}
      description="Applies to this student only. Class and route defaults stay in Fee Setup."
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={FEE_PLAN_FORM_ID} disabled={!canSubmit}>
            {pending ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Saving…
              </span>
            ) : (
              "Save fee plan"
            )}
          </Button>
        </div>
      }
    >
      <form
        id={FEE_PLAN_FORM_ID}
        action={formAction}
        onSubmit={() => setSubmitted(true)}
        className="space-y-6"
      >
        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="sessionLabel" value={sessionLabel} />
        <input type="hidden" name="tuitionMode" value={tuitionMode} />
        <input type="hidden" name="transportMode" value={transportMode} />

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-foreground">Tuition fee</legend>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name="tuitionModeChoice"
              checked={tuitionMode === "default"}
              onChange={() => setTuitionMode("default")}
            />
            Class default ({formatInr(classDefaultTuitionFee)})
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name="tuitionModeChoice"
              checked={tuitionMode === "custom"}
              onChange={() => setTuitionMode("custom")}
            />
            Custom amount
          </label>
          <Input
            name="tuitionAmount"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            disabled={tuitionMode !== "custom"}
            value={tuitionAmount}
            onChange={(event) => setTuitionAmount(event.target.value)}
            placeholder="e.g. 12000"
            aria-label="Custom tuition amount"
          />
        </fieldset>

        {showsConventionalWarning ? (
          <div className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              A custom tuition replaces {conventionalDiscountLabels.join(" and ")}. That
              policy will be removed for this student.
            </p>
          </div>
        ) : null}

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-foreground">Transport fee</legend>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name="transportModeChoice"
              checked={transportMode === "default"}
              onChange={() => setTransportMode("default")}
            />
            Route default ({formatInr(routeDefaultTransportFee)})
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name="transportModeChoice"
              checked={transportMode === "custom"}
              onChange={() => setTransportMode("custom")}
            />
            Custom amount
          </label>
          <Input
            name="transportAmount"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            disabled={transportMode !== "custom"}
            value={transportAmount}
            onChange={(event) => setTransportAmount(event.target.value)}
            placeholder="e.g. 4500"
            aria-label="Custom transport amount"
          />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-foreground">
            Extra fee heads
          </legend>
          <p className="text-xs text-muted-foreground">
            Positive whole amounts only. For a reduction, use the Other adjustment field
            on the Edit Student page.
          </p>

          {heads.map((row, index) => (
            <div key={row.key} className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor={`head-label-${row.key}`} className="text-xs">
                  Name
                </Label>
                <Input
                  id={`head-label-${row.key}`}
                  name="headLabel"
                  value={row.label}
                  maxLength={MAX_FEE_HEAD_LABEL_LENGTH}
                  placeholder="e.g. Uniform adj."
                  onChange={(event) =>
                    setHeads((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, label: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </div>
              <div className="w-32">
                <Label htmlFor={`head-amount-${row.key}`} className="text-xs">
                  Amount
                </Label>
                <Input
                  id={`head-amount-${row.key}`}
                  name="headAmount"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={row.amount}
                  placeholder="800"
                  onChange={(event) =>
                    setHeads((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, amount: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${row.label || "fee head"}`}
                onClick={() =>
                  setHeads((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}

          {heads.length < MAX_CUSTOM_FEE_HEADS ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setHeads((current) => [
                  ...current,
                  { key: nextRowKey(), label: "", amount: "" },
                ])
              }
            >
              <Plus className="size-4" aria-hidden="true" />
              Add fee head
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Up to {MAX_CUSTOM_FEE_HEADS} extra heads per student.
            </p>
          )}
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="fee-plan-reason">Reason</Label>
          <Textarea
            id="fee-plan-reason"
            name="reason"
            rows={3}
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Principal-approved concession for this student"
          />
          <p className="text-xs text-muted-foreground">
            Stored on the override for the audit trail.
          </p>
        </div>

        {state.status === "error" && state.message ? (
          <div className="flex items-start gap-2 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive-soft-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{state.message}</p>
          </div>
        ) : null}
        {state.status === "success" && state.message ? (
          <div className="flex items-start gap-2 rounded-md bg-success-soft px-3 py-2 text-sm text-success-soft-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{state.message}</p>
          </div>
        ) : null}
      </form>
    </Sheet>
  );
}

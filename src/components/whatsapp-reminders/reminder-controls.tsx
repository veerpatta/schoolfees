"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  resumeReminderAction,
  setReminderCadenceAction,
  snoozeReminderAction,
} from "@/app/protected/admin-tools/whatsapp-reminders/actions";
import { Button } from "@/ui/primitives/button";
import { toast } from "@/ui/primitives/toast";
import { cn } from "@/platform/utils";
import { REMINDER_CADENCES, type ReminderCadence } from "@/lib/whatsapp/reminder-cadence";

/**
 * How often one family hears from us, and a one-tap "not this time".
 *
 * These deliberately are NOT forms: they render inside the send `<form>`, and a
 * nested form is invalid HTML that browsers silently unnest — the controls
 * would end up submitting the send instead. Server actions are just functions,
 * so they are called directly inside a transition.
 */

type Props = {
  studentId: string;
  cadence: ReminderCadence;
  disabled?: boolean;
  className?: string;
};

function useReminderAction() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (
    action: (prev: { status: "idle" }, data: FormData) => Promise<{ status: string; message?: string }>,
    fields: Record<string, string>,
  ) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.append(key, value);

    startTransition(async () => {
      const result = await action({ status: "idle" }, data);
      if (result.status === "error") {
        toast({ title: "Could not save", description: result.message, tone: "danger" });
        return;
      }
      toast({ title: result.message ?? "Saved", tone: "success" });
      // The audience is derived, so the row has to be re-read to disappear.
      router.refresh();
    });
  };

  return { pending, run };
}

export function ReminderCadenceControl({ studentId, cadence, disabled, className }: Props) {
  const { pending, run } = useReminderAction();

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <label className="sr-only" htmlFor={`cadence-${studentId}`}>
        How often to remind this family
      </label>
      <select
        id={`cadence-${studentId}`}
        value={cadence}
        disabled={disabled || pending}
        onChange={(event) =>
          run(setReminderCadenceAction, { studentId, cadence: event.target.value })
        }
        className="h-8 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground disabled:opacity-50"
      >
        {REMINDER_CADENCES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => run(snoozeReminderAction, { studentId, days: "7" })}
        className="focus-ring shrink-0 rounded-md border border-border px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-surface-2 disabled:opacity-50"
        title="Hold this family back for a week"
      >
        Skip 7d
      </button>
    </div>
  );
}

export function ResumeReminderButton({
  studentId,
  label = "Put back on the list",
}: {
  studentId: string;
  label?: string;
}) {
  const { pending, run } = useReminderAction();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => run(resumeReminderAction, { studentId })}
    >
      {label}
    </Button>
  );
}

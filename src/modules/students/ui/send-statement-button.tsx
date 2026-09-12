"use client";

import { useActionState } from "react";
import { FileText, Loader2 } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { useActionFeedback } from "@/ui/hooks/use-action-feedback";

/**
 * Mirrors `SendStatementActionState` from
 * `src/app/protected/students/actions.ts`.
 *
 * Declared here rather than imported because `src/modules` may not import
 * `src/app` — `quality:architecture` counts every such edge and only lets the
 * count fall. The action itself arrives as a prop for the same reason.
 */
export type SendStatementState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const IDLE: SendStatementState = { status: "idle" };

type SendStatementButtonProps = {
  studentId: string;
  studentName: string;
  action: (state: SendStatementState, formData: FormData) => Promise<SendStatementState>;
  /**
   * `card` is the panel on the student page. `phone` is the 56px control in the
   * profile's fixed action bar, where a 32px chip would be unhittable. One
   * component, two shapes — the action behind it is identical.
   */
  surface?: "card" | "phone";
};

/**
 * Send this family their fee statement, in one tap.
 *
 * What used to be here opened `wa.me` with some pre-filled text and left the
 * sending — and the attaching of the actual PDF — to whoever was holding the
 * phone. It logged nothing, so nobody could say afterwards whether a family had
 * been told anything at all.
 *
 * This renders the statement, sends it from the school's own number as a
 * Meta-approved template with the PDF attached, and writes the send down. There
 * is no draft to edit and no share sheet to pick through, because there is
 * nothing to decide: the figures come from the ledger at send time.
 *
 * No confirm step. The send is idempotent for the day — the claim row sits
 * under a unique index — so a double-tap reports "already sent today" rather
 * than messaging a parent twice, which is a better guard than a dialog nobody
 * reads.
 */
export function SendStatementButton({
  studentId,
  studentName,
  action,
  surface = "card",
}: SendStatementButtonProps) {
  const [state, formAction, pending] = useActionState(action, IDLE);

  useActionFeedback(state, {
    successTitle: "Statement sent",
    errorTitle: "Not sent",
  });

  if (surface === "phone") {
    return (
      <form action={formAction} className="contents">
        <input type="hidden" name="studentId" value={studentId} />
        {/* 56px tall and a fixed width, matching Collect and Remind beside it,
            so a long student name in the row above cannot squeeze it below a
            thumb's width. */}
        <button
          type="submit"
          disabled={pending}
          className="focus-ring flex h-14 w-24 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-border bg-card text-[11px] font-extrabold text-foreground active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileText className="size-4" aria-hidden="true" />
          )}
          <span>Statement</span>
        </button>
      </form>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-xs no-print">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Fee statement</h2>
          <p className="text-xs text-muted-foreground">
            Sends {studentName}&apos;s full statement as a PDF on the school&apos;s WhatsApp
            number. Every installment, what has been received, and what remains.
          </p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="studentId" value={studentId} />
          <Button type="submit" size="sm" className="gap-2" disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileText className="size-4" aria-hidden="true" />
            )}
            {pending ? "Sending…" : "Send on WhatsApp"}
          </Button>
        </form>
      </div>

      {state.status === "error" && state.message ? (
        <p
          role="alert"
          className="mt-3 rounded-md bg-destructive-soft px-3 py-2 text-xs text-destructive-soft-foreground"
        >
          {state.message}
        </p>
      ) : null}

      {state.status === "success" && state.message ? (
        <p
          role="status"
          className="mt-3 rounded-md bg-success-soft px-3 py-2 text-xs text-success-soft-foreground"
        >
          {state.message}
        </p>
      ) : null}
    </section>
  );
}

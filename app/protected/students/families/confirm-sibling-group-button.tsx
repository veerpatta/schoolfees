"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  confirmSiblingGroupAction,
  INITIAL_CONFIRM_SIBLING_GROUP_ACTION_STATE,
} from "@/app/protected/students/families/actions";
import { Button } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" variant="soft" loading={pending} loadingText="Confirming">
      Confirm as family
    </Button>
  );
}

export function ConfirmSiblingGroupButton({
  groupKey,
  sessionLabel,
}: {
  groupKey: string;
  sessionLabel: string;
}) {
  const [state, formAction] = useActionState(
    confirmSiblingGroupAction,
    INITIAL_CONFIRM_SIBLING_GROUP_ACTION_STATE,
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="groupKey" value={groupKey} />
      <input type="hidden" name="sessionLabel" value={sessionLabel} />
      <SubmitButton />
      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "text-xs text-destructive-soft-foreground"
              : "text-xs text-success-soft-foreground"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

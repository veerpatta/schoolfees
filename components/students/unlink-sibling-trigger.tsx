"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Unlink, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  INITIAL_UNLINK_SIBLING_ACTION_STATE,
  unlinkSiblingAction,
} from "@/app/protected/students/sibling-actions";

type UnlinkSiblingTriggerProps = {
  /** The member being removed from the family. */
  studentId: string;
  familyGroupId: string;
  sessionLabel: string;
  memberLabel: string;
};

export function UnlinkSiblingTrigger({
  studentId,
  familyGroupId,
  sessionLabel,
  memberLabel,
}: UnlinkSiblingTriggerProps) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(
    unlinkSiblingAction,
    INITIAL_UNLINK_SIBLING_ACTION_STATE,
  );

  useEffect(() => {
    if (state.status === "success") {
      toast({ title: "Sibling unlinked", description: state.message ?? "" });
      setConfirming(false);
    } else if (state.status === "error" && state.message) {
      toast({ title: "Unlink failed", description: state.message });
    }
  }, [state.status, state.message]);

  if (!confirming) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-destructive"
        onClick={() => setConfirming(true)}
        aria-label={`Unlink ${memberLabel}`}
      >
        <Unlink className="size-3.5" aria-hidden="true" />
        Unlink
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="familyGroupId" value={familyGroupId} />
      <input type="hidden" name="sessionLabel" value={sessionLabel} />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-[11px] text-destructive"
        disabled={pending}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
        Confirm unlink
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-1.5 text-[11px]"
        onClick={() => setConfirming(false)}
        disabled={pending}
        aria-label="Cancel unlink"
      >
        <X className="size-3.5" aria-hidden="true" />
      </Button>
    </form>
  );
}

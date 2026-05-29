"use client";

import { useActionState, useEffect } from "react";
import { Loader2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { linkSuspectedSiblingsAction } from "@/app/protected/students/sibling-actions";
import { INITIAL_LINK_SIBLING_ACTION_STATE } from "@/app/protected/students/sibling-action-state";

type LinkSuspectedSiblingsButtonProps = {
  studentId: string;
  sessionLabel: string;
  count: number;
};

export function LinkSuspectedSiblingsButton({
  studentId,
  sessionLabel,
  count,
}: LinkSuspectedSiblingsButtonProps) {
  const [state, formAction, pending] = useActionState(
    linkSuspectedSiblingsAction,
    INITIAL_LINK_SIBLING_ACTION_STATE,
  );

  useEffect(() => {
    if (state.status === "success") {
      toast({ title: "Siblings linked", description: state.message ?? "" });
    } else if (state.status === "error" && state.message) {
      toast({ title: "Could not link siblings", description: state.message });
    }
  }, [state.status, state.message]);

  return (
    <form action={formAction}>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="sessionLabel" value={sessionLabel} />
      <Button type="submit" size="sm" className="w-full gap-1.5" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Users className="size-4" aria-hidden="true" />
        )}
        Link {count} as a family
      </Button>
    </form>
  );
}

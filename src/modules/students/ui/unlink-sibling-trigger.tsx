"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Unlink, X } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { toast } from "@/ui/primitives/toast";
import { unlinkSiblingAction } from "@/app/protected/students/sibling-actions";
import { INITIAL_UNLINK_SIBLING_ACTION_STATE } from "@/app/protected/students/sibling-action-state";

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
  const t = useTranslations("MobileApp");
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    unlinkSiblingAction,
    INITIAL_UNLINK_SIBLING_ACTION_STATE,
  );

  useEffect(() => {
    if (state.status === "success") {
      // Re-render the server data so the saved change is visible at once.
      router.refresh();
      toast({ title: t("unlinkDoneTitle"), description: state.message ?? "" });
      setConfirming(false);
    } else if (state.status === "error" && state.message) {
      toast({ title: t("unlinkFailedTitle"), description: state.message });
    }
  }, [state.status, state.message, t, router]);

  if (!confirming) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        // max-md bump: at h-7 this sat at 28px, well under a comfortable
        // thumb target, right beside the sibling's profile link.
        className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-destructive max-md:h-9 max-md:px-3"
        onClick={() => setConfirming(true)}
        aria-label={t("unlinkAria", { name: memberLabel })}
      >
        <Unlink className="size-3.5" aria-hidden="true" />
        {t("unlinkCta")}
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
        className="h-7 gap-1 px-2 text-[11px] text-destructive max-md:h-9 max-md:px-3"
        disabled={pending}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
        {t("unlinkConfirmCta")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-1.5 text-[11px] max-md:h-9 max-md:px-3"
        onClick={() => setConfirming(false)}
        disabled={pending}
        aria-label={t("unlinkCancelAria")}
      >
        <X className="size-3.5" aria-hidden="true" />
      </Button>
    </form>
  );
}

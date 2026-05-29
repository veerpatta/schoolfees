"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { BellOff, Loader2 } from "lucide-react";

import { setNoCallFlagAction } from "@/app/protected/defaulters/actions";
import { cn } from "@/lib/utils";

type Props = {
  studentId: string;
  sessionLabel: string;
  noCall: boolean;
  /** When false, render a static read-only chip instead of a toggle. */
  canManage: boolean;
  /** Optimistic hook so the parent can move the row to/from the No-call segment. */
  onOptimisticChange?: (noCall: boolean) => void;
  onRevert?: (previous: boolean) => void;
  className?: string;
};

/**
 * Admin-only "this parent will pay anyway — don't call" toggle. Non-admins who
 * can view the list see a read-only chip when the flag is set. Writes are gated
 * server-side on `students:write` and again by RLS.
 */
export function NoCallToggle({
  studentId,
  sessionLabel,
  noCall,
  canManage,
  onOptimisticChange,
  onRevert,
  className,
}: Props) {
  const t = useTranslations("Defaulters");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canManage) {
    if (!noCall) return null;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
          className,
        )}
      >
        <BellOff className="size-3" aria-hidden="true" />
        {t("noCallByAdmin")}
      </span>
    );
  }

  function toggle(event: React.MouseEvent) {
    event.stopPropagation();
    const next = !noCall;
    setError(null);
    onOptimisticChange?.(next);
    startTransition(async () => {
      const result = await setNoCallFlagAction({ studentId, sessionLabel, noCall: next });
      if (!result.ok) {
        setError(result.message ?? t("noCallError"));
        onRevert?.(noCall);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      data-row-action="true"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
        noCall
          ? "border-border bg-surface-2 text-muted-foreground hover:bg-surface-3"
          : "border-dashed border-border bg-card text-muted-foreground hover:bg-surface-2",
        className,
      )}
      title={error ?? (noCall ? t("noCallResumeHint") : t("noCallSetHint"))}
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      ) : (
        <BellOff className="size-3" aria-hidden="true" />
      )}
      {noCall ? t("noCallResume") : t("noCallSet")}
    </button>
  );
}

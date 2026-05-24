"use client";

/**
 * Reusable "Collect" button. Any row, header, or empty-state can drop one
 * in to navigate to the Payment Desk with a pre-filled student.
 *
 * Uses <Link> for normal full-page client navigation — clicking lands on
 * the Payment Desk page with ?studentId=… in the URL so the desk can
 * preselect the student. Renders safely as a plain anchor in SSR test
 * environments.
 *
 * Historical note: this button used to open Payment Desk in an
 * intercepting-route Sheet (@drawer/(.)payments). That pattern was
 * removed because the Payment Desk is a two-column posting workflow
 * that needs the full viewport — a 440px sheet is unusable for daily
 * collection. CollectTrigger now does a regular full-page navigation.
 */

import Link from "next/link";
import { BadgeIndianRupee } from "lucide-react";

import { cn } from "@/lib/utils";

export type CollectIntent = {
  /** UUID of the student to pre-fill. */
  studentId: string;
  /** Optional display label so the button can render an informative title attr. */
  studentLabel?: string;
  /** Optional class label (currently informational; kept for back-compat with callers). */
  classLabel?: string;
  /** Where to return after the user posts a payment or cancels. */
  returnTo?: string;
};

type CollectTriggerProps = {
  intent: CollectIntent;
  variant?: "primary" | "ghost";
  size?: "sm" | "md";
  className?: string;
  label?: string;
};

function buildCollectHref(intent: CollectIntent): string {
  const params = new URLSearchParams({ studentId: intent.studentId });
  if (intent.returnTo) {
    params.set("returnTo", intent.returnTo);
  }
  return `/protected/payments?${params.toString()}`;
}

export function CollectTrigger({
  intent,
  variant = "primary",
  size = "sm",
  className,
  label = "Collect",
}: CollectTriggerProps) {
  return (
    <Link
      href={buildCollectHref(intent)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors focus-ring",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3 text-sm",
        variant === "primary"
          ? "bg-accent text-accent-foreground hover:bg-accent/90"
          : "bg-transparent text-foreground hover:bg-surface-2",
        className,
      )}
      title={`Open Payment Desk for ${intent.studentLabel ?? "this student"}`}
    >
      <BadgeIndianRupee className="size-3.5" aria-hidden="true" />
      {label}
    </Link>
  );
}

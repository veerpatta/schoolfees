"use client";

import { useFormStatus } from "react-dom";
import { Loader2, LogOut } from "lucide-react";

import { cn } from "@/platform/utils";

/**
 * The submit control for a sign-out form, with a pending state.
 *
 * Sign-out is a server round trip that ends in a redirect. Without this the
 * button sat inert while it happened, so staff on a slow connection pressed it
 * repeatedly, unsure it had registered.
 *
 * It is a separate component on purpose: `useFormStatus` only reports from a
 * DESCENDANT of the form, so the component that renders `<form>` cannot read
 * it. Kept style-agnostic (className + children) because the three sign-out
 * surfaces look nothing alike — a dropdown row, a phone card button, and the
 * standalone LogoutButton.
 */
export function SignOutSubmit({
  className,
  children,
  pendingLabel = "Signing out…",
}: {
  className?: string;
  children: React.ReactNode;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className={cn(className, pending && "opacity-70")}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <LogOut className="size-4" aria-hidden="true" />
      )}
      {pending ? pendingLabel : children}
    </button>
  );
}

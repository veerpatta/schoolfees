"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/ui/primitives/button";

/**
 * A submit button that disables itself and spins while its form is in flight.
 *
 * This adds no markup of its own — `Button` already renders the `Loader2`,
 * sets `aria-busy` and disables. This is purely the `useFormStatus` adapter,
 * so every submit control in the app can look and behave identically.
 *
 * IMPORTANT — the one way this silently does nothing:
 * `useFormStatus` reads the *nearest ancestor* `<form>`, and only from a
 * DESCENDANT of it. A component that renders the `<form>` itself cannot call
 * it; the hook will always report `pending: false`. If you are adding this to
 * a new surface, check the button is nested inside the form element, not a
 * sibling of it.
 */
export type PendingSubmitButtonProps = Omit<
  ButtonProps,
  "type" | "loading" | "loadingText" | "asChild"
> & {
  /** Legacy string API — keeps the original two call sites byte-identical. */
  idleLabel?: string;
  /** Optional. Omit it and the idle label stays beside the spinner. */
  pendingLabel?: string;
  children?: React.ReactNode;
};

export function PendingSubmitButton({
  idleLabel,
  pendingLabel,
  children,
  disabled,
  variant = "primary",
  ...rest
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      disabled={disabled || pending}
      loading={pending}
      loadingText={pendingLabel}
      {...rest}
    >
      {children ?? idleLabel}
    </Button>
  );
}

"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type ButtonVariant = React.ComponentProps<typeof Button>["variant"];

type PendingSubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  variant?: ButtonVariant;
  className?: string;
};

export function PendingSubmitButton({
  idleLabel,
  pendingLabel,
  variant = "primary",
  className,
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending}
      loading={pending}
      loadingText={pendingLabel}
      className={className}
    >
      {idleLabel}
    </Button>
  );
}

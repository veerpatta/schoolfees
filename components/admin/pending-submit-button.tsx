"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type PendingSubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  variant?: "default" | "outline";
};

export function PendingSubmitButton({
  idleLabel,
  pendingLabel,
  variant = "default",
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}

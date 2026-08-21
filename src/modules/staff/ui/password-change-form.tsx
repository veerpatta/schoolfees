"use client";

import { useActionState } from "react";

import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import type { StaffFormActionState } from "@/modules/staff/data/queries";

import { useActionFeedback } from "@/ui/hooks/use-action-feedback";
type PasswordChangeFormProps = {
  initialState: StaffFormActionState;
  action: (
    previous: StaffFormActionState,
    formData: FormData,
  ) => Promise<StaffFormActionState>;
};

export function PasswordChangeForm({
  initialState,
  action,
}: PasswordChangeFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  useActionFeedback(state, {
    successTitle: "Password updated",
    errorTitle: "Password not updated",
  });

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? (
        <div
          className={
            state.status === "error"
              ? "rounded-md border bg-destructive-soft px-3 py-2 text-sm text-destructive-soft-foreground"
              : "rounded-md border bg-success-soft px-3 py-2 text-sm text-success-soft-foreground"
          }
        >
          {state.message}
        </div>
      ) : null}

      <div className="grid gap-4">
        <div>
          <Label htmlFor="currentPassword">Current password</Label>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            className="mt-2"
            required
          />
        </div>
        <div>
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            minLength={6}
            autoComplete="new-password"
            className="mt-2"
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Use at least 6 characters.
          </p>
        </div>
        <div>
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            minLength={6}
            autoComplete="new-password"
            className="mt-2"
            required
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Change password"}
        </Button>
      </div>
    </form>
  );
}

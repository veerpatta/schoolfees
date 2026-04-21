"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StaffFormActionState } from "@/lib/staff-management/data";

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

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? (
        <div
          className={
            state.status === "error"
              ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
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
            className="mt-2"
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            Use at least 8 characters with uppercase, lowercase, number, and
            special character.
          </p>
        </div>
        <div>
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
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

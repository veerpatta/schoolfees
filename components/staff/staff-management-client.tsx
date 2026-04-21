"use client";

import { useActionState } from "react";

import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roleLabels, staffRoles, type StaffRole } from "@/lib/auth/roles";
import type {
  StaffAccountRecord,
  StaffFormActionState,
} from "@/lib/staff-management/data";

type StaffManagementClientProps = {
  currentStaffId: string;
  accounts: StaffAccountRecord[];
  initialState: StaffFormActionState;
  createStaffAccountAction: (
    previous: StaffFormActionState,
    formData: FormData,
  ) => Promise<StaffFormActionState>;
  updateStaffAccountAction: (
    userId: string,
    previous: StaffFormActionState,
    formData: FormData,
  ) => Promise<StaffFormActionState>;
  resetStaffPasswordAction: (
    userId: string,
    previous: StaffFormActionState,
    formData: FormData,
  ) => Promise<StaffFormActionState>;
};

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const textAreaClassName =
  "flex min-h-[84px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Not yet";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function ActionNotice({ state }: { state: StaffFormActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={
        state.status === "error"
          ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          : "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
      }
    >
      <p>{state.message}</p>
      {state.generatedPassword ? (
        <p className="mt-2 font-medium text-slate-900">
          Generated password: {state.generatedPassword}
        </p>
      ) : null}
    </div>
  );
}

function CreateStaffForm({
  initialState,
  action,
}: {
  initialState: StaffFormActionState;
  action: (
    previous: StaffFormActionState,
    formData: FormData,
  ) => Promise<StaffFormActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <ActionNotice state={state} />

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="newStaffFullName">Full name</Label>
          <Input
            id="newStaffFullName"
            name="fullName"
            className="mt-2"
            placeholder="Staff member name"
            required
          />
        </div>
        <div>
          <Label htmlFor="newStaffEmail">Email</Label>
          <Input
            id="newStaffEmail"
            name="email"
            type="email"
            className="mt-2"
            placeholder="staff@vpps.co.in"
            required
          />
        </div>
        <div>
          <Label htmlFor="newStaffRole">Role</Label>
          <select
            id="newStaffRole"
            name="role"
            defaultValue="read_only_staff"
            className={`${selectClassName} mt-2`}
            required
          >
            {staffRoles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="newStaffPassword">Initial password</Label>
          <Input
            id="newStaffPassword"
            name="password"
            type="password"
            className="mt-2"
            placeholder="Leave blank to generate"
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="newStaffNotes">Notes</Label>
          <textarea
            id="newStaffNotes"
            name="notes"
            className={`${textAreaClassName} mt-2`}
            placeholder="Optional internal note about this account"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Create staff account"}
        </Button>
      </div>
    </form>
  );
}

function StaffAccessForm({
  account,
  currentStaffId,
  initialState,
  action,
}: {
  account: StaffAccountRecord;
  currentStaffId: string;
  initialState: StaffFormActionState;
  action: (
    userId: string,
    previous: StaffFormActionState,
    formData: FormData,
  ) => Promise<StaffFormActionState>;
}) {
  const [state, formAction, pending] = useActionState(
    action.bind(null, account.id),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <ActionNotice state={state} />

      <div className="grid gap-4">
        <div>
          <Label htmlFor={`staffFullName-${account.id}`}>Full name</Label>
          <Input
            id={`staffFullName-${account.id}`}
            name="fullName"
            defaultValue={account.fullName}
            className="mt-2"
            required
          />
        </div>
        <div>
          <Label htmlFor={`staffRole-${account.id}`}>Role</Label>
          <select
            id={`staffRole-${account.id}`}
            name="role"
            defaultValue={account.role}
            className={`${selectClassName} mt-2`}
            required
          >
            {staffRoles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
          <label
            htmlFor={`staffActive-${account.id}`}
            className="flex cursor-pointer items-center justify-between gap-3"
          >
            <span className="text-sm font-medium text-slate-900">
              Staff account active
            </span>
            <input
              id={`staffActive-${account.id}`}
              name="isActive"
              type="checkbox"
              defaultChecked={account.isActive}
              className="size-4"
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">
            Deactivated accounts cannot enter the protected app, even if the
            user can still authenticate.
          </p>
        </div>
        <div>
          <Label htmlFor={`staffNotes-${account.id}`}>Notes</Label>
          <textarea
            id={`staffNotes-${account.id}`}
            name="notes"
            defaultValue={account.notes ?? ""}
            className={`${textAreaClassName} mt-2`}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {currentStaffId === account.id
            ? "This is your current account. You cannot remove your own admin access here."
            : "Role and status changes are applied immediately."}
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save access"}
        </Button>
      </div>
    </form>
  );
}

function ResetPasswordForm({
  account,
  initialState,
  action,
}: {
  account: StaffAccountRecord;
  initialState: StaffFormActionState;
  action: (
    userId: string,
    previous: StaffFormActionState,
    formData: FormData,
  ) => Promise<StaffFormActionState>;
}) {
  const [state, formAction, pending] = useActionState(
    action.bind(null, account.id),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <ActionNotice state={state} />

      <div>
        <Label htmlFor={`resetPassword-${account.id}`}>New password</Label>
        <Input
          id={`resetPassword-${account.id}`}
          name="password"
          type="password"
          className="mt-2"
          required
        />
        <p className="mt-1 text-xs text-slate-500">
          Password must be at least 8 characters and include uppercase,
          lowercase, number, and special character.
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving..." : "Reset password"}
        </Button>
      </div>
    </form>
  );
}

function roleTone(role: StaffRole) {
  if (role === "admin") {
    return "accent" as const;
  }

  if (role === "accountant") {
    return "neutral" as const;
  }

  return "warning" as const;
}

export function StaffManagementClient({
  currentStaffId,
  accounts,
  initialState,
  createStaffAccountAction,
  updateStaffAccountAction,
  resetStaffPasswordAction,
}: StaffManagementClientProps) {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Create staff account"
        description="Admins create all internal staff accounts here. Public signup remains disabled."
      >
        <CreateStaffForm
          initialState={initialState}
          action={createStaffAccountAction}
        />
      </SectionCard>

      <SectionCard
        title="Existing staff accounts"
        description="Review current staff access, update role mapping, deactivate accounts, and reset passwords."
      >
        <div className="space-y-4">
          {accounts.map((account) => (
            <details
              key={account.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">
                    {account.fullName}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {account.email ?? "No email on file"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Last login: {formatTimestamp(account.lastLoginAt)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {account.id === currentStaffId ? (
                    <StatusBadge label="Current account" tone="accent" />
                  ) : null}
                  <StatusBadge
                    label={account.isActive ? "Active" : "Inactive"}
                    tone={account.isActive ? "good" : "warning"}
                  />
                  <StatusBadge
                    label={roleLabels[account.role]}
                    tone={roleTone(account.role)}
                  />
                </div>
              </summary>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-950">
                    Access and role
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Email confirmed:{" "}
                    {account.emailConfirmedAt
                      ? formatTimestamp(account.emailConfirmedAt)
                      : "No"}
                  </p>
                  <div className="mt-4">
                    <StaffAccessForm
                      account={account}
                      currentStaffId={currentStaffId}
                      initialState={initialState}
                      action={updateStaffAccountAction}
                    />
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-950">
                    Password reset
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Use this only when the staff member cannot sign in or needs
                    a fresh password.
                  </p>
                  <div className="mt-4">
                    <ResetPasswordForm
                      account={account}
                      initialState={initialState}
                      action={resetStaffPasswordAction}
                    />
                  </div>
                </section>
              </div>
            </details>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

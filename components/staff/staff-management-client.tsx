"use client";

import { useActionState } from "react";

import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roleLabels, staffRoles, type StaffRole } from "@/lib/auth/roles";
import { formatDateTimeIst } from "@/lib/helpers/date";
import type {
  StaffAccountRecord,
  StaffFormActionState,
} from "@/lib/staff-management/data";

type StaffManagementClientProps = {
  currentStaffId: string;
  accounts: StaffAccountRecord[];
  /**
   * Roles offered in the create / update dropdowns. Pass a subset to hide
   * roles still behind a rollout flag (e.g. teacher / fee_collector).
   * Existing accounts on hidden roles still show their assigned label via the
   * status badge — only the assignment dropdown is gated.
   */
  assignableRoles?: readonly StaffRole[];
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
  if (!value) return "Not yet";
  // Pass the raw value back as fallback so weird strings aren't mangled to "—".
  return formatDateTimeIst(value, value);
}

function ActionNotice({ state }: { state: StaffFormActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={
        state.status === "error"
          ? "rounded-md border bg-destructive-soft px-3 py-2 text-sm text-destructive-soft-foreground"
          : "rounded-md border bg-success-soft px-3 py-2 text-sm text-success-soft-foreground"
      }
    >
      <p>{state.message}</p>
      {state.generatedPassword ? (
        <p className="mt-2 font-medium text-foreground">
          Generated password: {state.generatedPassword}
        </p>
      ) : null}
    </div>
  );
}

function CreateStaffForm({
  initialState,
  assignableRoles,
  action,
}: {
  initialState: StaffFormActionState;
  assignableRoles: readonly StaffRole[];
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
            // Prevent Chrome from autofilling the signed-in admin's own email
            // into the "create new staff" field.
            autoComplete="off"
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
            defaultValue="view_only"
            className={`${selectClassName} mt-2`}
            required
          >
            {assignableRoles.map((role) => (
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
            // "new-password" stops the browser injecting the admin's saved password.
            autoComplete="new-password"
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
  assignableRoles,
  action,
}: {
  account: StaffAccountRecord;
  currentStaffId: string;
  initialState: StaffFormActionState;
  assignableRoles: readonly StaffRole[];
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
            {/* If this account already has a role outside the assignable list
                (e.g. it was set before a rollout flag flipped), include it so
                admins can still see and re-save the existing assignment. */}
            {(assignableRoles.includes(account.role)
              ? assignableRoles
              : [account.role, ...assignableRoles]
            ).map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
          <label
            htmlFor={`staffActive-${account.id}`}
            className="flex cursor-pointer items-center justify-between gap-3"
          >
            <span className="text-sm font-medium text-foreground">
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
          <p className="mt-2 text-xs text-muted-foreground">
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
        <p className="text-xs text-muted-foreground">
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
        <p className="mt-1 text-xs text-muted-foreground">
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
  assignableRoles = staffRoles,
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
          assignableRoles={assignableRoles}
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
              className="rounded-2xl border border-border bg-surface-2 p-4"
            >
              <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {account.fullName}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {account.email ?? "No email on file"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
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
                <section className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    Access and role
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
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
                      assignableRoles={assignableRoles}
                      action={updateStaffAccountAction}
                    />
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    Password reset
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
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

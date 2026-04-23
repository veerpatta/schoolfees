"use client";

import { type ReactNode, useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { ValueStatePill } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatInr } from "@/lib/helpers/currency";
import type {
  ClassFeeDefault,
  ConfigChangeImpactPreview,
  FeeHeadDefinition,
  FeeSetupActionState,
  FeeSetupPageData,
  StudentFeeOverride,
  TransportDefault,
} from "@/lib/fees/types";
import type { PaymentMode } from "@/lib/db/types";

type StructureActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

type AcademicSessionItem = {
  id: string;
  session_label: string;
  status: "active" | "inactive" | "archived";
  is_current: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ClassItem = {
  id: string;
  session_label: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
  sort_order: number;
  status: "active" | "inactive" | "archived";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type RouteItem = {
  id: string;
  route_code: string | null;
  route_name: string;
  default_installment_amount: number;
  annual_fee_amount?: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type StructureData = {
  sessions: AcademicSessionItem[];
  classes: ClassItem[];
  routes: RouteItem[];
  currentSessionLabel: string | null;
};

type ActionFn<TState> = (
  previous: TState,
  formData: FormData,
) => Promise<TState>;

type FeeSetupClientProps = {
  data: FeeSetupPageData;
  structureData: StructureData;
  canEdit: boolean;
  canStructureEdit: boolean;
  saveGlobalPolicyAction: (
    previous: FeeSetupActionState,
    formData: FormData,
  ) => Promise<FeeSetupActionState>;
  saveSchoolDefaultsAction: (
    previous: FeeSetupActionState,
    formData: FormData,
  ) => Promise<FeeSetupActionState>;
  saveClassDefaultsAction: (
    previous: FeeSetupActionState,
    formData: FormData,
  ) => Promise<FeeSetupActionState>;
  saveTransportDefaultsAction: (
    previous: FeeSetupActionState,
    formData: FormData,
  ) => Promise<FeeSetupActionState>;
  saveStudentOverrideAction: (
    previous: FeeSetupActionState,
    formData: FormData,
  ) => Promise<FeeSetupActionState>;
  createSessionAction: ActionFn<StructureActionState>;
  updateSessionAction: ActionFn<StructureActionState>;
  deleteSessionAction: ActionFn<StructureActionState>;
  createClassAction: ActionFn<StructureActionState>;
  updateClassAction: ActionFn<StructureActionState>;
  deleteClassAction: ActionFn<StructureActionState>;
  createRouteAction: ActionFn<StructureActionState>;
  updateRouteAction: ActionFn<StructureActionState>;
  deleteRouteAction: ActionFn<StructureActionState>;
  initialState: FeeSetupActionState;
  structureInitialState: StructureActionState;
};

type EditableFeeHead = FeeHeadDefinition & {
  key: string;
};

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const textAreaClassName =
  "flex min-h-[88px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const paymentModeOptions: Array<{ value: PaymentMode; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
];

function ActionNotice({ state }: { state: FeeSetupActionState }) {
  if (!state.message) {
    return null;
  }

  const toneClassName =
    state.status === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : state.status === "preview"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${toneClassName}`}>
      {state.message}
    </div>
  );
}

function SectionHint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-slate-500">{children}</p>;
}

function SetupSummaryCard({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 transition-colors hover:border-slate-300 hover:bg-white"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
    </a>
  );
}

function ExpandableSection({
  title,
  description,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  description: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 px-4 py-4">
        <div>
          <p className="text-base font-semibold text-slate-950">{title}</p>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {badge}
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            <span className="group-open:hidden">Open</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </div>
      </summary>
      <div className="border-t border-slate-200 bg-white p-4 md:p-5">{children}</div>
    </details>
  );
}

function FormGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function ImpactPreviewCard({ preview }: { preview: ConfigChangeImpactPreview | null }) {
  if (!preview) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-lg border border-blue-200 bg-blue-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-blue-700">
            Review changes
          </p>
          <p className="text-sm font-semibold text-slate-900">{preview.targetLabel}</p>
          <p className="text-xs text-slate-600">
            {preview.scopeLabel}: save these exact changes to update live dues safely.
          </p>
        </div>
        <div className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-blue-700">
          Only future/unpaid rows update
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-500">Students in scope</dt>
          <dd className="text-lg font-semibold text-slate-900">{preview.studentsInScope}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Students affected</dt>
          <dd className="text-lg font-semibold text-slate-900">{preview.studentsAffected}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Installments to update</dt>
          <dd className="text-lg font-semibold text-slate-900">
            {preview.installmentsToUpdate}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Rows blocked for review</dt>
          <dd className="text-lg font-semibold text-amber-700">
            {preview.blockedInstallments}
          </dd>
        </div>
      </dl>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
          New unpaid rows: <strong>{preview.installmentsToInsert}</strong>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
          Cancel unpaid rows: <strong>{preview.installmentsToCancel}</strong>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
          Adjusted rows held: <strong>{preview.blockedAdjustedInstallments}</strong>
        </div>
      </div>

      {(preview.blockedFullyPaidInstallments > 0 ||
        preview.blockedPartiallyPaidInstallments > 0) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {preview.blockedFullyPaidInstallments} fully paid and{" "}
          {preview.blockedPartiallyPaidInstallments} partially paid installments are locked
          and will be marked for manual review.
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-600">
          Settings changed
        </p>
        <ul className="space-y-2 text-sm text-slate-700">
          {preview.changedFields.map((item) => (
            <li key={item.field} className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <p className="font-medium text-slate-900">{item.label}</p>
              <p className="text-xs text-slate-600">
                {item.beforeValue} {"->"} {item.afterValue}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PreviewApplyActions({
  state,
  canEdit,
  pending,
  disablePreview,
  previewLabel,
  applyLabel,
}: {
  state: FeeSetupActionState;
  canEdit: boolean;
  pending: boolean;
  disablePreview?: boolean;
  previewLabel: string;
  applyLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {state.changeBatchId ? (
        <input type="hidden" name="changeBatchId" value={state.changeBatchId} />
      ) : null}
      <Button
        type="submit"
        variant="outline"
        name="_intent"
        value="preview"
        disabled={!canEdit || pending || disablePreview}
      >
        {pending ? "Working..." : previewLabel}
      </Button>
      {state.preview && state.changeBatchId ? (
        <Button type="submit" name="_intent" value="apply" disabled={!canEdit || pending}>
          {pending ? "Applying..." : applyLabel}
        </Button>
      ) : null}
    </div>
  );
}

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return "Not saved yet";
  }

  const formatted = new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return Number.isNaN(new Date(value).getTime()) ? value : formatted;
}

function buildEditableFeeHeads(feeHeads: FeeHeadDefinition[]) {
  return feeHeads.map((item, index) => ({
    ...item,
    key: `${item.id}-${index}`,
  }));
}

function createScheduleRow(index: number) {
  return {
    key: `schedule-${index}-${Date.now()}`,
    label: `Installment ${index + 1}`,
    dueDateLabel: "",
  };
}

function useRefreshOnSuccess(
  globalState: FeeSetupActionState,
  schoolState: FeeSetupActionState,
  classState: FeeSetupActionState,
  transportState: FeeSetupActionState,
  studentState: FeeSetupActionState,
) {
  const router = useRouter();

  useEffect(() => {
    if (
      globalState.status === "success" ||
      schoolState.status === "success" ||
      classState.status === "success" ||
      transportState.status === "success" ||
      studentState.status === "success"
    ) {
      router.refresh();
    }
  }, [
    router,
    globalState.status,
    schoolState.status,
    classState.status,
    transportState.status,
    studentState.status,
  ]);
}

function StructureNotice({ state }: { state: StructureActionState }) {
  if (state.status === "idle" || !state.message) {
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
      {state.message}
    </div>
  );
}

function LifecycleStatusSelect({ name, value }: { name: string; value: string }) {
  return (
    <select name={name} defaultValue={value} className={selectClassName}>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
      <option value="archived">Archived</option>
    </select>
  );
}

function FeeHeadCatalogEditor({
  feeHeads,
  setFeeHeads,
  canEdit,
}: {
  feeHeads: EditableFeeHead[];
  setFeeHeads: React.Dispatch<React.SetStateAction<EditableFeeHead[]>>;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label>Fee heads</Label>
          <SectionHint>
            These become the canonical editable fee-head catalog for school, class, and
            student default forms.
          </SectionHint>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canEdit}
          onClick={() =>
            setFeeHeads((current) => [
              ...current,
              { key: `fee-head-${Date.now()}`, id: "", label: "" },
            ])
          }
        >
          Add fee head
        </Button>
      </div>

      {feeHeads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          No custom fee heads yet. Add rows only for heads beyond tuition, transport,
          books, and admission/activity/misc.
        </div>
      ) : (
        <div className="space-y-3">
          {feeHeads.map((item, index) => (
            <div key={item.key} className="grid gap-3 md:grid-cols-[1fr_1.2fr_auto]">
              <div>
                <Label htmlFor={`policy-fee-head-id-${item.key}`}>Head ID</Label>
                <Input
                  id={`policy-fee-head-id-${item.key}`}
                  name="globalCustomFeeHeadId"
                  defaultValue={item.id}
                  placeholder="smart_class_fee"
                  className="mt-2"
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label htmlFor={`policy-fee-head-label-${item.key}`}>Head label</Label>
                <Input
                  id={`policy-fee-head-label-${item.key}`}
                  name="globalCustomFeeHeadLabel"
                  defaultValue={item.label}
                  placeholder="Smart class fee"
                  className="mt-2"
                  disabled={!canEdit}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={!canEdit}
                  onClick={() =>
                    setFeeHeads((current) => current.filter((_, rowIndex) => rowIndex !== index))
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FeeHeadAmountFields({
  prefix,
  feeHeads,
  amounts,
  canEdit,
}: {
  prefix: "school" | "class" | "student";
  feeHeads: FeeHeadDefinition[];
  amounts: Record<string, number>;
  canEdit: boolean;
}) {
  if (feeHeads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Save the global policy catalog first if you need extra fee-head amounts.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {feeHeads.map((item) => (
        <div key={`${prefix}-${item.id}`}>
          <input type="hidden" name={`${prefix}CustomFeeHeadId`} value={item.id} />
          <input type="hidden" name={`${prefix}CustomFeeHeadLabel`} value={item.label} />
          <Label htmlFor={`${prefix}-${item.id}`}>{item.label}</Label>
          <Input
            id={`${prefix}-${item.id}`}
            name={`${prefix}CustomFeeHeadAmount`}
            type="number"
            min={0}
            defaultValue={amounts[item.id] ?? 0}
            className="mt-2"
            disabled={!canEdit}
          />
        </div>
      ))}
    </div>
  );
}

function ClassDefaultsTable({ items }: { items: ClassFeeDefault[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Class</th>
            <th className="px-4 py-3">Session</th>
            <th className="px-4 py-3">Annual total</th>
            <th className="px-4 py-3">Student type</th>
            <th className="px-4 py-3">Transport default</th>
            <th className="px-4 py-3">Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-4 text-slate-500">
                No class defaults saved yet.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 text-slate-700">
                <td className="px-4 py-3 font-medium text-slate-900">{item.classLabel}</td>
                <td className="px-4 py-3">{item.sessionLabel}</td>
                <td className="px-4 py-3">{formatInr(item.annualTotal)}</td>
                <td className="px-4 py-3 capitalize">{item.studentTypeDefault}</td>
                <td className="px-4 py-3">
                  {item.transportAppliesDefault ? "Applies" : "Not applied"}
                </td>
                <td className="px-4 py-3">{formatUpdatedAt(item.updatedAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function TransportDefaultsTable({ items }: { items: TransportDefault[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Route</th>
            <th className="px-4 py-3">Code</th>
            <th className="px-4 py-3">Annual fee</th>
            <th className="px-4 py-3">Installment default</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-4 text-slate-500">
                No transport defaults saved yet.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 text-slate-700">
                <td className="px-4 py-3 font-medium text-slate-900">{item.routeName}</td>
                <td className="px-4 py-3">{item.routeCode ?? "Not set"}</td>
                <td className="px-4 py-3">
                  {item.annualFeeAmount == null ? "Not set" : formatInr(item.annualFeeAmount)}
                </td>
                <td className="px-4 py-3">{formatInr(item.defaultInstallmentAmount)}</td>
                <td className="px-4 py-3">{item.isActive ? "Active" : "Inactive"}</td>
                <td className="px-4 py-3">{formatUpdatedAt(item.updatedAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StudentOverridesTable({ items }: { items: StudentFeeOverride[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Class</th>
            <th className="px-4 py-3">Reason</th>
            <th className="px-4 py-3">Other adj.</th>
            <th className="px-4 py-3">Discount</th>
            <th className="px-4 py-3">Late fee waiver</th>
            <th className="px-4 py-3">Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-4 text-slate-500">
                No active student overrides found.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 text-slate-700">
                <td className="px-4 py-3 font-medium text-slate-900">{item.studentLabel}</td>
                <td className="px-4 py-3">{item.classLabel}</td>
                <td className="px-4 py-3">{item.reason}</td>
                <td className="px-4 py-3">
                  {item.otherAdjustmentAmount
                    ? `${item.otherAdjustmentHead ?? "Other"} (${formatInr(item.otherAdjustmentAmount)})`
                    : "None"}
                </td>
                <td className="px-4 py-3">{formatInr(item.discountAmount)}</td>
                <td className="px-4 py-3">
                  {item.lateFeeWaiverAmount > 0
                    ? formatInr(item.lateFeeWaiverAmount)
                    : "No waiver"}
                </td>
                <td className="px-4 py-3">{formatUpdatedAt(item.updatedAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function AcademicYearSection({
  structureData,
  canEdit,
  structureInitialState,
  createSessionAction,
  updateSessionAction,
  deleteSessionAction,
}: {
  structureData: StructureData;
  canEdit: boolean;
  structureInitialState: StructureActionState;
  createSessionAction: ActionFn<StructureActionState>;
  updateSessionAction: ActionFn<StructureActionState>;
  deleteSessionAction: ActionFn<StructureActionState>;
}) {
  const router = useRouter();
  const [createState, createFormAction] = useActionState(
    createSessionAction,
    structureInitialState,
  );
  const [updateState, updateFormAction] = useActionState(
    updateSessionAction,
    structureInitialState,
  );
  const [deleteState, deleteFormAction] = useActionState(
    deleteSessionAction,
    structureInitialState,
  );

  useEffect(() => {
    if (
      createState.status === "success" ||
      updateState.status === "success" ||
      deleteState.status === "success"
    ) {
      router.refresh();
    }
  }, [router, createState.status, updateState.status, deleteState.status]);

  return (
    <SectionCard
      id="academic-year"
      title="Academic year"
      description="Create, activate, archive, or safely remove academic years. The selected year becomes the live label used by the fee policy below."
      actions={canEdit ? <StatusBadge label="Admin editable" tone="good" /> : <StatusBadge label="Read-only" tone="warning" />}
    >
      <div className="space-y-4">
        <StructureNotice state={createState} />
        <StructureNotice state={updateState} />
        <StructureNotice state={deleteState} />

        {!canEdit ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Academic years are visible here, but only admin staff can create, update, or archive them.
          </div>
        ) : (
          <form action={createFormAction} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-5">
            <div className="md:col-span-2">
              <Label htmlFor="new-session-label">Academic year</Label>
              <Input id="new-session-label" name="sessionLabel" placeholder="2027-28" className="mt-1" required />
            </div>
            <div>
              <Label>Status</Label>
              <LifecycleStatusSelect name="sessionStatus" value="active" />
            </div>
            <div>
              <Label>Make current</Label>
              <select name="isCurrentSession" defaultValue="yes" className={selectClassName}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div>
              <Label htmlFor="new-session-notes">Notes</Label>
              <Input id="new-session-notes" name="sessionNotes" className="mt-1" placeholder="Optional note" />
            </div>
            <div className="md:col-span-5 text-xs text-slate-500">
              Tip: create the new year here first, then save the live fee policy below with the same year label.
            </div>
            <Button type="submit" className="w-fit md:col-span-5">
              Add academic year
            </Button>
          </form>
        )}

        <div className="space-y-3">
          {structureData.sessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              No academic years saved yet. Add the active year before setting live fees.
            </div>
          ) : (
            structureData.sessions.map((session) => (
              <div key={session.id} className="rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{session.session_label}</p>
                    <p className="text-xs text-slate-500">
                      {session.is_current ? "Current academic year" : "Not current"} · {session.status}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {session.is_current ? <StatusBadge label="Current" tone="good" /> : null}
                    {session.status === "archived" ? <StatusBadge label="Archived" tone="warning" /> : null}
                  </div>
                </div>

                <form action={updateFormAction} className="grid gap-3 md:grid-cols-5">
                  <input type="hidden" name="sessionId" value={session.id} />
                  <div className="md:col-span-2">
                    <Label>Academic year</Label>
                    <Input name="sessionLabel" defaultValue={session.session_label} className="mt-1" required />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <LifecycleStatusSelect name="sessionStatus" value={session.status} />
                  </div>
                  <div>
                    <Label>Make current</Label>
                    <select
                      name="isCurrentSession"
                      defaultValue={session.is_current ? "yes" : "no"}
                      className={selectClassName}
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Input name="sessionNotes" defaultValue={session.notes ?? ""} className="mt-1" />
                  </div>
                  <div className="flex flex-wrap gap-2 md:col-span-5">
                    <Button type="submit" disabled={!canEdit}>Save year</Button>
                  </div>
                </form>

                <form action={deleteFormAction} className="mt-3">
                  <input type="hidden" name="sessionId" value={session.id} />
                  <Button type="submit" variant="outline" disabled={!canEdit}>
                    Delete year safely
                  </Button>
                </form>
              </div>
            ))
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function ClassManagementSection({
  structureData,
  canEdit,
  structureInitialState,
  createClassAction,
  updateClassAction,
  deleteClassAction,
}: {
  structureData: StructureData;
  canEdit: boolean;
  structureInitialState: StructureActionState;
  createClassAction: ActionFn<StructureActionState>;
  updateClassAction: ActionFn<StructureActionState>;
  deleteClassAction: ActionFn<StructureActionState>;
}) {
  const router = useRouter();
  const [createState, createFormAction] = useActionState(createClassAction, structureInitialState);
  const [updateState, updateFormAction] = useActionState(updateClassAction, structureInitialState);
  const [deleteState, deleteFormAction] = useActionState(deleteClassAction, structureInitialState);

  useEffect(() => {
    if (
      createState.status === "success" ||
      updateState.status === "success" ||
      deleteState.status === "success"
    ) {
      router.refresh();
    }
  }, [router, createState.status, updateState.status, deleteState.status]);

  return (
    <SectionCard
      id="classes"
      title="Classes"
      description="Add classes, keep their names and order current, and manage safe archival without touching payment history. Class fee amounts are saved in the class defaults section below."
      actions={canEdit ? <StatusBadge label="Admin editable" tone="good" /> : <StatusBadge label="Read-only" tone="warning" />}
    >
      <div className="space-y-4">
        <StructureNotice state={createState} />
        <StructureNotice state={updateState} />
        <StructureNotice state={deleteState} />

        {!canEdit ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Class records are visible here, but only admin staff can change them.
          </div>
        ) : (
          <form action={createFormAction} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-6">
            <div>
              <Label>Academic year</Label>
              <select name="sessionLabel" className={`${selectClassName} mt-1`} required>
                <option value="">Select year</option>
                {structureData.sessions.map((session) => (
                  <option key={session.id} value={session.session_label}>
                    {session.session_label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Class name</Label>
              <Input name="className" className="mt-1" placeholder="Class 1" required />
            </div>
            <div>
              <Label>Section</Label>
              <Input name="section" className="mt-1" placeholder="A" />
            </div>
            <div>
              <Label>Stream</Label>
              <Input name="streamName" className="mt-1" placeholder="Science" />
            </div>
            <div>
              <Label>Sort order</Label>
              <Input name="sortOrder" type="number" min={0} defaultValue={0} className="mt-1" required />
            </div>
            <div>
              <Label>Status</Label>
              <LifecycleStatusSelect name="classStatus" value="active" />
            </div>
            <div className="md:col-span-6">
              <Label>Notes</Label>
              <Input name="classNotes" className="mt-1" placeholder="Optional note" />
            </div>
            <Button type="submit" className="w-fit md:col-span-6">
              Add class
            </Button>
          </form>
        )}

        <div className="space-y-3">
          {structureData.classes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              No classes saved yet.
            </div>
          ) : (
            structureData.classes.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                <form action={updateFormAction} className="grid gap-3 md:grid-cols-6">
                  <input type="hidden" name="classId" value={item.id} />
                  <div>
                    <Label>Academic year</Label>
                    <select name="sessionLabel" defaultValue={item.session_label} className={`${selectClassName} mt-1`} required>
                      {structureData.sessions.map((session) => (
                        <option key={session.id} value={session.session_label}>
                          {session.session_label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Class name</Label>
                    <Input name="className" defaultValue={item.class_name} className="mt-1" required />
                  </div>
                  <div>
                    <Label>Section</Label>
                    <Input name="section" defaultValue={item.section ?? ""} className="mt-1" />
                  </div>
                  <div>
                    <Label>Stream</Label>
                    <Input name="streamName" defaultValue={item.stream_name ?? ""} className="mt-1" />
                  </div>
                  <div>
                    <Label>Sort order</Label>
                    <Input name="sortOrder" type="number" min={0} defaultValue={item.sort_order} className="mt-1" required />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <LifecycleStatusSelect name="classStatus" value={item.status} />
                  </div>
                  <div className="md:col-span-6">
                    <Label>Notes</Label>
                    <Input name="classNotes" defaultValue={item.notes ?? ""} className="mt-1" />
                  </div>
                  <div className="flex flex-wrap gap-2 md:col-span-6">
                    <Button type="submit" disabled={!canEdit}>Save class</Button>
                  </div>
                </form>
                <form action={deleteFormAction} className="mt-3">
                  <input type="hidden" name="classId" value={item.id} />
                  <Button type="submit" variant="outline" disabled={!canEdit}>
                    Delete class safely
                  </Button>
                </form>
              </div>
            ))
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function RouteManagementSection({
  structureData,
  canEdit,
  structureInitialState,
  createRouteAction,
  updateRouteAction,
  deleteRouteAction,
}: {
  structureData: StructureData;
  canEdit: boolean;
  structureInitialState: StructureActionState;
  createRouteAction: ActionFn<StructureActionState>;
  updateRouteAction: ActionFn<StructureActionState>;
  deleteRouteAction: ActionFn<StructureActionState>;
}) {
  const router = useRouter();
  const [createState, createFormAction] = useActionState(createRouteAction, structureInitialState);
  const [updateState, updateFormAction] = useActionState(updateRouteAction, structureInitialState);
  const [deleteState, deleteFormAction] = useActionState(deleteRouteAction, structureInitialState);

  useEffect(() => {
    if (
      createState.status === "success" ||
      updateState.status === "success" ||
      deleteState.status === "success"
    ) {
      router.refresh();
    }
  }, [router, createState.status, updateState.status, deleteState.status]);

  return (
    <SectionCard
      id="transport-routes"
      title="Transport routes"
      description="Add routes, adjust route codes and amounts, and archive unused routes safely. No Transport is handled by turning transport off for a student or class; it does not need a dummy route row."
      actions={canEdit ? <StatusBadge label="Admin editable" tone="good" /> : <StatusBadge label="Read-only" tone="warning" />}
    >
      <div className="space-y-4">
        <StructureNotice state={createState} />
        <StructureNotice state={updateState} />
        <StructureNotice state={deleteState} />

        {!canEdit ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Transport routes are visible here, but only admin staff can change them.
          </div>
        ) : (
          <form action={createFormAction} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-5">
            <div>
              <Label>Route code</Label>
              <Input name="routeCode" className="mt-1" placeholder="R1" />
            </div>
            <div>
              <Label>Route name</Label>
              <Input name="routeName" className="mt-1" placeholder="Main town route" required />
            </div>
            <div>
              <Label>Annual fee</Label>
              <Input name="annualFeeAmount" type="number" min={0} defaultValue={0} className="mt-1" />
            </div>
            <div>
              <Label>Legacy installment amount</Label>
              <Input name="defaultInstallmentAmount" type="number" min={0} defaultValue={0} className="mt-1" required />
            </div>
            <div>
              <Label>Status</Label>
              <select name="routeIsActive" defaultValue="yes" className={`${selectClassName} mt-1`}>
                <option value="yes">Active</option>
                <option value="no">Inactive</option>
              </select>
            </div>
            <div className="md:col-span-5">
              <Label>Notes</Label>
              <Input name="routeNotes" className="mt-1" placeholder="Optional note" />
            </div>
            <Button type="submit" className="w-fit md:col-span-5">
              Add route
            </Button>
          </form>
        )}

        <div className="space-y-3">
          {structureData.routes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              No transport routes saved yet.
            </div>
          ) : (
            structureData.routes.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                <form action={updateFormAction} className="grid gap-3 md:grid-cols-5">
                  <input type="hidden" name="routeId" value={item.id} />
                  <div>
                    <Label>Route code</Label>
                    <Input name="routeCode" defaultValue={item.route_code ?? ""} className="mt-1" />
                  </div>
                  <div>
                    <Label>Route name</Label>
                    <Input name="routeName" defaultValue={item.route_name} className="mt-1" required />
                  </div>
                  <div>
                    <Label>Annual fee</Label>
                    <Input
                      name="annualFeeAmount"
                      type="number"
                      min={0}
                      defaultValue={item.annual_fee_amount ?? 0}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Legacy installment amount</Label>
                    <Input
                      name="defaultInstallmentAmount"
                      type="number"
                      min={0}
                      defaultValue={item.default_installment_amount}
                      className="mt-1"
                      required
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <select
                      name="routeIsActive"
                      defaultValue={item.is_active ? "yes" : "no"}
                      className={`${selectClassName} mt-1`}
                    >
                      <option value="yes">Active</option>
                      <option value="no">Inactive</option>
                    </select>
                  </div>
                  <div className="md:col-span-5">
                    <Label>Notes</Label>
                    <Input name="routeNotes" defaultValue={item.notes ?? ""} className="mt-1" />
                  </div>
                  <div className="flex flex-wrap gap-2 md:col-span-5">
                    <Button type="submit" disabled={!canEdit}>Save route</Button>
                  </div>
                </form>
                <form action={deleteFormAction} className="mt-3">
                  <input type="hidden" name="routeId" value={item.id} />
                  <Button type="submit" variant="outline" disabled={!canEdit}>
                    Delete route safely
                  </Button>
                </form>
              </div>
            ))
          )}
        </div>
      </div>
    </SectionCard>
  );
}

export function FeeSetupClient({
  data,
  structureData,
  canEdit,
  canStructureEdit,
  saveGlobalPolicyAction,
  saveSchoolDefaultsAction,
  saveClassDefaultsAction,
  saveTransportDefaultsAction,
  saveStudentOverrideAction,
  createSessionAction,
  updateSessionAction,
  deleteSessionAction,
  createClassAction,
  updateClassAction,
  deleteClassAction,
  createRouteAction,
  updateRouteAction,
  deleteRouteAction,
  initialState,
  structureInitialState,
}: FeeSetupClientProps) {
  const [globalState, globalFormAction, globalPending] = useActionState(
    saveGlobalPolicyAction,
    initialState,
  );
  const [schoolState, schoolFormAction, schoolPending] = useActionState(
    saveSchoolDefaultsAction,
    initialState,
  );
  const [classState, classFormAction, classPending] = useActionState(
    saveClassDefaultsAction,
    initialState,
  );
  const [transportState, transportFormAction, transportPending] = useActionState(
    saveTransportDefaultsAction,
    initialState,
  );
  const [studentState, studentFormAction, studentPending] = useActionState(
    saveStudentOverrideAction,
    initialState,
  );

  useRefreshOnSuccess(
    globalState,
    schoolState,
    classState,
    transportState,
    studentState,
  );

  const [feeHeads, setFeeHeads] = useState(() =>
    buildEditableFeeHeads(data.globalPolicy.customFeeHeads),
  );
  const [scheduleRows, setScheduleRows] = useState(() =>
    data.globalPolicy.installmentSchedule.map((item, index) => ({
      key: `schedule-${index}`,
      label: item.label,
      dueDateLabel: item.dueDateLabel,
    })),
  );
  const [selectedClassId, setSelectedClassId] = useState(
    data.classDefaults[0]?.classId ?? "",
  );
  const [selectedRouteId, setSelectedRouteId] = useState(
    data.transportDefaults[0]?.id ?? "",
  );
  const [selectedStudentId, setSelectedStudentId] = useState(
    data.studentOverrides[0]?.studentId ?? "",
  );

  const selectedClassDefault =
    data.classDefaults.find((item) => item.classId === selectedClassId) ?? null;
  const selectedRouteDefault =
    data.transportDefaults.find((item) => item.id === selectedRouteId) ?? null;
  const selectedStudentOverride =
    data.studentOverrides.find((item) => item.studentId === selectedStudentId) ?? null;

  const schoolDefault = data.schoolDefault;
  const effectiveFeeHeads = data.globalPolicy.customFeeHeads;
  const currentAcademicYear =
    structureData.sessions.find((item) => item.is_current)?.session_label ??
    structureData.currentSessionLabel ??
    data.globalPolicy.academicSessionLabel;
  const activeClassesCount = structureData.classes.filter((item) => item.status === "active").length;
  const activeRoutesCount = structureData.routes.filter((item) => item.is_active).length;
  const dueDateSummary = data.globalPolicy.installmentSchedule
    .map((item) => item.dueDateLabel)
    .join(", ");

  return (
    <div className="space-y-6">
      <SectionCard
        title="Fee setup at a glance"
        description="Everything that decides what students should pay lives here. Start with the school structure, then save the live fee policy, then set defaults for classes and transport."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <SetupSummaryCard
            label="Academic year"
            value={currentAcademicYear}
            detail="Create or switch the live year used by fee setup."
            href="#structure-setup"
          />
          <SetupSummaryCard
            label="Classes"
            value={`${activeClassesCount} active`}
            detail="Add, archive, or review the class list before class-wise fee defaults."
            href="#structure-setup"
          />
          <SetupSummaryCard
            label="Transport routes"
            value={`${activeRoutesCount} active`}
            detail="Keep route names and fees current for transport-linked students."
            href="#structure-setup"
          />
          <SetupSummaryCard
            label="Academic fees"
            value={`${formatInr(data.globalPolicy.newStudentAcademicFeeAmount)} / ${formatInr(data.globalPolicy.oldStudentAcademicFeeAmount)}`}
            detail="Set separate academic fees for new and old students."
            href="#live-policy"
          />
          <SetupSummaryCard
            label="Installments"
            value={`${scheduleRows.length} installments`}
            detail={dueDateSummary || "Add due dates for each installment."}
            href="#live-policy"
          />
          <SetupSummaryCard
            label="Other fee types"
            value={
              effectiveFeeHeads.length === 0
                ? "No extra heads"
                : `${effectiveFeeHeads.length} extra heads`
            }
            detail="Create custom fee types beyond tuition, transport, books, and misc."
            href="#live-policy"
          />
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-sm font-semibold text-slate-950">Simple admin workflow</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              1. Create the academic year, classes, and transport routes.
              <br />
              2. Save the live fee policy with academic fees, installments, due dates, fine, payment modes, and other fee heads.
              <br />
              3. Set school, class, and route defaults.
              <br />
              4. Use student exceptions only for approved special cases.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-sm font-semibold text-slate-950">Access model already in place</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Admin has full access here.
              <br />
              Accountant can review fee setup and works mainly from Payment Desk.
              <br />
              View-only staff can review current settings without changing them.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        id="structure-setup"
        title="1. School structure"
        description="These are the basic lists used by fee setup: academic year, classes, and transport routes. Keep them correct first, then save fee amounts below."
      >
        <div className="mb-5 flex flex-wrap gap-2">
          <ValueStatePill tone="editable">Admin list setup</ValueStatePill>
          <ValueStatePill tone="policy">Live fee policy uses these lists</ValueStatePill>
          <ValueStatePill tone="locked">Payments stay untouched</ValueStatePill>
        </div>
        <div className="space-y-4">
          <ExpandableSection
            title="Academic year"
            description="Create the year label that the live policy should use."
            badge={
              canStructureEdit ? (
                <StatusBadge label="Admin editable" tone="good" />
              ) : (
                <StatusBadge label="Read-only" tone="warning" />
              )
            }
            defaultOpen
          >
            <AcademicYearSection
              structureData={structureData}
              canEdit={canStructureEdit}
              structureInitialState={structureInitialState}
              createSessionAction={createSessionAction}
              updateSessionAction={updateSessionAction}
              deleteSessionAction={deleteSessionAction}
            />
          </ExpandableSection>

          <ExpandableSection
            title="Classes"
            description="Add or archive classes here. Class-wise amounts are saved later in class defaults."
            badge={
              canStructureEdit ? (
                <StatusBadge label="Admin editable" tone="good" />
              ) : (
                <StatusBadge label="Read-only" tone="warning" />
              )
            }
          >
            <ClassManagementSection
              structureData={structureData}
              canEdit={canStructureEdit}
              structureInitialState={structureInitialState}
              createClassAction={createClassAction}
              updateClassAction={updateClassAction}
              deleteClassAction={deleteClassAction}
            />
          </ExpandableSection>

          <ExpandableSection
            title="Transport routes"
            description="Add, remove, or archive route records used by transport fee defaults."
            badge={
              canStructureEdit ? (
                <StatusBadge label="Admin editable" tone="good" />
              ) : (
                <StatusBadge label="Read-only" tone="warning" />
              )
            }
          >
            <RouteManagementSection
              structureData={structureData}
              canEdit={canStructureEdit}
              structureInitialState={structureInitialState}
              createRouteAction={createRouteAction}
              updateRouteAction={updateRouteAction}
              deleteRouteAction={deleteRouteAction}
            />
          </ExpandableSection>
        </div>
      </SectionCard>

      <SectionCard
        title="How saving works"
        description="The screen now follows one rule: edit values, review impact, then save. Paid history remains protected."
      >
        <div className="flex flex-wrap gap-2">
          <ValueStatePill tone="editable">Editable</ValueStatePill>
          <ValueStatePill tone="policy">Policy-driven</ValueStatePill>
          <ValueStatePill tone="calculated">Calculated impact</ValueStatePill>
          <ValueStatePill tone="locked">Locked paid history</ValueStatePill>
          <ValueStatePill tone="review">Review needed</ValueStatePill>
        </div>
      </SectionCard>

      {!canEdit ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          You can review the current fee setup here, but only admin staff can change live rules, defaults, academic years, classes, or transport routes.
        </div>
      ) : null}

      <SectionCard
        id="live-policy"
        title="2. Live fee policy"
        description="Set the active academic year, academic fees, installments, due dates, fine, payment modes, receipt prefix, and extra fee types in one place."
        actions={
          canEdit ? (
            <StatusBadge label="Admin editable" tone="good" />
          ) : (
            <StatusBadge label="Admin only" tone="warning" />
          )
        }
      >
        <form action={globalFormAction} className="space-y-5">
          <ActionNotice state={globalState} />
          <ImpactPreviewCard preview={globalState.preview} />

          <input type="hidden" name="calculationModel" value={data.globalPolicy.calculationModel} />

          <FormGroup
            title="Main policy details"
            description="Choose the live academic year and set the high-level rules used across the app."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div>
                <Label htmlFor="policy-academic-session">Academic session</Label>
                <Input
                  id="policy-academic-session"
                  name="academicSessionLabel"
                  defaultValue={data.globalPolicy.academicSessionLabel}
                  className="mt-2"
                  disabled={!canEdit}
                  required
                />
              </div>
              <div>
                <Label htmlFor="policy-calculation-model">Calculation mode</Label>
                <Input
                  id="policy-calculation-model"
                  value={
                    data.globalPolicy.calculationModel === "workbook_v1"
                      ? "Workbook AY 2026-27"
                      : "Standard"
                  }
                  className="mt-2"
                  disabled
                  readOnly
                />
              </div>
              <div>
                <Label htmlFor="policy-installment-count">Installment count</Label>
                <Input
                  id="policy-installment-count"
                  value={scheduleRows.length}
                  className="mt-2"
                  disabled
                  readOnly
                />
              </div>
              <div id="fine">
                <Label htmlFor="policy-late-fee">Late fee rule</Label>
                <select
                  id="policy-late-fee-enabled"
                  name="lateFeeEnabled"
                  defaultValue={data.globalPolicy.lateFeeFlatAmount > 0 ? "yes" : "no"}
                  className={`${selectClassName} mt-2`}
                  disabled={!canEdit}
                >
                  <option value="yes">Enabled</option>
                  <option value="no">Disabled</option>
                </select>
                <Input
                  id="policy-late-fee"
                  name="lateFeeFlatAmount"
                  type="number"
                  min={0}
                  defaultValue={data.globalPolicy.lateFeeFlatAmount}
                  className="mt-2"
                  disabled={!canEdit}
                  required
                />
              </div>
              <div>
                <Label htmlFor="policy-receipt-prefix">Receipt prefix</Label>
                <Input
                  id="policy-receipt-prefix"
                  name="receiptPrefix"
                  defaultValue={data.globalPolicy.receiptPrefix}
                  className="mt-2 uppercase"
                  disabled={!canEdit}
                  required
                />
              </div>
            </div>
          </FormGroup>

          <FormGroup
            title="Academic fees for students"
            description="Set the academic fee amount separately for new students and old students."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="policy-new-academic-fee">New student academic fee</Label>
                <Input
                  id="policy-new-academic-fee"
                  name="newStudentAcademicFeeAmount"
                  type="number"
                  min={0}
                  defaultValue={data.globalPolicy.newStudentAcademicFeeAmount}
                  className="mt-2"
                  disabled={!canEdit}
                  required
                />
              </div>
              <div>
                <Label htmlFor="policy-old-academic-fee">Old student academic fee</Label>
                <Input
                  id="policy-old-academic-fee"
                  name="oldStudentAcademicFeeAmount"
                  type="number"
                  min={0}
                  defaultValue={data.globalPolicy.oldStudentAcademicFeeAmount}
                  className="mt-2"
                  disabled={!canEdit}
                  required
                />
              </div>
            </div>
          </FormGroup>

          <FormGroup
            title="Installments and due dates"
            description="Decide how many installments are needed and the due date label for each one."
          >
            <div id="installments" className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionHint>
                  Review changes first. Paid and partially paid rows stay untouched and are marked for review when needed.
                </SectionHint>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canEdit}
                  onClick={() =>
                    setScheduleRows((current) => [...current, createScheduleRow(current.length)])
                  }
                >
                  Add installment
                </Button>
              </div>

              <div className="space-y-3">
                {scheduleRows.map((item, index) => (
                  <div
                    key={item.key}
                    className="grid gap-3 md:grid-cols-[1fr_1fr_auto] xl:grid-cols-[1fr_1fr_auto]"
                  >
                    <div>
                      <Label htmlFor={`schedule-label-${item.key}`}>Label</Label>
                      <Input
                        id={`schedule-label-${item.key}`}
                        name="scheduleLabel"
                        defaultValue={item.label}
                        className="mt-2"
                        disabled={!canEdit}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor={`schedule-due-${item.key}`}>Due date label</Label>
                      <Input
                        id={`schedule-due-${item.key}`}
                        name="scheduleDueDateLabel"
                        defaultValue={item.dueDateLabel}
                        placeholder="20 April"
                        className="mt-2"
                        disabled={!canEdit}
                        required
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={!canEdit || scheduleRows.length <= 1}
                        onClick={() =>
                          setScheduleRows((current) =>
                            current.filter((_, rowIndex) => rowIndex !== index),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FormGroup>

          <FormGroup
            title="Payment modes and other fee types"
            description="Choose allowed payment modes and create any extra fee heads the school wants to track."
          >
            <div className="space-y-5">
              <div className="space-y-3">
                <Label>Accepted payment modes</Label>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {paymentModeOptions.map((option) => {
                    const defaultChecked = data.globalPolicy.acceptedPaymentModes.some(
                      (item) => item.value === option.value,
                    );

                    return (
                      <label
                        key={option.value}
                        className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          name="acceptedPaymentModes"
                          value={option.value}
                          defaultChecked={defaultChecked}
                          disabled={!canEdit}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div id="other-fee-types" className="space-y-3">
                <FeeHeadCatalogEditor
                  feeHeads={feeHeads}
                  setFeeHeads={setFeeHeads}
                  canEdit={canEdit}
                />
              </div>
            </div>
          </FormGroup>

          <div>
            <Label htmlFor="policy-notes">Policy notes</Label>
            <textarea
              id="policy-notes"
              name="globalNotes"
              defaultValue={data.globalPolicy.notes ?? ""}
              className={`${textAreaClassName} mt-2`}
              disabled={!canEdit}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <SectionHint>
              Current policy: {data.globalPolicy.academicSessionLabel} | {data.globalPolicy.lateFeeLabel} | new academic fee{" "}
              {formatInr(data.globalPolicy.newStudentAcademicFeeAmount)} | old academic fee{" "}
              {formatInr(data.globalPolicy.oldStudentAcademicFeeAmount)} |{" "}
              {data.globalPolicy.installmentSchedule.map((item) => item.dueDateLabel).join(", ")}
            </SectionHint>
            <PreviewApplyActions
              state={globalState}
              canEdit={canEdit}
              pending={globalPending}
              previewLabel="Review policy changes"
              applyLabel="Save policy changes"
            />
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="3. School-wide defaults"
        description="These are the base amounts used if a class does not have its own saved default yet."
        actions={
          canEdit ? (
            <StatusBadge label="Editable in Fee Setup" tone="good" />
          ) : (
            <StatusBadge label="Read-only" tone="warning" />
          )
        }
      >
        <form action={schoolFormAction} className="space-y-5">
          <ActionNotice state={schoolState} />
          <ImpactPreviewCard preview={schoolState.preview} />

          <FormGroup
            title="Base amounts"
            description="These values act as the fallback for students or classes without a more specific fee setup."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <Label htmlFor="school-tuition-fee">Tuition fee</Label>
                <Input
                  id="school-tuition-fee"
                  name="tuitionFee"
                  type="number"
                  min={0}
                  defaultValue={schoolDefault.tuitionFee}
                  className="mt-2"
                  disabled={!canEdit}
                  required
                />
              </div>
              <div>
                <Label htmlFor="school-transport-fee">Transport fee</Label>
                <Input
                  id="school-transport-fee"
                  name="transportFee"
                  type="number"
                  min={0}
                  defaultValue={schoolDefault.transportFee}
                  className="mt-2"
                  disabled={!canEdit}
                  required
                />
              </div>
              <div>
                <Label htmlFor="school-books-fee">Books fee</Label>
                <Input
                  id="school-books-fee"
                  name="booksFee"
                  type="number"
                  min={0}
                  defaultValue={schoolDefault.booksFee}
                  className="mt-2"
                  disabled={!canEdit}
                  required
                />
              </div>
              <div>
                <Label htmlFor="school-misc-fee">Admission/activity/misc fee</Label>
                <Input
                  id="school-misc-fee"
                  name="admissionActivityMiscFee"
                  type="number"
                  min={0}
                  defaultValue={schoolDefault.admissionActivityMiscFee}
                  className="mt-2"
                  disabled={!canEdit}
                  required
                />
              </div>
              <div>
                <Label htmlFor="school-student-type">Student type default</Label>
                <select
                  id="school-student-type"
                  name="studentTypeDefault"
                  defaultValue={schoolDefault.studentTypeDefault}
                  className={`${selectClassName} mt-2`}
                  disabled={!canEdit}
                >
                  <option value="existing">Existing</option>
                  <option value="new">New</option>
                </select>
              </div>
              <div>
                <Label htmlFor="school-transport-applies">Transport applies default</Label>
                <select
                  id="school-transport-applies"
                  name="transportAppliesDefault"
                  defaultValue={schoolDefault.transportAppliesDefault ? "yes" : "no"}
                  className={`${selectClassName} mt-2`}
                  disabled={!canEdit}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>
          </FormGroup>

          <FormGroup
            title="Extra fee heads"
            description="If you created extra fee types in the live policy above, set their default amounts here."
          >
            <div className="space-y-3">
              <Label>School custom fee-head amounts</Label>
              <FeeHeadAmountFields
                prefix="school"
                feeHeads={effectiveFeeHeads}
                amounts={schoolDefault.customFeeHeadAmounts}
                canEdit={canEdit}
              />
            </div>
          </FormGroup>

          <div>
            <Label htmlFor="school-notes">Notes</Label>
            <textarea
              id="school-notes"
              name="notes"
              defaultValue={schoolDefault.notes ?? ""}
              className={`${textAreaClassName} mt-2`}
              disabled={!canEdit}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <SectionHint>Last updated: {formatUpdatedAt(schoolDefault.updatedAt)}</SectionHint>
            <PreviewApplyActions
              state={schoolState}
              canEdit={canEdit}
              pending={schoolPending}
              previewLabel="Review school changes"
              applyLabel="Save school defaults"
            />
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="4. Class-wise fee defaults"
        description="Save a different default only for classes that need their own fee amounts. Otherwise the school-wide defaults stay in effect."
        actions={
          canEdit ? (
            <StatusBadge label="Editable in Fee Setup" tone="good" />
          ) : (
            <StatusBadge label="Read-only" tone="warning" />
          )
        }
      >
        <form key={selectedClassId || "new-class"} action={classFormAction} className="space-y-5">
          <ActionNotice state={classState} />
          <ImpactPreviewCard preview={classState.preview} />

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="class-select">Class</Label>
              <select
                id="class-select"
                name="classId"
                value={selectedClassId}
                onChange={(event) => setSelectedClassId(event.target.value)}
                className={`${selectClassName} mt-2`}
                disabled={!canEdit || data.classOptions.length === 0}
                required
              >
                <option value="">Select class</option>
                {data.classOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} ({item.sessionLabel})
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {selectedClassDefault ? (
                <>
                  Editing the live default for <strong>{selectedClassDefault.classLabel}</strong>.
                </>
              ) : (
                <>Choose a class to create or update its live default.</>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label htmlFor="class-tuition-fee">Tuition fee</Label>
              <Input
                id="class-tuition-fee"
                name="tuitionFee"
                type="number"
                min={0}
                defaultValue={selectedClassDefault?.tuitionFee ?? schoolDefault.tuitionFee}
                className="mt-2"
                disabled={!canEdit}
                required
              />
            </div>
            <div>
              <Label htmlFor="class-transport-fee">Transport fee</Label>
              <Input
                id="class-transport-fee"
                name="transportFee"
                type="number"
                min={0}
                defaultValue={selectedClassDefault?.transportFee ?? schoolDefault.transportFee}
                className="mt-2"
                disabled={!canEdit}
                required
              />
            </div>
            <div>
              <Label htmlFor="class-books-fee">Books fee</Label>
              <Input
                id="class-books-fee"
                name="booksFee"
                type="number"
                min={0}
                defaultValue={selectedClassDefault?.booksFee ?? schoolDefault.booksFee}
                className="mt-2"
                disabled={!canEdit}
                required
              />
            </div>
            <div>
              <Label htmlFor="class-misc-fee">Admission/activity/misc fee</Label>
              <Input
                id="class-misc-fee"
                name="admissionActivityMiscFee"
                type="number"
                min={0}
                defaultValue={
                  selectedClassDefault?.admissionActivityMiscFee ??
                  schoolDefault.admissionActivityMiscFee
                }
                className="mt-2"
                disabled={!canEdit}
                required
              />
            </div>
            <div>
              <Label htmlFor="class-student-type">Student type default</Label>
              <select
                id="class-student-type"
                name="studentTypeDefault"
                defaultValue={
                  selectedClassDefault?.studentTypeDefault ?? schoolDefault.studentTypeDefault
                }
                className={`${selectClassName} mt-2`}
                disabled={!canEdit}
              >
                <option value="existing">Existing</option>
                <option value="new">New</option>
              </select>
            </div>
            <div>
              <Label htmlFor="class-transport-applies">Transport applies default</Label>
              <select
                id="class-transport-applies"
                name="transportAppliesDefault"
                defaultValue={
                  (selectedClassDefault?.transportAppliesDefault ??
                  schoolDefault.transportAppliesDefault)
                    ? "yes"
                    : "no"
                }
                className={`${selectClassName} mt-2`}
                disabled={!canEdit}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Class custom fee-head amounts</Label>
            <FeeHeadAmountFields
              prefix="class"
              feeHeads={effectiveFeeHeads}
              amounts={selectedClassDefault?.customFeeHeadAmounts ?? schoolDefault.customFeeHeadAmounts}
              canEdit={canEdit}
            />
          </div>

          <div>
            <Label htmlFor="class-notes">Notes</Label>
            <textarea
              id="class-notes"
              name="notes"
              defaultValue={selectedClassDefault?.notes ?? ""}
              className={`${textAreaClassName} mt-2`}
              disabled={!canEdit}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <SectionHint>
              {selectedClassDefault
                ? `Last updated: ${formatUpdatedAt(selectedClassDefault.updatedAt)}`
                : "The saved class default will become the live record for this class."}
            </SectionHint>
            <PreviewApplyActions
              state={classState}
              canEdit={canEdit}
              pending={classPending}
              disablePreview={!selectedClassId}
              previewLabel="Review class changes"
              applyLabel="Save class defaults"
            />
          </div>
        </form>

        <details className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-700">
            View saved class defaults ({data.classDefaults.length})
          </summary>
          <div className="border-t border-slate-200 bg-white p-4">
            <ClassDefaultsTable items={data.classDefaults} />
          </div>
        </details>
      </SectionCard>

      <SectionCard
        title="5. Transport route defaults"
        description="Set route-wise transport fees. These apply only to future and unpaid dues and do not rewrite paid history."
        actions={
          canEdit ? (
            <StatusBadge label="Editable in Fee Setup" tone="good" />
          ) : (
            <StatusBadge label="Read-only" tone="warning" />
          )
        }
      >
        <form
          key={selectedRouteId || "new-route"}
          action={transportFormAction}
          className="space-y-5"
        >
          <ActionNotice state={transportState} />
          <ImpactPreviewCard preview={transportState.preview} />

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="route-select">Route</Label>
              <select
                id="route-select"
                value={selectedRouteId}
                onChange={(event) => setSelectedRouteId(event.target.value)}
                className={`${selectClassName} mt-2`}
                disabled={!canEdit}
              >
                <option value="">Create new route default</option>
                {data.routeOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                    {item.routeCode ? ` (${item.routeCode})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Annual route fee is the workbook source of truth. The installment amount stays only
              for legacy compatibility with older flows.
            </div>
          </div>

          <input type="hidden" name="routeId" value={selectedRouteDefault?.id ?? ""} />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <Label htmlFor="route-code">Route code</Label>
              <Input
                id="route-code"
                name="routeCode"
                defaultValue={selectedRouteDefault?.routeCode ?? ""}
                className="mt-2"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label htmlFor="route-name">Route name</Label>
              <Input
                id="route-name"
                name="routeName"
                defaultValue={selectedRouteDefault?.routeName ?? ""}
                className="mt-2"
                disabled={!canEdit}
                required
              />
            </div>
            <div>
              <Label htmlFor="route-annual-fee">Annual route fee</Label>
              <Input
                id="route-annual-fee"
                name="annualFeeAmount"
                type="number"
                min={0}
                defaultValue={selectedRouteDefault?.annualFeeAmount ?? ""}
                className="mt-2"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label htmlFor="route-default-amount">Legacy installment amount</Label>
              <Input
                id="route-default-amount"
                name="defaultInstallmentAmount"
                type="number"
                min={0}
                defaultValue={selectedRouteDefault?.defaultInstallmentAmount ?? 0}
                className="mt-2"
                disabled={!canEdit}
                required
              />
            </div>
            <div>
              <Label htmlFor="route-status">Route status</Label>
              <select
                id="route-status"
                name="isActive"
                defaultValue={selectedRouteDefault?.isActive === false ? "no" : "yes"}
                className={`${selectClassName} mt-2`}
                disabled={!canEdit}
              >
                <option value="yes">Active</option>
                <option value="no">Inactive</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="route-notes">Notes</Label>
            <textarea
              id="route-notes"
              name="notes"
              defaultValue={selectedRouteDefault?.notes ?? ""}
              className={`${textAreaClassName} mt-2`}
              disabled={!canEdit}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <SectionHint>
              {selectedRouteDefault
                ? `Last updated: ${formatUpdatedAt(selectedRouteDefault.updatedAt)}`
                : "New routes can be added here without touching paid history."}
            </SectionHint>
            <PreviewApplyActions
              state={transportState}
              canEdit={canEdit}
              pending={transportPending}
              previewLabel="Review route changes"
              applyLabel="Save route default"
            />
          </div>
        </form>

        <details className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-700">
            View saved route defaults ({data.transportDefaults.length})
          </summary>
          <div className="border-t border-slate-200 bg-white p-4">
            <TransportDefaultsTable items={data.transportDefaults} />
          </div>
        </details>
      </SectionCard>

      <SectionCard
        title="6. Student exceptions"
        description="Use this only for approved special cases. Student exceptions sit on top of the live class or school defaults."
        actions={
          canEdit ? (
            <StatusBadge label="Editable in Fee Setup" tone="good" />
          ) : (
            <StatusBadge label="Read-only" tone="warning" />
          )
        }
      >
        <form
          key={selectedStudentId || "new-student-override"}
          action={studentFormAction}
          className="space-y-5"
        >
          <ActionNotice state={studentState} />
          <ImpactPreviewCard preview={studentState.preview} />

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="student-select">Student</Label>
              <select
                id="student-select"
                name="studentId"
                value={selectedStudentId}
                onChange={(event) => setSelectedStudentId(event.target.value)}
                className={`${selectClassName} mt-2`}
                disabled={!canEdit || data.studentOptions.length === 0}
                required
              >
                <option value="">Select student</option>
                {data.studentOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} - {item.classLabel}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Save the class default first. Student exceptions sit on top of the live class or school defaults.
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label htmlFor="student-custom-tuition">Custom tuition fee</Label>
              <Input
                id="student-custom-tuition"
                name="customTuitionFeeAmount"
                type="number"
                min={0}
                defaultValue={selectedStudentOverride?.customTuitionFeeAmount ?? ""}
                className="mt-2"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label htmlFor="student-custom-transport">Custom transport fee</Label>
              <Input
                id="student-custom-transport"
                name="customTransportFeeAmount"
                type="number"
                min={0}
                defaultValue={selectedStudentOverride?.customTransportFeeAmount ?? ""}
                className="mt-2"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label htmlFor="student-custom-books">Custom books fee</Label>
              <Input
                id="student-custom-books"
                name="customBooksFeeAmount"
                type="number"
                min={0}
                defaultValue={selectedStudentOverride?.customBooksFeeAmount ?? ""}
                className="mt-2"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label htmlFor="student-custom-misc">Custom admission/activity/misc fee</Label>
              <Input
                id="student-custom-misc"
                name="customAdmissionActivityMiscFeeAmount"
                type="number"
                min={0}
                defaultValue={
                  selectedStudentOverride?.customAdmissionActivityMiscFeeAmount ?? ""
                }
                className="mt-2"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label htmlFor="student-custom-late-fee">Custom late fee</Label>
              <Input
                id="student-custom-late-fee"
                name="customLateFeeFlatAmount"
                type="number"
                min={0}
                defaultValue={selectedStudentOverride?.customLateFeeFlatAmount ?? ""}
                className="mt-2"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label htmlFor="student-discount-amount">Discount amount</Label>
              <Input
                id="student-discount-amount"
                name="discountAmount"
                type="number"
                min={0}
                defaultValue={selectedStudentOverride?.discountAmount ?? 0}
                className="mt-2"
                disabled={!canEdit}
                required
              />
            </div>
            <div>
              <Label htmlFor="student-late-fee-waiver">Late fee waiver</Label>
              <Input
                id="student-late-fee-waiver"
                name="lateFeeWaiverAmount"
                type="number"
                min={0}
                defaultValue={selectedStudentOverride?.lateFeeWaiverAmount ?? 0}
                className="mt-2"
                disabled={!canEdit}
                required
              />
            </div>
            <div>
              <Label htmlFor="student-type-override">Student type override</Label>
              <select
                id="student-type-override"
                name="studentTypeOverride"
                defaultValue={selectedStudentOverride?.studentTypeOverride ?? ""}
                className={`${selectClassName} mt-2`}
                disabled={!canEdit}
              >
                <option value="">No override</option>
                <option value="existing">Existing</option>
                <option value="new">New</option>
              </select>
            </div>
            <div>
              <Label htmlFor="student-transport-override">Transport applies override</Label>
              <select
                id="student-transport-override"
                name="transportAppliesOverride"
                defaultValue={
                  selectedStudentOverride?.transportAppliesOverride == null
                    ? ""
                    : selectedStudentOverride.transportAppliesOverride
                      ? "yes"
                      : "no"
                }
                className={`${selectClassName} mt-2`}
                disabled={!canEdit}
              >
                <option value="">No override</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="student-other-adjustment-head">Other fee / adjustment head</Label>
              <Input
                id="student-other-adjustment-head"
                name="otherAdjustmentHead"
                defaultValue={selectedStudentOverride?.otherAdjustmentHead ?? ""}
                placeholder="Example: notebook adjustment"
                className="mt-2"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label htmlFor="student-other-adjustment-amount">Other fee / adjustment amount</Label>
              <Input
                id="student-other-adjustment-amount"
                name="otherAdjustmentAmount"
                type="number"
                defaultValue={selectedStudentOverride?.otherAdjustmentAmount ?? ""}
                placeholder="Use a negative number for a concession"
                className="mt-2"
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Student custom fee-head amounts</Label>
            <FeeHeadAmountFields
              prefix="student"
              feeHeads={effectiveFeeHeads}
              amounts={selectedStudentOverride?.customFeeHeadAmounts ?? {}}
              canEdit={canEdit}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="student-reason">Reason</Label>
              <Input
                id="student-reason"
                name="reason"
                defaultValue={selectedStudentOverride?.reason ?? ""}
                placeholder="Example: management-approved concession"
                className="mt-2"
                disabled={!canEdit}
                required
              />
            </div>
            <div>
              <Label htmlFor="student-notes">Notes</Label>
              <textarea
                id="student-notes"
                name="notes"
                defaultValue={selectedStudentOverride?.notes ?? ""}
                className={`${textAreaClassName} mt-2`}
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <SectionHint>
              {selectedStudentOverride
                ? `Last updated: ${formatUpdatedAt(selectedStudentOverride.updatedAt)}`
                : "Overrides never rewrite paid receipts, payments, or adjustments."}
            </SectionHint>
            <PreviewApplyActions
              state={studentState}
              canEdit={canEdit}
              pending={studentPending}
              disablePreview={!selectedStudentId}
              previewLabel="Review student changes"
              applyLabel="Save student exception"
            />
          </div>
        </form>

        <details className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-700">
            View saved student exceptions ({data.studentOverrides.length})
          </summary>
          <div className="border-t border-slate-200 bg-white p-4">
            <StudentOverridesTable items={data.studentOverrides} />
          </div>
        </details>
      </SectionCard>
    </div>
  );
}

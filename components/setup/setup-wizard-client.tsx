"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { ValueStatePill } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PaymentMode } from "@/lib/db/types";
import { formatInr } from "@/lib/helpers/currency";
import type {
  SetupActionState,
  SetupClassDefaultRow,
  SetupClassRow,
  SetupRouteRow,
  SetupWizardData,
} from "@/lib/setup/types";

type SetupWizardClientProps = {
  data: SetupWizardData;
  saveSetupPolicyAction: (
    previous: SetupActionState,
    formData: FormData,
  ) => Promise<SetupActionState>;
  saveSetupClassesAction: (
    previous: SetupActionState,
    formData: FormData,
  ) => Promise<SetupActionState>;
  saveSetupRoutesAction: (
    previous: SetupActionState,
    formData: FormData,
  ) => Promise<SetupActionState>;
  saveSetupSchoolDefaultsAction: (
    previous: SetupActionState,
    formData: FormData,
  ) => Promise<SetupActionState>;
  saveSetupClassDefaultsAction: (
    previous: SetupActionState,
    formData: FormData,
  ) => Promise<SetupActionState>;
  completeSetupStageAction: (
    previous: SetupActionState,
    formData: FormData,
  ) => Promise<SetupActionState>;
  initialState: SetupActionState;
};

type EditableDueDateRow = {
  key: string;
  value: string;
};

type EditableClassRow = SetupClassRow & {
  key: string;
};

type EditableRouteRow = SetupRouteRow & {
  key: string;
};

type EditableClassDefaultRow = SetupClassDefaultRow & {
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

function formatSavedAt(value: string | null) {
  if (!value) {
    return "Not marked complete yet";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

function ActionNotice({ state }: { state: SetupActionState }) {
  if (!state.message) {
    return null;
  }

  const toneClassName =
    state.status === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${toneClassName}`}>
      {state.message}
    </div>
  );
}

function SectionHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-500">{children}</p>;
}

function useRefreshOnSuccess(states: SetupActionState[]) {
  const router = useRouter();

  useEffect(() => {
    if (states.some((state) => state.status === "success")) {
      router.refresh();
    }
  }, [router, states]);
}

function createEmptyClassRow(index: number): EditableClassRow {
  return {
    key: `new-class-${Date.now()}-${index}`,
    id: "",
    className: "",
    section: "",
    streamName: "",
    sortOrder: index,
    status: "active",
    notes: "",
    label: "",
  };
}

function createEmptyRouteRow(index: number): EditableRouteRow {
  return {
    key: `new-route-${Date.now()}-${index}`,
    id: "",
    routeCode: "",
    routeName: "",
    defaultInstallmentAmount: 0,
    annualFeeAmount: 0,
    isActive: true,
    notes: "",
  };
}

function buildEditableClasses(rows: SetupClassRow[]): EditableClassRow[] {
  if (rows.length === 0) {
    return [createEmptyClassRow(0), createEmptyClassRow(1), createEmptyClassRow(2)];
  }

  return rows.map((row, index) => ({
    ...row,
    key: `${row.id}-${index}`,
  }));
}

function buildEditableRoutes(rows: SetupRouteRow[]): EditableRouteRow[] {
  if (rows.length === 0) {
    return [createEmptyRouteRow(0), createEmptyRouteRow(1)];
  }

  return rows.map((row, index) => ({
    ...row,
    key: `${row.id}-${index}`,
  }));
}

function buildEditableClassDefaults(rows: SetupClassDefaultRow[]): EditableClassDefaultRow[] {
  return rows.map((row, index) => ({
    ...row,
    key: `${row.classId}-${index}`,
  }));
}

export function SetupWizardClient({
  data,
  saveSetupPolicyAction,
  saveSetupClassesAction,
  saveSetupRoutesAction,
  saveSetupSchoolDefaultsAction,
  saveSetupClassDefaultsAction,
  completeSetupStageAction,
  initialState,
}: SetupWizardClientProps) {
  const [policyState, policyFormAction, policyPending] = useActionState(
    saveSetupPolicyAction,
    initialState,
  );
  const [classesState, classesFormAction, classesPending] = useActionState(
    saveSetupClassesAction,
    initialState,
  );
  const [routesState, routesFormAction, routesPending] = useActionState(
    saveSetupRoutesAction,
    initialState,
  );
  const [schoolDefaultsState, schoolDefaultsFormAction, schoolDefaultsPending] =
    useActionState(saveSetupSchoolDefaultsAction, initialState);
  const [classDefaultsState, classDefaultsFormAction, classDefaultsPending] =
    useActionState(saveSetupClassDefaultsAction, initialState);
  const [completeState, completeFormAction, completePending] = useActionState(
    completeSetupStageAction,
    initialState,
  );

  useRefreshOnSuccess([
    policyState,
    classesState,
    routesState,
    schoolDefaultsState,
    classDefaultsState,
    completeState,
  ]);

  const [sessionLabel, setSessionLabel] = useState(data.policy.academicSessionLabel);
  const [dueDateRows, setDueDateRows] = useState<EditableDueDateRow[]>(
    data.policy.installmentSchedule.map((item, index) => ({
      key: `due-date-${index}`,
      value: item.dueDateLabel,
    })),
  );
  const [lateFeeFlatAmount, setLateFeeFlatAmount] = useState(
    data.policy.lateFeeFlatAmount.toString(),
  );
  const [academicFees, setAcademicFees] = useState({
    newStudentAcademicFeeAmount: data.policy.newStudentAcademicFeeAmount.toString(),
    oldStudentAcademicFeeAmount: data.policy.oldStudentAcademicFeeAmount.toString(),
  });
  const [receiptPrefix, setReceiptPrefix] = useState(data.policy.receiptPrefix);
  const [acceptedPaymentModes, setAcceptedPaymentModes] = useState<PaymentMode[]>(
    data.policy.acceptedPaymentModes.map((item) => item.value),
  );
  const [classRows, setClassRows] = useState<EditableClassRow[]>(
    buildEditableClasses(data.activeSessionClasses),
  );
  const [routeRows, setRouteRows] = useState<EditableRouteRow[]>(
    buildEditableRoutes(data.routes),
  );
  const [schoolDefaults, setSchoolDefaults] = useState({
    tuitionFee: data.schoolDefault.tuitionFee.toString(),
    transportFee: data.schoolDefault.transportFee.toString(),
    booksFee: data.schoolDefault.booksFee.toString(),
    admissionActivityMiscFee: data.schoolDefault.admissionActivityMiscFee.toString(),
  });
  const [classDefaultRows, setClassDefaultRows] = useState<EditableClassDefaultRow[]>(
    buildEditableClassDefaults(data.classDefaults),
  );
  const [completionNotes, setCompletionNotes] = useState(
    data.completionState.completionNotes ?? "",
  );

  return (
    <div className="space-y-6">
      <SectionCard
        title="Field guide"
        description="Setup is for first-time go-live readiness. Editable fields are changed here once, calculated results confirm readiness, and live policy changes move to Fee Setup after go-live."
      >
        <div className="flex flex-wrap gap-2">
          <ValueStatePill tone="editable">Editable now</ValueStatePill>
          <ValueStatePill tone="calculated">Readiness result</ValueStatePill>
          <ValueStatePill tone="locked">Locked after setup</ValueStatePill>
          <ValueStatePill tone="review">Needs admin review</ValueStatePill>
        </div>
      </SectionCard>

      <SectionCard
        title="1. Session, installments, and collection rules"
        description="Set the active academic session, installment windows, late fee, accepted payment modes, and receipt prefix in the canonical policy service."
        className="scroll-mt-24"
      >
        <form id="session-policy" action={policyFormAction} className="space-y-5">
          <ActionNotice state={policyState} />
          {data.setupLocked ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
              Initial setup is already marked complete. Use{" "}
              <Link href="/protected/fee-setup" className="font-semibold underline">
                Fee Setup
              </Link>{" "}
              for live policy and default changes so preview/apply logging remains in the loop.
            </div>
          ) : null}
          <fieldset disabled={data.setupLocked} className="space-y-5">
          <input type="hidden" name="calculationModel" value={data.policy.calculationModel} />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <Label htmlFor="academic-session-label">Academic session</Label>
              <Input
                id="academic-session-label"
                name="academicSessionLabel"
                list="session-suggestions"
                value={sessionLabel}
                onChange={(event) => setSessionLabel(event.target.value)}
                className="mt-2"
                placeholder="2026-27"
              />
              <datalist id="session-suggestions">
                {data.sessionSuggestions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>

            <div>
              <Label htmlFor="calculation-model-display">Calculation mode</Label>
              <Input
                id="calculation-model-display"
                value={
                  data.policy.calculationModel === "workbook_v1"
                    ? "Workbook AY 2026-27"
                    : "Standard"
                }
                className="mt-2"
                disabled
                readOnly
              />
            </div>

            <div>
              <Label htmlFor="late-fee-flat-amount">Late fee</Label>
              <Input
                id="late-fee-flat-amount"
                name="lateFeeFlatAmount"
                type="number"
                min={0}
                value={lateFeeFlatAmount}
                onChange={(event) => setLateFeeFlatAmount(event.target.value)}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="receipt-prefix">Receipt prefix</Label>
              <Input
                id="receipt-prefix"
                name="receiptPrefix"
                value={receiptPrefix}
                onChange={(event) => setReceiptPrefix(event.target.value.toUpperCase())}
                className="mt-2 uppercase"
                placeholder="SVP"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label htmlFor="new-student-academic-fee">New student academic fee</Label>
              <Input
                id="new-student-academic-fee"
                name="newStudentAcademicFeeAmount"
                type="number"
                min={0}
                value={academicFees.newStudentAcademicFeeAmount}
                onChange={(event) =>
                  setAcademicFees((current) => ({
                    ...current,
                    newStudentAcademicFeeAmount: event.target.value,
                  }))
                }
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="old-student-academic-fee">Old student academic fee</Label>
              <Input
                id="old-student-academic-fee"
                name="oldStudentAcademicFeeAmount"
                type="number"
                min={0}
                value={academicFees.oldStudentAcademicFeeAmount}
                onChange={(event) =>
                  setAcademicFees((current) => ({
                    ...current,
                    oldStudentAcademicFeeAmount: event.target.value,
                  }))
                }
                className="mt-2"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Installment due dates</Label>
                <SectionHint>
                  Add one row per installment. The wizard auto-labels them as Installment 1,
                  Installment 2, and so on.
                </SectionHint>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDueDateRows((current) => [
                    ...current,
                    {
                      key: `due-date-${Date.now()}`,
                      value: "",
                    },
                  ])
                }
              >
                Add installment
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {dueDateRows.map((row, index) => (
                <div key={row.key}>
                  <Label htmlFor={`due-date-${row.key}`}>Installment {index + 1}</Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      id={`due-date-${row.key}`}
                      name="installmentDueDateLabel"
                      value={row.value}
                      onChange={(event) =>
                        setDueDateRows((current) =>
                          current.map((item) =>
                            item.key === row.key ? { ...item, value: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="20 April"
                    />
                    {dueDateRows.length > 1 ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setDueDateRows((current) =>
                            current.filter((item) => item.key !== row.key),
                          )
                        }
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Accepted payment modes</Label>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {paymentModeOptions.map((option) => {
                const checked = acceptedPaymentModes.includes(option.value);

                return (
                  <label
                    key={option.value}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      name="acceptedPaymentModes"
                      value={option.value}
                      checked={checked}
                      onChange={(event) => {
                        setAcceptedPaymentModes((current) =>
                          event.target.checked
                            ? [...current, option.value]
                            : current.filter((item) => item !== option.value),
                        );
                      }}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <SectionHint>
              Current policy: {data.policy.installmentCount} installment windows, late fee{" "}
              {formatInr(data.policy.lateFeeFlatAmount)}, new academic fee{" "}
              {formatInr(data.policy.newStudentAcademicFeeAmount)}, old academic fee{" "}
              {formatInr(data.policy.oldStudentAcademicFeeAmount)}, receipt prefix{" "}
              {data.policy.receiptPrefix}.
            </SectionHint>
            <Button type="submit" disabled={policyPending}>
              {policyPending ? "Saving..." : "Save session policy"}
            </Button>
          </div>
          </fieldset>
        </form>
      </SectionCard>

      <SectionCard
        title="2. Classes for the active session"
        description="Maintain the class list for the selected academic session. Existing classes stay in place unless you mark them inactive or archived."
        className="scroll-mt-24"
      >
        <form id="classes" action={classesFormAction} className="space-y-5">
          <ActionNotice state={classesState} />
          <fieldset disabled={data.setupLocked} className="space-y-5">
          <input type="hidden" name="sessionLabel" value={data.policy.academicSessionLabel} />

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Section</th>
                  <th className="px-4 py-3">Stream</th>
                  <th className="px-4 py-3">Sort</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3">Row</th>
                </tr>
              </thead>
              <tbody>
                {classRows.map((row) => (
                  <tr key={row.key} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3">
                      <input type="hidden" name="classId" value={row.id} />
                      <Input
                        name="className"
                        value={row.className}
                        onChange={(event) =>
                          setClassRows((current) =>
                            current.map((item) =>
                              item.key === row.key
                                ? { ...item, className: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="Class 12"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        name="section"
                        value={row.section ?? ""}
                        onChange={(event) =>
                          setClassRows((current) =>
                            current.map((item) =>
                              item.key === row.key
                                ? { ...item, section: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="A"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        name="streamName"
                        value={row.streamName ?? ""}
                        onChange={(event) =>
                          setClassRows((current) =>
                            current.map((item) =>
                              item.key === row.key
                                ? { ...item, streamName: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="Science"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        name="sortOrder"
                        type="number"
                        min={0}
                        value={row.sortOrder}
                        onChange={(event) =>
                          setClassRows((current) =>
                            current.map((item) =>
                              item.key === row.key
                                ? {
                                    ...item,
                                    sortOrder: Number(event.target.value || 0),
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        name="classStatus"
                        value={row.status}
                        onChange={(event) =>
                          setClassRows((current) =>
                            current.map((item) =>
                              item.key === row.key
                                ? {
                                    ...item,
                                    status: event.target.value as SetupClassRow["status"],
                                  }
                                : item,
                            ),
                          )
                        }
                        className={selectClassName}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="archived">Archived</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <textarea
                        name="classNotes"
                        value={row.notes ?? ""}
                        onChange={(event) =>
                          setClassRows((current) =>
                            current.map((item) =>
                              item.key === row.key
                                ? { ...item, notes: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className={textAreaClassName}
                        placeholder="Optional office note"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {row.id ? (
                        <StatusBadge label="Existing" tone="neutral" />
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setClassRows((current) =>
                              current.filter((item) => item.key !== row.key),
                            )
                          }
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-4">
            <SectionHint>
              Classes are session-specific master records. Use status changes instead of deleting
              old classes.
            </SectionHint>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setClassRows((current) => [...current, createEmptyClassRow(current.length)])
                }
              >
                Add class row
              </Button>
              <Button type="submit" disabled={classesPending}>
                {classesPending ? "Saving..." : "Save classes"}
              </Button>
            </div>
          </div>
          </fieldset>
        </form>
      </SectionCard>

      <SectionCard
        title="3. Transport routes"
        description="Save transport routes once so student import and fee resolution can map transport charges cleanly. Leave the section blank only if transport is not used."
        className="scroll-mt-24"
      >
        <form id="routes" action={routesFormAction} className="space-y-5">
          <ActionNotice state={routesState} />
          <fieldset disabled={data.setupLocked} className="space-y-5">

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Route name</th>
                  <th className="px-4 py-3">Annual fee</th>
                  <th className="px-4 py-3">Installment amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3">Row</th>
                </tr>
              </thead>
              <tbody>
                {routeRows.map((row) => (
                  <tr key={row.key} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3">
                      <input type="hidden" name="routeId" value={row.id} />
                      <Input
                        name="routeCode"
                        value={row.routeCode ?? ""}
                        onChange={(event) =>
                          setRouteRows((current) =>
                            current.map((item) =>
                              item.key === row.key
                                ? { ...item, routeCode: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="R-01"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        name="routeName"
                        value={row.routeName}
                        onChange={(event) =>
                          setRouteRows((current) =>
                            current.map((item) =>
                              item.key === row.key
                                ? { ...item, routeName: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="Main city route"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        name="routeAnnualFeeAmount"
                        type="number"
                        min={0}
                        value={row.annualFeeAmount ?? 0}
                        onChange={(event) =>
                          setRouteRows((current) =>
                            current.map((item) =>
                              item.key === row.key
                                ? {
                                    ...item,
                                    annualFeeAmount: Number(event.target.value || 0),
                                    defaultInstallmentAmount: Math.floor(
                                      Number(event.target.value || 0) /
                                        Math.max(dueDateRows.length, 1),
                                    ),
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="hidden"
                        name="routeDefaultInstallmentAmount"
                        value={row.defaultInstallmentAmount}
                      />
                      <Input
                        value={row.defaultInstallmentAmount}
                        disabled
                        readOnly
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        name="routeIsActive"
                        value={row.isActive ? "yes" : "no"}
                        onChange={(event) =>
                          setRouteRows((current) =>
                            current.map((item) =>
                              item.key === row.key
                                ? { ...item, isActive: event.target.value === "yes" }
                                : item,
                            ),
                          )
                        }
                        className={selectClassName}
                      >
                        <option value="yes">Active</option>
                        <option value="no">Inactive</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <textarea
                        name="routeNotes"
                        value={row.notes ?? ""}
                        onChange={(event) =>
                          setRouteRows((current) =>
                            current.map((item) =>
                              item.key === row.key
                                ? { ...item, notes: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className={textAreaClassName}
                        placeholder="Optional route note"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {row.id ? (
                        <StatusBadge label="Existing" tone="neutral" />
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setRouteRows((current) =>
                              current.filter((item) => item.key !== row.key),
                            )
                          }
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-4">
            <SectionHint>
                    Annual route fee is the current school setup. The installment amount is kept only
              as a legacy compatibility field derived from the annual fee and active installment count.
            </SectionHint>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setRouteRows((current) => [...current, createEmptyRouteRow(current.length)])
                }
              >
                Add route row
              </Button>
              <Button type="submit" disabled={routesPending}>
                {routesPending ? "Saving..." : "Save routes"}
              </Button>
            </div>
          </div>
          </fieldset>
        </form>
      </SectionCard>

      <SectionCard
        title="4. School-wide fee defaults"
        description="These become the fallback amounts for new class defaults and future fee resolution."
        className="scroll-mt-24"
      >
        <form id="school-defaults" action={schoolDefaultsFormAction} className="space-y-5">
          <ActionNotice state={schoolDefaultsState} />
          <fieldset disabled={data.setupLocked} className="space-y-5">

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label htmlFor="school-tuition-fee">Tuition fee</Label>
              <Input
                id="school-tuition-fee"
                name="tuitionFee"
                type="number"
                min={0}
                value={schoolDefaults.tuitionFee}
                onChange={(event) =>
                  setSchoolDefaults((current) => ({
                    ...current,
                    tuitionFee: event.target.value,
                  }))
                }
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="school-transport-fee">Transport fee</Label>
              <Input
                id="school-transport-fee"
                name="transportFee"
                type="number"
                min={0}
                value={schoolDefaults.transportFee}
                onChange={(event) =>
                  setSchoolDefaults((current) => ({
                    ...current,
                    transportFee: event.target.value,
                  }))
                }
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="school-books-fee">Books fee</Label>
              <Input
                id="school-books-fee"
                name="booksFee"
                type="number"
                min={0}
                value={schoolDefaults.booksFee}
                onChange={(event) =>
                  setSchoolDefaults((current) => ({
                    ...current,
                    booksFee: event.target.value,
                  }))
                }
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="school-misc-fee">Admission/activity/misc fee</Label>
              <Input
                id="school-misc-fee"
                name="admissionActivityMiscFee"
                type="number"
                min={0}
                value={schoolDefaults.admissionActivityMiscFee}
                onChange={(event) =>
                  setSchoolDefaults((current) => ({
                    ...current,
                    admissionActivityMiscFee: event.target.value,
                  }))
                }
                className="mt-2"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <SectionHint>
              Use this as the office-wide fallback. Fine-grained custom fee-head and per-student
              exception work stays available in the full Fee Setup module.
            </SectionHint>
            <Button type="submit" disabled={schoolDefaultsPending}>
              {schoolDefaultsPending ? "Saving..." : "Save school defaults"}
            </Button>
          </div>
          </fieldset>
        </form>
      </SectionCard>

      <SectionCard
        title="5. Class-wise defaults"
        description="Save one active default record for each class in the active session. The table starts with school-wide values and can be adjusted class by class."
        className="scroll-mt-24"
      >
        <form id="class-defaults" action={classDefaultsFormAction} className="space-y-5">
          <ActionNotice state={classDefaultsState} />
          <fieldset disabled={data.setupLocked} className="space-y-5">

          {classDefaultRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              Add classes first. Class-wise defaults are saved against the active session class
              list.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Tuition</th>
                    <th className="px-4 py-3">Transport</th>
                    <th className="px-4 py-3">Books</th>
                    <th className="px-4 py-3">Admission/activity/misc</th>
                    <th className="px-4 py-3">Saved</th>
                  </tr>
                </thead>
                <tbody>
                  {classDefaultRows.map((row) => (
                    <tr key={row.key} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <input type="hidden" name="defaultClassId" value={row.classId} />
                        <div className="font-medium text-slate-900">{row.classLabel}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          name="defaultTuitionFee"
                          type="number"
                          min={0}
                          value={row.tuitionFee}
                          onChange={(event) =>
                            setClassDefaultRows((current) =>
                              current.map((item) =>
                                item.key === row.key
                                  ? {
                                      ...item,
                                      tuitionFee: Number(event.target.value || 0),
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          name="defaultTransportFee"
                          type="number"
                          min={0}
                          value={row.transportFee}
                          onChange={(event) =>
                            setClassDefaultRows((current) =>
                              current.map((item) =>
                                item.key === row.key
                                  ? {
                                      ...item,
                                      transportFee: Number(event.target.value || 0),
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          name="defaultBooksFee"
                          type="number"
                          min={0}
                          value={row.booksFee}
                          onChange={(event) =>
                            setClassDefaultRows((current) =>
                              current.map((item) =>
                                item.key === row.key
                                  ? {
                                      ...item,
                                      booksFee: Number(event.target.value || 0),
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          name="defaultAdmissionActivityMiscFee"
                          type="number"
                          min={0}
                          value={row.admissionActivityMiscFee}
                          onChange={(event) =>
                            setClassDefaultRows((current) =>
                              current.map((item) =>
                                item.key === row.key
                                  ? {
                                      ...item,
                                      admissionActivityMiscFee: Number(
                                        event.target.value || 0,
                                      ),
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={row.hasSavedDefault ? "Saved" : "Pending"}
                          tone={row.hasSavedDefault ? "good" : "warning"}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <SectionHint>
              A class default row is required for each class before dues can be prepared.
            </SectionHint>
            <Button
              type="submit"
              disabled={classDefaultsPending || classDefaultRows.length === 0}
            >
              {classDefaultsPending ? "Saving..." : "Save class defaults"}
            </Button>
          </div>
          </fieldset>
        </form>
      </SectionCard>

      <SectionCard
        title="6. Mark setup stage complete"
        description="Use this after reviewing the readiness checklist. The mark is stored separately so the office can see that go-live prep was formally reviewed."
        className="scroll-mt-24"
      >
        <form id="complete" action={completeFormAction} className="space-y-5">
          <ActionNotice state={completeState} />

          <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Current status
              </p>
              <p className="mt-3 text-lg font-semibold text-slate-950">
                {data.readiness.collectionDeskReady ? "Collection desk ready" : "Setup in progress"}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Last completion mark: {formatSavedAt(data.completionState.setupCompletedAt)}
              </p>
            </div>

            <div>
              <Label htmlFor="completion-notes">Completion note</Label>
              <textarea
                id="completion-notes"
                name="completionNotes"
                value={completionNotes}
                onChange={(event) => setCompletionNotes(event.target.value)}
                className={`${textAreaClassName} mt-2`}
                placeholder="Optional note, for example: office checked import template and dues preparation on 22 April."
              />
            </div>
          </div>

          {data.readiness.readyForCompletion ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
              Blocking setup checks are complete. Mark the setup stage complete, then move to
              student import, anomaly review, and the collection desk.
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              Finish the remaining blocking checklist items before marking the setup stage
              complete.
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <SectionHint>
              This confirmation does not rewrite any fee or payment history. It only stores the
              office review marker.
            </SectionHint>
            <Button
              type="submit"
              disabled={completePending || !data.readiness.readyForCompletion}
            >
              {completePending
                ? "Saving..."
                : data.completionState.setupCompletedAt
                  ? "Mark reviewed again"
                  : "Mark setup complete"}
            </Button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}

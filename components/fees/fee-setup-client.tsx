"use client";

import { useActionState } from "react";

import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatInr } from "@/lib/helpers/currency";
import type { FeeSetupActionState, FeeSetupPageData } from "@/lib/fees/types";

type FeeSetupClientProps = {
  data: FeeSetupPageData;
  canEdit: boolean;
  saveSchoolDefaultsAction: (
    previous: FeeSetupActionState,
    formData: FormData,
  ) => Promise<FeeSetupActionState>;
  saveClassDefaultsAction: (
    previous: FeeSetupActionState,
    formData: FormData,
  ) => Promise<FeeSetupActionState>;
  saveStudentOverrideAction: (
    previous: FeeSetupActionState,
    formData: FormData,
  ) => Promise<FeeSetupActionState>;
  initialState: FeeSetupActionState;
};

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const textAreaClassName =
  "flex min-h-[88px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function ActionNotice({ state }: { state: FeeSetupActionState }) {
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
      {state.message}
    </div>
  );
}

function OtherFeeHeadsHint() {
  return (
    <p className="mt-1 text-xs text-slate-500">
      JSON format: {'{"smart class fee": 800, "lab fee": 500}'}
    </p>
  );
}

export function FeeSetupClient({
  data,
  canEdit,
  saveSchoolDefaultsAction,
  saveClassDefaultsAction,
  saveStudentOverrideAction,
  initialState,
}: FeeSetupClientProps) {
  const [schoolState, schoolFormAction, schoolPending] = useActionState(
    saveSchoolDefaultsAction,
    initialState,
  );
  const [classState, classFormAction, classPending] = useActionState(
    saveClassDefaultsAction,
    initialState,
  );
  const [studentState, studentFormAction, studentPending] = useActionState(
    saveStudentOverrideAction,
    initialState,
  );

  const schoolDefault = data.schoolDefault;

  return (
    <div className="space-y-6">
      {!canEdit ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          You can review fee defaults and overrides, but only admin staff can change school-wide fee policy, due dates, class defaults, or student override records.
        </div>
      ) : null}

      <SectionCard
        title="School-wide fee defaults"
        description="Set the base policy used for classes and future fee setup records."
        actions={
          canEdit ? (
            <StatusBadge label="Admin editable" tone="good" />
          ) : (
            <StatusBadge label="Admin only" tone="warning" />
          )
        }
      >
        <form action={schoolFormAction} className="space-y-4">
          <ActionNotice state={schoolState} />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label htmlFor="school-tuitionFee">Tuition fee</Label>
              <Input id="school-tuitionFee" name="tuitionFee" type="number" min={0} defaultValue={schoolDefault?.tuitionFee ?? 0} className="mt-2" disabled={!canEdit} required />
            </div>
            <div>
              <Label htmlFor="school-transportFee">Transport fee</Label>
              <Input id="school-transportFee" name="transportFee" type="number" min={0} defaultValue={schoolDefault?.transportFee ?? 0} className="mt-2" disabled={!canEdit} required />
            </div>
            <div>
              <Label htmlFor="school-booksFee">Books fee</Label>
              <Input id="school-booksFee" name="booksFee" type="number" min={0} defaultValue={schoolDefault?.booksFee ?? 0} className="mt-2" disabled={!canEdit} required />
            </div>
            <div>
              <Label htmlFor="school-admissionActivityMiscFee">Admission/activity/misc fee</Label>
              <Input
                id="school-admissionActivityMiscFee"
                name="admissionActivityMiscFee"
                type="number"
                min={0}
                defaultValue={schoolDefault?.admissionActivityMiscFee ?? 0}
                className="mt-2"
                disabled={!canEdit}
                required
              />
            </div>
            <div>
              <Label htmlFor="school-lateFeeFlatAmount">Late fee (flat)</Label>
              <Input
                id="school-lateFeeFlatAmount"
                name="lateFeeFlatAmount"
                type="number"
                min={0}
                defaultValue={schoolDefault?.lateFeeFlatAmount ?? 1000}
                className="mt-2"
                disabled={!canEdit}
                required
              />
            </div>
            <div>
              <Label htmlFor="school-installmentCount">Installment count</Label>
              <Input
                id="school-installmentCount"
                name="installmentCount"
                type="number"
                min={1}
                defaultValue={schoolDefault?.installmentCount ?? 4}
                className="mt-2"
                disabled={!canEdit}
                required
              />
            </div>
            <div>
              <Label htmlFor="school-studentTypeDefault">Default student type</Label>
              <select
                id="school-studentTypeDefault"
                name="studentTypeDefault"
                defaultValue={schoolDefault?.studentTypeDefault ?? "existing"}
                className={`${selectClassName} mt-2`}
                disabled={!canEdit}
              >
                <option value="existing">Existing</option>
                <option value="new">New</option>
              </select>
            </div>
            <div>
              <Label htmlFor="school-transportAppliesDefault">Transport applies by default</Label>
              <select
                id="school-transportAppliesDefault"
                name="transportAppliesDefault"
                defaultValue={schoolDefault?.transportAppliesDefault ? "yes" : "no"}
                className={`${selectClassName} mt-2`}
                disabled={!canEdit}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="school-dueDate1">Due date 1</Label>
              <Input id="school-dueDate1" name="dueDate1" defaultValue={schoolDefault?.installmentDueDates[0] ?? "20 April"} className="mt-2" disabled={!canEdit} required />
            </div>
            <div>
              <Label htmlFor="school-dueDate2">Due date 2</Label>
              <Input id="school-dueDate2" name="dueDate2" defaultValue={schoolDefault?.installmentDueDates[1] ?? "20 July"} className="mt-2" disabled={!canEdit} required />
            </div>
            <div>
              <Label htmlFor="school-dueDate3">Due date 3</Label>
              <Input id="school-dueDate3" name="dueDate3" defaultValue={schoolDefault?.installmentDueDates[2] ?? "20 October"} className="mt-2" disabled={!canEdit} required />
            </div>
            <div>
              <Label htmlFor="school-dueDate4">Due date 4</Label>
              <Input id="school-dueDate4" name="dueDate4" defaultValue={schoolDefault?.installmentDueDates[3] ?? "20 January"} className="mt-2" disabled={!canEdit} required />
            </div>
          </div>

          <div>
            <Label htmlFor="school-otherFeeHeads">Other fee heads (optional)</Label>
            <textarea
              id="school-otherFeeHeads"
              name="otherFeeHeads"
              defaultValue={JSON.stringify(schoolDefault?.otherFeeHeads ?? {}, null, 2)}
              className={`${textAreaClassName} mt-2`}
              disabled={!canEdit}
            />
            <OtherFeeHeadsHint />
          </div>

          <div>
            <Label htmlFor="school-notes">Notes</Label>
            <textarea
              id="school-notes"
              name="notes"
              defaultValue={schoolDefault?.notes ?? ""}
              className={`${textAreaClassName} mt-2`}
              disabled={!canEdit}
            />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Current default late fee: {formatInr(schoolDefault?.lateFeeFlatAmount ?? 1000)}
            </p>
            <Button type="submit" disabled={!canEdit || schoolPending}>
              {schoolPending ? "Saving..." : "Save school defaults"}
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Per-class fee defaults"
        description="Create or update active fee defaults for each class."
        actions={
          canEdit ? (
            <StatusBadge label="Admin editable" tone="good" />
          ) : (
            <StatusBadge label="Admin only" tone="warning" />
          )
        }
      >
        <form action={classFormAction} className="space-y-4">
          <ActionNotice state={classState} />

          <div>
            <Label htmlFor="class-classId">Class</Label>
            <select
              id="class-classId"
              name="classId"
              className={`${selectClassName} mt-2`}
              defaultValue=""
              disabled={!canEdit || data.classOptions.length === 0}
              required
            >
              <option value="">Select class</option>
              {data.classOptions.map((classOption) => (
                <option key={classOption.id} value={classOption.id}>
                  {classOption.label} ({classOption.sessionLabel})
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label htmlFor="class-tuitionFee">Tuition fee</Label>
              <Input id="class-tuitionFee" name="tuitionFee" type="number" min={0} className="mt-2" defaultValue={schoolDefault?.tuitionFee ?? 0} disabled={!canEdit} required />
            </div>
            <div>
              <Label htmlFor="class-transportFee">Transport fee</Label>
              <Input id="class-transportFee" name="transportFee" type="number" min={0} className="mt-2" defaultValue={schoolDefault?.transportFee ?? 0} disabled={!canEdit} required />
            </div>
            <div>
              <Label htmlFor="class-booksFee">Books fee</Label>
              <Input id="class-booksFee" name="booksFee" type="number" min={0} className="mt-2" defaultValue={schoolDefault?.booksFee ?? 0} disabled={!canEdit} required />
            </div>
            <div>
              <Label htmlFor="class-admissionActivityMiscFee">Admission/activity/misc fee</Label>
              <Input
                id="class-admissionActivityMiscFee"
                name="admissionActivityMiscFee"
                type="number"
                min={0}
                className="mt-2"
                defaultValue={schoolDefault?.admissionActivityMiscFee ?? 0}
                disabled={!canEdit}
                required
              />
            </div>
            <div>
              <Label htmlFor="class-lateFeeFlatAmount">Late fee (flat)</Label>
              <Input id="class-lateFeeFlatAmount" name="lateFeeFlatAmount" type="number" min={0} className="mt-2" defaultValue={schoolDefault?.lateFeeFlatAmount ?? 1000} disabled={!canEdit} required />
            </div>
            <div>
              <Label htmlFor="class-installmentCount">Installment count</Label>
              <Input id="class-installmentCount" name="installmentCount" type="number" min={1} className="mt-2" defaultValue={schoolDefault?.installmentCount ?? 4} disabled={!canEdit} required />
            </div>
            <div>
              <Label htmlFor="class-studentTypeDefault">Default student type</Label>
              <select
                id="class-studentTypeDefault"
                name="studentTypeDefault"
                defaultValue={schoolDefault?.studentTypeDefault ?? "existing"}
                className={`${selectClassName} mt-2`}
                disabled={!canEdit}
              >
                <option value="existing">Existing</option>
                <option value="new">New</option>
              </select>
            </div>
            <div>
              <Label htmlFor="class-transportAppliesDefault">Transport applies by default</Label>
              <select
                id="class-transportAppliesDefault"
                name="transportAppliesDefault"
                defaultValue={schoolDefault?.transportAppliesDefault ? "yes" : "no"}
                className={`${selectClassName} mt-2`}
                disabled={!canEdit}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="class-otherFeeHeads">Other fee heads (optional)</Label>
            <textarea id="class-otherFeeHeads" name="otherFeeHeads" defaultValue="{}" className={`${textAreaClassName} mt-2`} disabled={!canEdit} />
            <OtherFeeHeadsHint />
          </div>

          <div>
            <Label htmlFor="class-notes">Notes</Label>
            <textarea id="class-notes" name="notes" className={`${textAreaClassName} mt-2`} disabled={!canEdit} />
          </div>

          <div className="flex items-center justify-end">
            <Button type="submit" disabled={!canEdit || classPending || data.classOptions.length === 0}>
              {classPending ? "Saving..." : "Save class defaults"}
            </Button>
          </div>
        </form>

        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Tuition</th>
                <th className="px-4 py-3">Transport</th>
                <th className="px-4 py-3">Late fee</th>
                <th className="px-4 py-3">Type</th>
              </tr>
            </thead>
            <tbody>
              {data.classDefaults.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-slate-500">
                    No class defaults saved yet.
                  </td>
                </tr>
              ) : (
                data.classDefaults.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 text-slate-700">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{item.classLabel}</p>
                      <p className="text-xs text-slate-500">{item.sessionLabel}</p>
                    </td>
                    <td className="px-4 py-3">{formatInr(item.tuitionFee)}</td>
                    <td className="px-4 py-3">{formatInr(item.transportFee)}</td>
                    <td className="px-4 py-3">{formatInr(item.lateFeeFlatAmount)}</td>
                    <td className="px-4 py-3">{item.studentTypeDefault}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Per-student fee overrides"
        description="Use optional override fields for exceptions and keep a clear reason for every change."
        actions={
          canEdit ? (
            <StatusBadge label="Admin editable" tone="good" />
          ) : (
            <StatusBadge label="Admin only" tone="warning" />
          )
        }
      >
        <form action={studentFormAction} className="space-y-4">
          <ActionNotice state={studentState} />

          <div>
            <Label htmlFor="student-studentId">Student</Label>
            <select
              id="student-studentId"
              name="studentId"
              className={`${selectClassName} mt-2`}
              defaultValue=""
              disabled={!canEdit || data.studentOptions.length === 0}
              required
            >
              <option value="">Select student</option>
              {data.studentOptions.map((studentOption) => (
                <option key={studentOption.id} value={studentOption.id}>
                  {studentOption.label} - {studentOption.classLabel}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label htmlFor="student-customTuitionFeeAmount">Custom tuition fee</Label>
              <Input id="student-customTuitionFeeAmount" name="customTuitionFeeAmount" type="number" min={0} className="mt-2" disabled={!canEdit} />
            </div>
            <div>
              <Label htmlFor="student-customTransportFeeAmount">Custom transport fee</Label>
              <Input id="student-customTransportFeeAmount" name="customTransportFeeAmount" type="number" min={0} className="mt-2" disabled={!canEdit} />
            </div>
            <div>
              <Label htmlFor="student-customBooksFeeAmount">Custom books fee</Label>
              <Input id="student-customBooksFeeAmount" name="customBooksFeeAmount" type="number" min={0} className="mt-2" disabled={!canEdit} />
            </div>
            <div>
              <Label htmlFor="student-customAdmissionActivityMiscFeeAmount">Custom admission/activity/misc fee</Label>
              <Input
                id="student-customAdmissionActivityMiscFeeAmount"
                name="customAdmissionActivityMiscFeeAmount"
                type="number"
                min={0}
                className="mt-2"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label htmlFor="student-customLateFeeFlatAmount">Custom late fee</Label>
              <Input id="student-customLateFeeFlatAmount" name="customLateFeeFlatAmount" type="number" min={0} className="mt-2" disabled={!canEdit} />
            </div>
            <div>
              <Label htmlFor="student-discountAmount">Discount amount</Label>
              <Input id="student-discountAmount" name="discountAmount" type="number" min={0} className="mt-2" defaultValue={0} disabled={!canEdit} required />
            </div>
            <div>
              <Label htmlFor="student-studentTypeOverride">Student type override</Label>
              <select
                id="student-studentTypeOverride"
                name="studentTypeOverride"
                defaultValue=""
                className={`${selectClassName} mt-2`}
                disabled={!canEdit}
              >
                <option value="">No override</option>
                <option value="existing">Existing</option>
                <option value="new">New</option>
              </select>
            </div>
            <div>
              <Label htmlFor="student-transportAppliesOverride">Transport applies override</Label>
              <select
                id="student-transportAppliesOverride"
                name="transportAppliesOverride"
                defaultValue=""
                className={`${selectClassName} mt-2`}
                disabled={!canEdit}
              >
                <option value="">No override</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="student-customOtherFeeHeads">Custom other fee heads (optional)</Label>
            <textarea id="student-customOtherFeeHeads" name="customOtherFeeHeads" defaultValue="{}" className={`${textAreaClassName} mt-2`} disabled={!canEdit} />
            <OtherFeeHeadsHint />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="student-reason">Reason</Label>
              <Input id="student-reason" name="reason" className="mt-2" placeholder="Example: sibling concession approved" disabled={!canEdit} required />
            </div>
            <div>
              <Label htmlFor="student-notes">Notes</Label>
              <textarea id="student-notes" name="notes" className={`${textAreaClassName} mt-2`} disabled={!canEdit} />
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Button type="submit" disabled={!canEdit || studentPending || data.studentOptions.length === 0}>
              {studentPending ? "Saving..." : "Save student override"}
            </Button>
          </div>
        </form>

        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Late fee override</th>
              </tr>
            </thead>
            <tbody>
              {data.studentOverrides.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-slate-500">
                    No active student overrides found.
                  </td>
                </tr>
              ) : (
                data.studentOverrides.map((override) => (
                  <tr key={override.id} className="border-t border-slate-100 text-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-900">{override.studentLabel}</td>
                    <td className="px-4 py-3">{override.classLabel}</td>
                    <td className="px-4 py-3">{override.reason}</td>
                    <td className="px-4 py-3">{formatInr(override.discountAmount)}</td>
                    <td className="px-4 py-3">
                      {override.customLateFeeFlatAmount === null
                        ? "No override"
                        : formatInr(override.customLateFeeFlatAmount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

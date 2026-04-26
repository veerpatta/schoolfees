"use client";

import { useActionState } from "react";
import Link from "next/link";

import { ValueStatePill } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConventionalDiscountPolicy } from "@/lib/fees/types";
import { STUDENT_STATUSES } from "@/lib/students/constants";
import {
  INITIAL_STUDENT_FORM_ACTION_STATE,
  type StudentClassOption,
  type StudentFormActionState,
  type StudentRouteOption,
} from "@/lib/students/types";

type StudentFormValues = {
  fullName: string;
  classId: string;
  admissionNo: string;
  dateOfBirth: string;
  fatherName: string;
  motherName: string;
  fatherPhone: string;
  motherPhone: string;
  address: string;
  transportRouteId: string;
  status: string;
  studentTypeOverride: string;
  tuitionOverride: string;
  transportOverride: string;
  discountAmount: string;
  lateFeeWaiverAmount: string;
  otherAdjustmentHead: string;
  otherAdjustmentAmount: string;
  feeProfileReason: string;
  feeProfileNotes: string;
  conventionalPolicyIds: string[];
  conventionalDiscountReason: string;
  conventionalDiscountNotes: string;
  conventionalDiscountFamilyGroup: string;
  conventionalDiscountManualOverrideReason: string;
  notes: string;
};

type StudentFormProps = {
  mode: "add" | "edit";
  classOptions: StudentClassOption[];
  routeOptions: StudentRouteOption[];
  conventionalDiscountPolicies?: ConventionalDiscountPolicy[];
  initialValues: StudentFormValues;
  returnTo?: string;
  action: (
    previous: StudentFormActionState,
    formData: FormData,
  ) => Promise<StudentFormActionState>;
};

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const textAreaClassName =
  "flex min-h-[84px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function getFieldError(state: StudentFormActionState, fieldName: keyof StudentFormValues) {
  return state.fieldErrors[fieldName] ?? null;
}

function FieldError({ message }: { message: string | null }) {
  return message ? <p className="mt-1 text-xs text-red-600">{message}</p> : null;
}

export function StudentForm({
  mode,
  classOptions,
  routeOptions,
  conventionalDiscountPolicies = [],
  initialValues,
  returnTo = "/protected/students",
  action,
}: StudentFormProps) {
  const [state, formAction, isPending] = useActionState(
    action,
    INITIAL_STUDENT_FORM_ACTION_STATE,
  );

  const disableSubmit = classOptions.length === 0;

  return (
    <form action={formAction} className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <ValueStatePill tone="editable">Student Master</ValueStatePill>
        <ValueStatePill tone="policy">Fee exceptions</ValueStatePill>
        {initialValues.conventionalPolicyIds.length > 0 ? (
          <ValueStatePill tone="review">Conventional discount</ValueStatePill>
        ) : null}
      </div>

      {state.message ? (
        <div
          className={
            state.status === "error"
              ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          }
        >
          {state.message}
          {state.status === "success" && state.studentId ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href={`/protected/payments?studentId=${state.studentId}`}>Open Payment Desk</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/protected/students/${state.studentId}?returnTo=${encodeURIComponent(returnTo)}`}>
                  Open student
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {disableSubmit ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No class records found. Add classes before creating students.
        </div>
      ) : null}

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Student details</h3>
          <p className="mt-1 text-sm text-slate-600">
            Student name and class are required. SR no is recommended; a temporary SR no is generated if it is left blank.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="fullName">Student name</Label>
            <Input id="fullName" name="fullName" defaultValue={initialValues.fullName} className="mt-2" required />
            <FieldError message={getFieldError(state, "fullName")} />
          </div>

          <div>
            <Label htmlFor="classId">Class</Label>
            <select
              id="classId"
              name="classId"
              defaultValue={initialValues.classId}
              className={`${selectClassName} mt-2`}
              required
            >
              <option value="">Select class</option>
              {classOptions.map((classOption) => (
                <option key={classOption.id} value={classOption.id}>
                  {classOption.label}
                </option>
              ))}
            </select>
            <FieldError message={getFieldError(state, "classId")} />
          </div>

          <div>
            <Label htmlFor="admissionNo">SR no</Label>
            <Input
              id="admissionNo"
              name="admissionNo"
              defaultValue={initialValues.admissionNo}
              className="mt-2"
              placeholder={mode === "add" ? "Leave blank for temporary SR no" : undefined}
              required={mode === "edit"}
            />
            <FieldError message={getFieldError(state, "admissionNo")} />
          </div>

          <div>
            <Label htmlFor="fatherName">Father name</Label>
            <Input id="fatherName" name="fatherName" defaultValue={initialValues.fatherName} className="mt-2" />
          </div>

          <div>
            <Label htmlFor="fatherPhone">Phone</Label>
            <Input id="fatherPhone" name="fatherPhone" type="tel" defaultValue={initialValues.fatherPhone} className="mt-2" />
            <FieldError message={getFieldError(state, "fatherPhone")} />
          </div>

          <div>
            <Label htmlFor="transportRouteId">Transport route</Label>
            <select
              id="transportRouteId"
              name="transportRouteId"
              defaultValue={initialValues.transportRouteId}
              className={`${selectClassName} mt-2`}
            >
              <option value="">No Transport</option>
              {routeOptions.map((routeOption) => (
                <option key={routeOption.id} value={routeOption.id}>
                  {routeOption.routeCode
                    ? `${routeOption.label} (${routeOption.routeCode})`
                    : routeOption.label}
                </option>
              ))}
            </select>
            <FieldError message={getFieldError(state, "transportRouteId")} />
          </div>

          <div>
            <Label htmlFor="studentTypeOverride">New / Existing</Label>
            <select
              id="studentTypeOverride"
              name="studentTypeOverride"
              defaultValue={initialValues.studentTypeOverride}
              className={`${selectClassName} mt-2`}
              required
            >
              <option value="existing">Existing</option>
              <option value="new">New</option>
            </select>
            <FieldError message={getFieldError(state, "studentTypeOverride")} />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              name="notes"
              defaultValue={initialValues.notes}
              className={`${textAreaClassName} mt-2`}
              placeholder="Optional office notes"
            />
          </div>
        </div>
      </div>

      <details className="rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">
          Parent details and address
        </summary>
        <div className="grid gap-4 border-t border-slate-200 p-4 md:grid-cols-2">
          <div>
            <Label htmlFor="dateOfBirth">DOB</Label>
            <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={initialValues.dateOfBirth} className="mt-2" />
            <FieldError message={getFieldError(state, "dateOfBirth")} />
          </div>
          <div>
            <Label htmlFor="motherName">Mother name</Label>
            <Input id="motherName" name="motherName" defaultValue={initialValues.motherName} className="mt-2" />
          </div>
          <div>
            <Label htmlFor="motherPhone">Mother phone</Label>
            <Input id="motherPhone" name="motherPhone" type="tel" defaultValue={initialValues.motherPhone} className="mt-2" />
            <FieldError message={getFieldError(state, "motherPhone")} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="address">Address</Label>
            <textarea
              id="address"
              name="address"
              defaultValue={initialValues.address}
              className={`${textAreaClassName} mt-2`}
            />
          </div>
        </div>
      </details>

      <details className="rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">
          Conventional Discounts
        </summary>
        <div className="space-y-4 border-t border-slate-200 p-4">
          <p className="text-sm text-slate-600">
            Use these only for approved school policies like RTE, Staff Child, or 3rd Child.
          </p>
          {conventionalDiscountPolicies.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              Conventional discounts are not configured for this year yet.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {conventionalDiscountPolicies
                .filter((policy) => policy.isActive && policy.id)
                .map((policy) => (
                  <label
                    key={policy.id}
                    className="flex min-h-24 cursor-pointer flex-col rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                  >
                    <span className="flex items-center gap-2 font-semibold text-slate-950">
                      <input
                        type="checkbox"
                        name="conventionalPolicyIds"
                        value={policy.id ?? ""}
                        defaultChecked={initialValues.conventionalPolicyIds.includes(policy.id ?? "")}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      {policy.displayName}
                    </span>
                    <span className="mt-2 text-slate-600">
                      {policy.calculationType === "tuition_zero"
                        ? "Tuition becomes Rs 0"
                        : policy.calculationType === "tuition_percentage"
                          ? `Tuition becomes ${policy.percentage ?? 0}%`
                          : `Tuition becomes Rs ${policy.fixedTuitionAmount ?? 0}`}
                    </span>
                  </label>
                ))}
            </div>
          )}
          <FieldError message={getFieldError(state, "conventionalPolicyIds")} />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="conventionalDiscountReason">Reason</Label>
              <Input
                id="conventionalDiscountReason"
                name="conventionalDiscountReason"
                defaultValue={initialValues.conventionalDiscountReason}
                className="mt-2"
                placeholder="e.g. Approved by principal"
              />
              <FieldError message={getFieldError(state, "conventionalDiscountReason")} />
            </div>
            <div>
              <Label htmlFor="conventionalDiscountFamilyGroup">Family / sibling group</Label>
              <Input
                id="conventionalDiscountFamilyGroup"
                name="conventionalDiscountFamilyGroup"
                defaultValue={initialValues.conventionalDiscountFamilyGroup}
                className="mt-2"
                placeholder="Required for 3rd Child unless overridden"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="conventionalDiscountManualOverrideReason">Manual override reason</Label>
              <Input
                id="conventionalDiscountManualOverrideReason"
                name="conventionalDiscountManualOverrideReason"
                defaultValue={initialValues.conventionalDiscountManualOverrideReason}
                className="mt-2"
                placeholder="Only needed when 3rd Child eligibility is manually confirmed"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="conventionalDiscountNotes">Policy notes</Label>
              <textarea
                id="conventionalDiscountNotes"
                name="conventionalDiscountNotes"
                defaultValue={initialValues.conventionalDiscountNotes}
                className={`${textAreaClassName} mt-2`}
                placeholder="Optional office notes"
              />
            </div>
          </div>
        </div>
      </details>

      <details className="rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">
          Fee exceptions
        </summary>
        <div className="border-t border-slate-200 p-4">
          <p className="mb-4 text-sm text-slate-600">
            Student-specific exceptions only. School-wide defaults stay in Fee Setup.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label htmlFor="tuitionOverride">Tuition override</Label>
              <Input id="tuitionOverride" name="tuitionOverride" type="number" inputMode="decimal" min={0} defaultValue={initialValues.tuitionOverride} className="mt-2" placeholder="Leave blank for class default" />
              <FieldError message={getFieldError(state, "tuitionOverride")} />
            </div>
            <div>
              <Label htmlFor="transportOverride">Transport override</Label>
              <Input id="transportOverride" name="transportOverride" type="number" inputMode="decimal" min={0} defaultValue={initialValues.transportOverride} className="mt-2" placeholder="Leave blank for route default" />
              <FieldError message={getFieldError(state, "transportOverride")} />
            </div>
            <div>
              <Label htmlFor="discountAmount">Discount</Label>
              <Input id="discountAmount" name="discountAmount" type="number" inputMode="decimal" min={0} defaultValue={initialValues.discountAmount} className="mt-2" />
              <FieldError message={getFieldError(state, "discountAmount")} />
            </div>
            <div>
              <Label htmlFor="lateFeeWaiverAmount">Late fee waiver</Label>
              <Input id="lateFeeWaiverAmount" name="lateFeeWaiverAmount" type="number" inputMode="decimal" min={0} defaultValue={initialValues.lateFeeWaiverAmount} className="mt-2" />
              <FieldError message={getFieldError(state, "lateFeeWaiverAmount")} />
            </div>
            <div>
              <Label htmlFor="otherAdjustmentHead">Other adjustment</Label>
              <Input id="otherAdjustmentHead" name="otherAdjustmentHead" defaultValue={initialValues.otherAdjustmentHead} className="mt-2" placeholder="e.g. Uniform adj." />
              <FieldError message={getFieldError(state, "otherAdjustmentHead")} />
            </div>
            <div>
              <Label htmlFor="otherAdjustmentAmount">Other adjustment amount</Label>
              <Input id="otherAdjustmentAmount" name="otherAdjustmentAmount" type="number" inputMode="decimal" defaultValue={initialValues.otherAdjustmentAmount} className="mt-2" placeholder="Positive or negative" />
              <FieldError message={getFieldError(state, "otherAdjustmentAmount")} />
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <Label htmlFor="feeProfileReason">Reason</Label>
              <Input id="feeProfileReason" name="feeProfileReason" defaultValue={initialValues.feeProfileReason} className="mt-2" placeholder="e.g. Approved concession or route exception" />
              <FieldError message={getFieldError(state, "feeProfileReason")} />
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <Label htmlFor="feeProfileNotes">Advanced notes</Label>
              <textarea id="feeProfileNotes" name="feeProfileNotes" defaultValue={initialValues.feeProfileNotes} className={`${textAreaClassName} mt-2`} placeholder="Optional reason details for accounts review" />
            </div>
          </div>
        </div>
      </details>

      <details className="rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">
          Record status
        </summary>
        <div className="grid gap-4 border-t border-slate-200 p-4 md:grid-cols-2">
          <div>
            <Label htmlFor="status">Record status</Label>
            <select id="status" name="status" defaultValue={initialValues.status} className={`${selectClassName} mt-2`} required>
              {STUDENT_STATUSES.map((statusOption) => (
                <option key={statusOption.value} value={statusOption.value}>
                  {statusOption.label}
                </option>
              ))}
            </select>
            <FieldError message={getFieldError(state, "status")} />
          </div>
        </div>
      </details>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:-mx-5 md:px-5">
        <Button type="submit" disabled={disableSubmit || isPending}>
          {isPending
            ? mode === "add"
              ? "Saving..."
              : "Updating..."
            : mode === "add"
              ? "Save student"
              : "Update student"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href={returnTo}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

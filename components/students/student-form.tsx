"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { MobileTabs } from "@/components/mobile-app/mobile-tabs";
import { ValueStatePill } from "@/components/office/office-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { Section } from "@/components/ui/section";
import { SelectNative } from "@/components/ui/select-native";
import { Textarea } from "@/components/ui/textarea";
import { StudentInfoFieldset } from "@/components/students/student-info-fieldset";
import { StudentPhotoUpload } from "@/components/students/student-photo-upload";
import type { ConventionalDiscountPolicy } from "@/lib/fees/types";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { STUDENT_STATUSES } from "@/lib/students/constants";
import type { StudentInfoFormInput } from "@/lib/students/info-fields";
import { cn } from "@/lib/utils";
import {
  buildTransportRouteLabel,
  isSentinelNoTransportRoute,
  NO_TRANSPORT_LABEL,
} from "@/lib/transport/label";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import {
  INITIAL_STUDENT_FORM_ACTION_STATE,
  type StudentClassOption,
  type StudentFormActionState,
  type StudentRouteOption,
} from "@/lib/students/types";

/** The "No Transport" row is a placeholder, not a route — see lib/transport/label.ts. */
function selectedRouteIsReal(route: StudentRouteOption | null): boolean {
  return Boolean(route) && !isSentinelNoTransportRoute(route!.label);
}

type StudentFormValues = StudentInfoFormInput & {
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
  photoPath: string;
};

type StudentFormProps = {
  mode: "add" | "edit";
  /** Edit mode only. Files a photo upload under the student, not under `new/`. */
  studentId?: string;
  classOptions: StudentClassOption[];
  routeOptions: StudentRouteOption[];
  sessionLabel: string;
  conventionalDiscountPolicies?: ConventionalDiscountPolicy[];
  initialValues: StudentFormValues;
  returnTo?: string;
  /** Whether the caller's role can edit the SR No. Defaults to true (admin). */
  canEditAdmissionNo?: boolean;
  /**
   * Whether the caller's role can edit fee overrides, conventional discount
   * assignments, and the new-vs-existing student toggle. Defaults to true
   * (admin / accountant). Teachers receive `false` and the form hides the
   * Conventional Discounts and Fee exceptions sections + locks the new/existing
   * dropdown.
   */
  canEditFinance?: boolean;
  action: (
    previous: StudentFormActionState,
    formData: FormData,
  ) => Promise<StudentFormActionState>;
};

const studentFormFieldLabels: Partial<Record<keyof StudentFormValues, string>> = {
  fullName: "Student name",
  classId: "Class",
  admissionNo: "SR no",
  dateOfBirth: "DOB",
  fatherPhone: "Phone",
  motherPhone: "Mother phone",
  transportRouteId: "Transport route",
  studentTypeOverride: "New / Existing",
  tuitionOverride: "Tuition override",
  transportOverride: "Transport override",
  discountAmount: "Discount",
  otherAdjustmentHead: "Other adjustment",
  otherAdjustmentAmount: "Other adjustment amount",
  feeProfileReason: "Fee exception reason",
  conventionalPolicyIds: "Conventional discounts",
  conventionalDiscountReason: "Conventional discount reason",
  status: "Record status",
};

function getFieldError(state: StudentFormActionState, fieldName: keyof StudentFormValues) {
  return state.fieldErrors[fieldName] ?? null;
}

function getFieldErrorId(fieldName: keyof StudentFormValues) {
  return `${fieldName}-error`;
}

function getFieldAccessibility(state: StudentFormActionState, fieldName: keyof StudentFormValues) {
  const hasError = Boolean(getFieldError(state, fieldName));

  return {
    "aria-invalid": hasError ? true : undefined,
    "aria-describedby": hasError ? getFieldErrorId(fieldName) : undefined,
  };
}

function FieldError({
  fieldName,
  message,
}: {
  fieldName: keyof StudentFormValues;
  message: string | null;
}) {
  return message ? (
    <p id={getFieldErrorId(fieldName)} className="mt-1 text-xs text-destructive">
      {message}
    </p>
  ) : null;
}

export function StudentForm({
  mode,
  studentId,
  classOptions,
  routeOptions,
  sessionLabel,
  conventionalDiscountPolicies = [],
  initialValues,
  returnTo = "/protected/students",
  canEditAdmissionNo = true,
  canEditFinance = true,
  action,
}: StudentFormProps) {
  const [state, formAction, isPending] = useActionState(
    action,
    INITIAL_STUDENT_FORM_ACTION_STATE,
  );

  useActionFeedback(state, {
    successTitle: "Student saved",
    errorTitle: "Student not saved",
  });

  const values =
    state.status === "error" && state.submittedValues
      ? state.submittedValues
      : initialValues;
  // Transport is the one pair of fields that has to be read together: the route
  // picker up top and the override down in Fee exceptions. Kept in state so the
  // effective-charge line under the picker responds as the override is typed,
  // instead of only being right after a save.
  const [transportRouteId, setTransportRouteId] = useState(values.transportRouteId);
  const [transportOverride, setTransportOverride] = useState(values.transportOverride);

  const selectedRoute = routeOptions.find((option) => option.id === transportRouteId) ?? null;
  const overrideAmount = Number.parseInt(transportOverride, 10);
  const effectiveTransportLabel = buildTransportRouteLabel({
    routeName: selectedRoute?.label ?? null,
    routeCode: selectedRoute?.routeCode ?? null,
    customTransportFeeAmount: Number.isFinite(overrideAmount) ? overrideAmount : null,
  });
  // True when the money is coming from the override rather than a route — the
  // case that used to render as a flat "No transport".
  const transportIsCustom =
    effectiveTransportLabel !== NO_TRANSPORT_LABEL && !selectedRouteIsReal(selectedRoute);

  const feeExceptionCount = [
    values.tuitionOverride,
    transportOverride,
    values.discountAmount && values.discountAmount !== "0" ? values.discountAmount : "",
    values.otherAdjustmentHead,
    values.otherAdjustmentAmount && values.otherAdjustmentAmount !== "0"
      ? values.otherAdjustmentAmount
      : "",
  ].filter((value) => value.trim().length > 0).length;

  const recordAlreadySaved = state.status === "error" && Boolean(state.studentId);
  const disableSubmit = classOptions.length === 0 || recordAlreadySaved;
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);
  const fieldErrorEntries = Object.entries(state.fieldErrors).filter(
    (entry): entry is [keyof StudentFormValues, string] => Boolean(entry[1]),
  );
  const hasFieldErrors = state.status === "error" && fieldErrorEntries.length > 0;

  /**
   * Phone-only grouping.
   *
   * The form carries ~50 controls, which is fine on a desk and unusable in one
   * phone scroll. Disclosure is not an option here — collapsing this form is
   * what charged a student Rs 14,000 for transport they did not have — so the
   * groups become tabs instead.
   *
   * Two rules make that safe:
   *
   *  - **Panels are always mounted**, hidden with `hidden md:block`. Every field
   *    stays in the DOM and posts in FormData, so a save from the phone can
   *    never look like "the form never offered this field" and wipe it.
   *  - **`md:block` means the desk tree is untouched**: every group visible at
   *    once, exactly as before.
   */
  const groups = [
    { id: "student", label: "Student" },
    { id: "parents", label: "Parents" },
    { id: "info", label: "Info" },
    ...(canEditFinance ? [{ id: "fees", label: "Fees" }] : []),
    { id: "status", label: "Status" },
  ];
  const [activeGroup, setActiveGroup] = useState("student");
  // A failed save drops the grouping and shows everything. The error summary
  // scrolls to and focuses the offending control, and it cannot do either if
  // the control is sitting in a `display:none` panel.
  const showAllGroups = hasFieldErrors;
  const groupPanel = (id: string) =>
    cn(!showAllGroups && activeGroup !== id && "hidden md:block");

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="sessionLabel" value={sessionLabel} />
      {state.message ? (
        <Notice
          tone={
            state.status === "error"
              ? "danger"
              : state.status === "warning"
                ? "warning"
                : "success"
          }
          action={
            /*
              The follow-up buttons appear on a warning too: the student WAS
              saved, and the most likely next step after "some fee rows were
              left for review" is to open the student and look at them.
            */
            state.status !== "error" && state.studentId ? (
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href={withSession(`/protected/payments?studentId=${state.studentId}`)}>Open Payment Desk</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={withSession(`/protected/students/${state.studentId}?returnTo=${encodeURIComponent(returnTo)}`)}>
                    Open student
                  </Link>
                </Button>
              </div>
            ) : null
          }
        >
          {state.message}
        </Notice>
      ) : null}

      {hasFieldErrors ? (
        <Notice
          tone="danger"
          title={`Please review ${fieldErrorEntries.length} fields before saving.`}
        >
          <ul className="list-disc space-y-1 pl-5">
            {fieldErrorEntries.map(([fieldName, message]) => (
              <li key={fieldName}>
                {/*
                  A bare fragment jump moves the viewport but leaves focus
                  behind, so a screen reader never hears the field's
                  aria-describedby error. Focusing the control announces it, and
                  `block: "center"` clears the sticky identity bar. The href
                  stays for the no-JS path.
                */}
                <a
                  className="underline underline-offset-2"
                  href={`#${fieldName}`}
                  onClick={(event) => {
                    const target = document.getElementById(fieldName);

                    if (!target) return;

                    event.preventDefault();
                    target.scrollIntoView({ block: "center", behavior: "smooth" });
                    target.focus({ preventScroll: true });
                  }}
                >
                  {studentFormFieldLabels[fieldName] ?? fieldName}: {message}
                </a>
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {disableSubmit ? (
        <Notice tone="warning">
          No class records found. Add classes before creating students.
        </Notice>
      ) : null}

      {showAllGroups ? null : (
        <div className="sticky top-0 z-30 -mx-4 border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
          <MobileTabs
            ariaLabel="Student form sections"
            activeId={activeGroup}
            onSelect={setActiveGroup}
            tabs={groups}
          />
        </div>
      )}

      <div className={cn("space-y-4", groupPanel("student"))}>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Student details</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Student name and class are required. SR no is recommended; a temporary SR no is generated if it is left blank.
          </p>
        </div>

        {/* The photo belongs to the child, not to the parents — it spent a
            release filed under "Parent details and address", which is where
            nobody looked for it. */}
        <div>
          <Label>Student photo</Label>
          <div className="mt-2">
            {/* studentId matters: without it every upload lands under the
                bucket's `new/` folder, even when editing an existing
                student. */}
            <StudentPhotoUpload
              inputName="photoPath"
              studentId={studentId}
              initialPath={values.photoPath || null}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="fullName" required>Student name</Label>
            <Input
              id="fullName"
              name="fullName"
              defaultValue={values.fullName}
              className="mt-2"
              required
              {...getFieldAccessibility(state, "fullName")}
            />
            <FieldError fieldName="fullName" message={getFieldError(state, "fullName")} />
          </div>

          <div>
            <Label htmlFor="classId" required>Class</Label>
            <SelectNative
              id="classId"
              name="classId"
              defaultValue={values.classId}
              className="mt-2"
              required
              {...getFieldAccessibility(state, "classId")}
            >
              <option value="">Select class</option>
              {classOptions.map((classOption) => (
                <option key={classOption.id} value={classOption.id}>
                  {classOption.label}
                </option>
              ))}
            </SelectNative>
            <FieldError fieldName="classId" message={getFieldError(state, "classId")} />
          </div>

          <div>
            <Label htmlFor="admissionNo">SR no</Label>
            <Input
              id="admissionNo"
              name="admissionNo"
              defaultValue={values.admissionNo}
              className="mt-2"
              placeholder={mode === "add" ? "Leave blank for temporary SR no" : undefined}
              required={mode === "edit" && canEditAdmissionNo}
              readOnly={!canEditAdmissionNo}
              disabled={!canEditAdmissionNo}
              {...getFieldAccessibility(state, "admissionNo")}
            />
            {!canEditAdmissionNo ? (
              <p id="admissionNo-locked" className="mt-1 text-xs text-muted-foreground">
                SR no can only be changed by an admin.
              </p>
            ) : null}
            <FieldError fieldName="admissionNo" message={getFieldError(state, "admissionNo")} />
          </div>

          <div>
            <Label htmlFor="fatherName">Father name</Label>
            <Input id="fatherName" name="fatherName" defaultValue={values.fatherName} className="mt-2" />
          </div>

          <div>
            <Label htmlFor="fatherPhone">Phone</Label>
            <Input
              id="fatherPhone"
              name="fatherPhone"
              type="tel"
              defaultValue={values.fatherPhone}
              className="mt-2"
              {...getFieldAccessibility(state, "fatherPhone")}
            />
            <FieldError fieldName="fatherPhone" message={getFieldError(state, "fatherPhone")} />
          </div>

          <div>
            <Label htmlFor="transportRouteId">Transport route</Label>
            <SelectNative
              id="transportRouteId"
              name="transportRouteId"
              value={transportRouteId}
              onChange={(event) => setTransportRouteId(event.target.value)}
              className="mt-2"
              {...getFieldAccessibility(state, "transportRouteId")}
            >
              <option value="">{NO_TRANSPORT_LABEL}</option>
              {routeOptions.map((routeOption) => (
                <option key={routeOption.id} value={routeOption.id}>
                  {isSentinelNoTransportRoute(routeOption.label)
                    ? `${routeOption.label} — placeholder, same as "${NO_TRANSPORT_LABEL}"`
                    : routeOption.routeCode
                      ? `${routeOption.label} (${routeOption.routeCode})`
                      : routeOption.label}
                </option>
              ))}
            </SelectNative>
            {/* The route picker cannot tell the whole truth on its own. A
                student with no route and a transport override IS charged, and
                this control said "No transport" while it happened -- three
                live students, Rs 29,500 a year. The effective label is the same
                helper every other surface uses, and it updates as the override
                below is typed. */}
            <p
              className={`mt-2 text-xs ${
                transportIsCustom ? "font-semibold text-warning-soft-foreground" : "text-muted-foreground"
              }`}
              data-transport-effective
            >
              {transportIsCustom
                ? `Charged as ${effectiveTransportLabel} — set under Fee exceptions, not by the route.`
                : `Charged as ${effectiveTransportLabel}.`}
            </p>
            <FieldError fieldName="transportRouteId" message={getFieldError(state, "transportRouteId")} />
          </div>

          <div>
            <Label htmlFor="studentTypeOverride">New / Existing</Label>
            <SelectNative
              id="studentTypeOverride"
              name="studentTypeOverride"
              defaultValue={values.studentTypeOverride}
              className="mt-2"
              required
              disabled={!canEditFinance}
              {...getFieldAccessibility(state, "studentTypeOverride")}
            >
              <option value="existing">Existing</option>
              <option value="new">New</option>
            </SelectNative>
            {!canEditFinance ? (
              <p
                id="studentTypeOverride-locked"
                className="mt-1 text-xs text-muted-foreground"
              >
                New / Existing affects academic fee and can only be changed by admin.
              </p>
            ) : null}
            <FieldError fieldName="studentTypeOverride" message={getFieldError(state, "studentTypeOverride")} />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={values.notes}
              className="mt-2"
              placeholder="Optional office notes"
            />
          </div>
        </div>
      </div>

      <div className={cn("space-y-6", groupPanel("parents"))}>
      <Section
        title="Parent details and address"
        actions={<ValueStatePill tone="editable">Student Master</ValueStatePill>}
        description="A mother's phone is not a second-class field — it was behind a closed disclosure with the DOB and the address."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="dateOfBirth">DOB</Label>
            <Input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              defaultValue={values.dateOfBirth}
              className="mt-2"
              {...getFieldAccessibility(state, "dateOfBirth")}
            />
            <FieldError fieldName="dateOfBirth" message={getFieldError(state, "dateOfBirth")} />
          </div>
          <div>
            <Label htmlFor="motherName">Mother name</Label>
            <Input id="motherName" name="motherName" defaultValue={values.motherName} className="mt-2" />
          </div>
          <div>
            <Label htmlFor="motherPhone">Mother phone</Label>
            <Input
              id="motherPhone"
              name="motherPhone"
              type="tel"
              defaultValue={values.motherPhone}
              className="mt-2"
              {...getFieldAccessibility(state, "motherPhone")}
            />
            <FieldError fieldName="motherPhone" message={getFieldError(state, "motherPhone")} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              name="address"
              defaultValue={values.address}
              className="mt-2"
            />
          </div>
        </div>
      </Section>
      </div>

      <div className={cn("space-y-6", groupPanel("info"))}>
        <StudentInfoFieldset values={values} fieldErrors={state.fieldErrors} />
      </div>

      <div className={cn("space-y-6", groupPanel("fees"))}>
      {canEditFinance ? (
      <Section
        title="Conventional discounts"
        actions={<ValueStatePill tone="policy">School policy</ValueStatePill>}
        description="Use these only for approved school policies like RTE, Staff Child, or 3rd Child."
      >
        <div className="space-y-4">
          {conventionalDiscountPolicies.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-strong bg-surface-2 px-4 py-4 text-sm text-muted-foreground">
              Conventional discounts are not configured for this year yet.
            </div>
          ) : (
            <div
              className="grid gap-3 md:grid-cols-3"
              role="group"
              aria-label="Conventional discounts"
              {...getFieldAccessibility(state, "conventionalPolicyIds")}
            >
              {conventionalDiscountPolicies
                .filter((policy) => policy.isActive && policy.id)
                .map((policy) => (
                  <label
                    key={policy.id}
                    className="flex min-h-24 cursor-pointer flex-col rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm"
                  >
                    <span className="flex items-center gap-2 font-semibold text-foreground">
                      <input
                        type="checkbox"
                        name="conventionalPolicyIds"
                        value={policy.id ?? ""}
                        defaultChecked={values.conventionalPolicyIds.includes(policy.id ?? "")}
                        className="h-4 w-4 rounded border-border-strong"
                      />
                      {policy.displayName}
                    </span>
                    <span className="mt-2 text-muted-foreground">
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
          <FieldError fieldName="conventionalPolicyIds" message={getFieldError(state, "conventionalPolicyIds")} />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="conventionalDiscountReason">Reason</Label>
              <Input
                id="conventionalDiscountReason"
                name="conventionalDiscountReason"
                defaultValue={values.conventionalDiscountReason}
                className="mt-2"
                placeholder="e.g. Approved by principal"
                {...getFieldAccessibility(state, "conventionalDiscountReason")}
              />
              <FieldError fieldName="conventionalDiscountReason" message={getFieldError(state, "conventionalDiscountReason")} />
            </div>
            <div>
              <Label
                htmlFor="conventionalDiscountFamilyGroup"
                hint="Required for 3rd Child unless overridden"
              >
                Family / sibling group
              </Label>
              <Input
                id="conventionalDiscountFamilyGroup"
                name="conventionalDiscountFamilyGroup"
                defaultValue={values.conventionalDiscountFamilyGroup}
                className="mt-2"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="conventionalDiscountManualOverrideReason">Manual override reason</Label>
              <Input
                id="conventionalDiscountManualOverrideReason"
                name="conventionalDiscountManualOverrideReason"
                defaultValue={values.conventionalDiscountManualOverrideReason}
                className="mt-2"
                placeholder="Only needed when 3rd Child eligibility is manually confirmed"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="conventionalDiscountNotes">Policy notes</Label>
              <Textarea
                id="conventionalDiscountNotes"
                name="conventionalDiscountNotes"
                defaultValue={values.conventionalDiscountNotes}
                className="mt-2"
                placeholder="Optional office notes"
              />
            </div>
          </div>
        </div>
      </Section>
      ) : null}

      {canEditFinance ? (
      <Section
        title="Fee exceptions"
        description="Student-specific exceptions only. School-wide defaults stay in Fee Setup."
        actions={
          <span className="flex items-center gap-2">
            {feeExceptionCount > 0 ? (
              <Badge variant="accent">{feeExceptionCount} set</Badge>
            ) : null}
            {/* These fields move money: changing one needs fees:write and a
                reason, enforced in updateStudentAction. */}
            <ValueStatePill tone="policy">Needs a reason</ValueStatePill>
          </span>
        }
      >
        {/* Never collapsed. Behind a closed disclosure, this panel hid the
            amount that was charging a student for transport the route picker
            said they did not have. */}
        <div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label htmlFor="tuitionOverride" hint="Leave blank for the class default">Tuition override</Label>
              <Input
                id="tuitionOverride"
                name="tuitionOverride"
                type="number"
                inputMode="decimal"
                min={0}
                defaultValue={values.tuitionOverride}
                className="mt-2"
                {...getFieldAccessibility(state, "tuitionOverride")}
              />
              <FieldError fieldName="tuitionOverride" message={getFieldError(state, "tuitionOverride")} />
            </div>
            <div>
              <Label htmlFor="transportOverride" hint="Leave blank for the route default">Transport override</Label>
              <Input
                id="transportOverride"
                name="transportOverride"
                type="number"
                inputMode="decimal"
                min={0}
                value={transportOverride}
                onChange={(event) => setTransportOverride(event.target.value)}
                className="mt-2"
                {...getFieldAccessibility(state, "transportOverride")}
              />
              {transportIsCustom ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Overrides the route. This student has no route selected, so
                  this amount is the only thing charging them for transport.
                </p>
              ) : null}
              <FieldError fieldName="transportOverride" message={getFieldError(state, "transportOverride")} />
            </div>
            <div>
              <Label htmlFor="discountAmount">Discount</Label>
              <Input
                id="discountAmount"
                name="discountAmount"
                type="number"
                inputMode="decimal"
                min={0}
                defaultValue={values.discountAmount}
                className="mt-2"
                {...getFieldAccessibility(state, "discountAmount")}
              />
              <FieldError fieldName="discountAmount" message={getFieldError(state, "discountAmount")} />
            </div>
            <div>
              <Label htmlFor="otherAdjustmentHead">Other adjustment</Label>
              <Input
                id="otherAdjustmentHead"
                name="otherAdjustmentHead"
                defaultValue={values.otherAdjustmentHead}
                className="mt-2"
                placeholder="e.g. Uniform adj."
                {...getFieldAccessibility(state, "otherAdjustmentHead")}
              />
              <FieldError fieldName="otherAdjustmentHead" message={getFieldError(state, "otherAdjustmentHead")} />
            </div>
            <div>
              <Label htmlFor="otherAdjustmentAmount" hint="Positive adds, negative subtracts">Other adjustment amount</Label>
              <Input
                id="otherAdjustmentAmount"
                name="otherAdjustmentAmount"
                type="number"
                inputMode="decimal"
                defaultValue={values.otherAdjustmentAmount}
                className="mt-2"
                {...getFieldAccessibility(state, "otherAdjustmentAmount")}
              />
              <FieldError fieldName="otherAdjustmentAmount" message={getFieldError(state, "otherAdjustmentAmount")} />
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <Label htmlFor="feeProfileReason">Reason</Label>
              <Input
                id="feeProfileReason"
                name="feeProfileReason"
                defaultValue={values.feeProfileReason}
                className="mt-2"
                placeholder="e.g. Approved concession or route exception"
                {...getFieldAccessibility(state, "feeProfileReason")}
              />
              <FieldError fieldName="feeProfileReason" message={getFieldError(state, "feeProfileReason")} />
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <Label htmlFor="feeProfileNotes">Advanced notes</Label>
              <Textarea id="feeProfileNotes" name="feeProfileNotes" defaultValue={values.feeProfileNotes} className="mt-2" placeholder="Optional reason details for accounts review" />
            </div>
          </div>
        </div>
      </Section>
      ) : null}
      </div>

      <div className={groupPanel("status")}>
      <Section
        title="Record status"
        actions={<ValueStatePill tone="editable">Student Master</ValueStatePill>}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="status" required>Record status</Label>
            <SelectNative
              id="status"
              name="status"
              defaultValue={values.status}
              className="mt-2"
              required
              {...getFieldAccessibility(state, "status")}
            >
              {STUDENT_STATUSES.map((statusOption) => (
                <option key={statusOption.value} value={statusOption.value}>
                  {statusOption.label}
                </option>
              ))}
            </SelectNative>
            <FieldError fieldName="status" message={getFieldError(state, "status")} />
          </div>
        </div>
      </Section>
      </div>

      {/* Clears the fixed mobile nav (z-40); at bottom-0/z-10 the Save button
          was underneath it on every phone add/edit. */}
      {/* Clears the fixed mobile nav (z-40); at bottom-0/z-10 the Save button
          was underneath it on every phone add/edit.

          On a phone the design makes Save the full-width primary action at
          58px — a form this long is scrolled one-handed and the save target
          should not be a 90px button sharing a row with Cancel. Desktop keeps
          the two side by side. */}
      <div className="sticky bottom-[var(--mobile-bottom-nav-offset,0px)] z-40 -mx-4 flex flex-col-reverse gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur md:bottom-0 md:-mx-5 md:flex-row md:flex-wrap md:px-5 print:hidden">
        <Button
          type="submit"
          disabled={disableSubmit || isPending}
          className="h-[58px] w-full rounded-[17px] text-base font-extrabold md:h-9 md:w-auto md:rounded-md md:text-sm md:font-medium"
        >
          {isPending
            ? mode === "add"
              ? "Saving..."
              : "Updating..."
            : mode === "add"
              ? "Save student"
              : "Update student"}
        </Button>
        <Button type="button" variant="outline" asChild className="md:w-auto">
          <Link href={withSession(returnTo)}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

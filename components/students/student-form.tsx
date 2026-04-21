"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  notes: string;
};

type StudentFormProps = {
  mode: "add" | "edit";
  classOptions: StudentClassOption[];
  routeOptions: StudentRouteOption[];
  initialValues: StudentFormValues;
  action: (
    previous: StudentFormActionState,
    formData: FormData,
  ) => Promise<StudentFormActionState>;
};

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const textAreaClassName =
  "flex min-h-[84px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function getFieldError(
  state: StudentFormActionState,
  fieldName: keyof StudentFormValues,
) {
  return state.fieldErrors[fieldName] ?? null;
}

export function StudentForm({
  mode,
  classOptions,
  routeOptions,
  initialValues,
  action,
}: StudentFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    action,
    INITIAL_STUDENT_FORM_ACTION_STATE,
  );

  useEffect(() => {
    if (state.status === "success" && state.studentId) {
      router.push(`/protected/students/${state.studentId}`);
      router.refresh();
    }
  }, [router, state.status, state.studentId]);

  const disableSubmit = classOptions.length === 0;

  return (
    <form action={formAction} className="space-y-5">
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

      {disableSubmit ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No class records found. Add classes before creating students.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="fullName">Student name</Label>
          <Input
            id="fullName"
            name="fullName"
            defaultValue={initialValues.fullName}
            className="mt-2"
            required
          />
          {getFieldError(state, "fullName") ? (
            <p className="mt-1 text-xs text-red-600">{getFieldError(state, "fullName")}</p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="admissionNo">SR no</Label>
          <Input
            id="admissionNo"
            name="admissionNo"
            defaultValue={initialValues.admissionNo}
            className="mt-2"
            required
          />
          {getFieldError(state, "admissionNo") ? (
            <p className="mt-1 text-xs text-red-600">{getFieldError(state, "admissionNo")}</p>
          ) : null}
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
          {getFieldError(state, "classId") ? (
            <p className="mt-1 text-xs text-red-600">{getFieldError(state, "classId")}</p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="dateOfBirth">DOB</Label>
          <Input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            defaultValue={initialValues.dateOfBirth}
            className="mt-2"
          />
          {getFieldError(state, "dateOfBirth") ? (
            <p className="mt-1 text-xs text-red-600">{getFieldError(state, "dateOfBirth")}</p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="fatherName">Father name</Label>
          <Input
            id="fatherName"
            name="fatherName"
            defaultValue={initialValues.fatherName}
            className="mt-2"
          />
        </div>

        <div>
          <Label htmlFor="motherName">Mother name</Label>
          <Input
            id="motherName"
            name="motherName"
            defaultValue={initialValues.motherName}
            className="mt-2"
          />
        </div>

        <div>
          <Label htmlFor="fatherPhone">Father phone</Label>
          <Input
            id="fatherPhone"
            name="fatherPhone"
            defaultValue={initialValues.fatherPhone}
            className="mt-2"
          />
          {getFieldError(state, "fatherPhone") ? (
            <p className="mt-1 text-xs text-red-600">{getFieldError(state, "fatherPhone")}</p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="motherPhone">Mother phone</Label>
          <Input
            id="motherPhone"
            name="motherPhone"
            defaultValue={initialValues.motherPhone}
            className="mt-2"
          />
          {getFieldError(state, "motherPhone") ? (
            <p className="mt-1 text-xs text-red-600">{getFieldError(state, "motherPhone")}</p>
          ) : null}
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

        <div>
          <Label htmlFor="transportRouteId">Transport route</Label>
          <select
            id="transportRouteId"
            name="transportRouteId"
            defaultValue={initialValues.transportRouteId}
            className={`${selectClassName} mt-2`}
          >
            <option value="">No route</option>
            {routeOptions.map((routeOption) => (
              <option key={routeOption.id} value={routeOption.id}>
                {routeOption.routeCode
                  ? `${routeOption.label} (${routeOption.routeCode})`
                  : routeOption.label}
              </option>
            ))}
          </select>
          {getFieldError(state, "transportRouteId") ? (
            <p className="mt-1 text-xs text-red-600">{getFieldError(state, "transportRouteId")}</p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={initialValues.status}
            className={`${selectClassName} mt-2`}
            required
          >
            {STUDENT_STATUSES.map((statusOption) => (
              <option key={statusOption.value} value={statusOption.value}>
                {statusOption.label}
              </option>
            ))}
          </select>
          {getFieldError(state, "status") ? (
            <p className="mt-1 text-xs text-red-600">{getFieldError(state, "status")}</p>
          ) : null}
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

      <div className="flex flex-wrap gap-2">
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
          <Link href="/protected/students">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

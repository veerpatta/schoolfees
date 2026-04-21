import { STUDENT_STATUSES } from "@/lib/students/constants";
import type {
  StudentFormFieldErrors,
  StudentFormInput,
  StudentValidatedInput,
} from "@/lib/students/types";

const PHONE_PATTERN = /^[0-9+()\-\s]{7,20}$/;

function asTrimmedString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableText(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function isValidDateInput(value: string) {
  if (!value) {
    return true;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00`);

  return !Number.isNaN(parsed.getTime());
}

function isAllowedPhone(value: string) {
  if (!value) {
    return true;
  }

  return PHONE_PATTERN.test(value);
}

export function getStudentFormInput(formData: FormData): StudentFormInput {
  return {
    fullName: asTrimmedString(formData.get("fullName")),
    classId: asTrimmedString(formData.get("classId")),
    admissionNo: asTrimmedString(formData.get("admissionNo")),
    dateOfBirth: asTrimmedString(formData.get("dateOfBirth")),
    fatherName: asTrimmedString(formData.get("fatherName")),
    motherName: asTrimmedString(formData.get("motherName")),
    fatherPhone: asTrimmedString(formData.get("fatherPhone")),
    motherPhone: asTrimmedString(formData.get("motherPhone")),
    address: asTrimmedString(formData.get("address")),
    transportRouteId: asTrimmedString(formData.get("transportRouteId")),
    status: asTrimmedString(formData.get("status")),
    notes: asTrimmedString(formData.get("notes")),
  };
}

type ValidationOptions = {
  classIds: ReadonlySet<string>;
  routeIds: ReadonlySet<string>;
};

export function validateStudentInput(
  input: StudentFormInput,
  options: ValidationOptions,
):
  | {
      ok: true;
      data: StudentValidatedInput;
    }
  | {
      ok: false;
      fieldErrors: StudentFormFieldErrors;
      message: string;
    } {
  const fieldErrors: StudentFormFieldErrors = {};
  const allowedStatuses = new Set(STUDENT_STATUSES.map((status) => status.value));

  if (!input.fullName) {
    fieldErrors.fullName = "Student name is required.";
  }

  if (!input.classId) {
    fieldErrors.classId = "Class is required.";
  } else if (!options.classIds.has(input.classId)) {
    fieldErrors.classId = "Please choose a valid class.";
  }

  if (!input.admissionNo) {
    fieldErrors.admissionNo = "SR no is required.";
  }

  if (!isValidDateInput(input.dateOfBirth)) {
    fieldErrors.dateOfBirth = "Please enter DOB in YYYY-MM-DD format.";
  }

  if (!input.status) {
    fieldErrors.status = "Status is required.";
  } else if (!allowedStatuses.has(input.status as StudentValidatedInput["status"])) {
    fieldErrors.status = "Please choose a valid status.";
  }

  if (input.transportRouteId && !options.routeIds.has(input.transportRouteId)) {
    fieldErrors.transportRouteId = "Please choose a valid transport route.";
  }

  if (!isAllowedPhone(input.fatherPhone)) {
    fieldErrors.fatherPhone = "Please enter a valid phone number.";
  }

  if (!isAllowedPhone(input.motherPhone)) {
    fieldErrors.motherPhone = "Please enter a valid phone number.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
      message: "Please fix the highlighted fields and try again.",
    };
  }

  return {
    ok: true,
    data: {
      fullName: input.fullName,
      classId: input.classId,
      admissionNo: input.admissionNo,
      dateOfBirth: input.dateOfBirth || null,
      fatherName: normalizeNullableText(input.fatherName, 150),
      motherName: normalizeNullableText(input.motherName, 150),
      fatherPhone: normalizeNullableText(input.fatherPhone, 40),
      motherPhone: normalizeNullableText(input.motherPhone, 40),
      address: normalizeNullableText(input.address, 500),
      transportRouteId: input.transportRouteId || null,
      status: input.status as StudentValidatedInput["status"],
      notes: normalizeNullableText(input.notes, 1000),
    },
  };
}

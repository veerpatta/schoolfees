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

function parseOptionalWholeNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  if (!/^-?\d+$/.test(value.trim())) {
    return Number.NaN;
  }

  return Number(value);
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
    studentTypeOverride: asTrimmedString(formData.get("studentTypeOverride")),
    tuitionOverride: asTrimmedString(formData.get("tuitionOverride")),
    transportOverride: asTrimmedString(formData.get("transportOverride")),
    discountAmount: asTrimmedString(formData.get("discountAmount")),
    lateFeeWaiverAmount: asTrimmedString(formData.get("lateFeeWaiverAmount")),
    otherAdjustmentHead: asTrimmedString(formData.get("otherAdjustmentHead")),
    otherAdjustmentAmount: asTrimmedString(formData.get("otherAdjustmentAmount")),
    feeProfileReason: asTrimmedString(formData.get("feeProfileReason")),
    feeProfileNotes: asTrimmedString(formData.get("feeProfileNotes")),
    conventionalPolicyIds: formData
      .getAll("conventionalPolicyIds")
      .map((value) => value.toString().trim())
      .filter(Boolean),
    conventionalDiscountReason: asTrimmedString(formData.get("conventionalDiscountReason")),
    conventionalDiscountNotes: asTrimmedString(formData.get("conventionalDiscountNotes")),
    conventionalDiscountFamilyGroup: asTrimmedString(formData.get("conventionalDiscountFamilyGroup")),
    conventionalDiscountManualOverrideReason: asTrimmedString(
      formData.get("conventionalDiscountManualOverrideReason"),
    ),
    notes: asTrimmedString(formData.get("notes")),
  };
}

type ValidationOptions = {
  classIds: ReadonlySet<string>;
  routeIds: ReadonlySet<string>;
  allowBlankAdmissionNo?: boolean;
  sessionLabel?: string | null;
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
  const tuitionOverride = parseOptionalWholeNumber(input.tuitionOverride);
  const transportOverride = parseOptionalWholeNumber(input.transportOverride);
  const discountAmount = parseOptionalWholeNumber(input.discountAmount);
  const lateFeeWaiverAmount = parseOptionalWholeNumber(input.lateFeeWaiverAmount);
  const otherAdjustmentAmount = parseOptionalWholeNumber(input.otherAdjustmentAmount);
  const conventionalPolicyIds = Array.from(new Set(input.conventionalPolicyIds));
  const feeProfileReason =
    normalizeNullableText(input.feeProfileReason, 180) ??
    "Student Master workbook profile";

  if (!input.fullName) {
    fieldErrors.fullName = "Student name is required.";
  }

  if (!input.classId) {
    fieldErrors.classId = "Class is required.";
  } else if (!options.classIds.has(input.classId)) {
    fieldErrors.classId = options.sessionLabel
      ? `Please choose an active class for ${options.sessionLabel}.`
      : "Please choose a valid class.";
  }

  if (!input.admissionNo && !options.allowBlankAdmissionNo) {
    fieldErrors.admissionNo = "SR no is required.";
  }

  if (!isValidDateInput(input.dateOfBirth)) {
    fieldErrors.dateOfBirth = "Please enter DOB in YYYY-MM-DD format.";
  }

  if (!input.status) {
    fieldErrors.status = "Record status is required.";
  } else if (!allowedStatuses.has(input.status as StudentValidatedInput["status"])) {
    fieldErrors.status = "Please choose a valid record status.";
  }

  if (!input.studentTypeOverride) {
    fieldErrors.studentTypeOverride = "Student status is required.";
  } else if (!["new", "existing"].includes(input.studentTypeOverride)) {
    fieldErrors.studentTypeOverride = "Please choose New or Old.";
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

  if (Number.isNaN(tuitionOverride) || (tuitionOverride !== null && tuitionOverride < 0)) {
    fieldErrors.tuitionOverride = "Tuition override must be a whole number.";
  }

  if (Number.isNaN(transportOverride) || (transportOverride !== null && transportOverride < 0)) {
    fieldErrors.transportOverride = "Transport override must be a whole number.";
  }

  if (Number.isNaN(discountAmount) || (discountAmount !== null && discountAmount < 0)) {
    fieldErrors.discountAmount = "Discount must be a whole number.";
  }

  if (
    Number.isNaN(lateFeeWaiverAmount) ||
    (lateFeeWaiverAmount !== null && lateFeeWaiverAmount < 0)
  ) {
    fieldErrors.lateFeeWaiverAmount = "Late fee waiver must be a whole number.";
  }

  if (Number.isNaN(otherAdjustmentAmount)) {
    fieldErrors.otherAdjustmentAmount = "Other adjustment must be a whole number.";
  }

  const normalizedOtherAdjustmentHead = normalizeNullableText(input.otherAdjustmentHead, 120);

  if ((otherAdjustmentAmount ?? 0) !== 0 && !normalizedOtherAdjustmentHead) {
    fieldErrors.otherAdjustmentHead = "Enter a head for the other adjustment.";
  }

  if (normalizedOtherAdjustmentHead && otherAdjustmentAmount === null) {
    fieldErrors.otherAdjustmentAmount = "Enter the adjustment amount for this head.";
  }

  if (conventionalPolicyIds.length > 2) {
    fieldErrors.conventionalPolicyIds = "Select no more than two conventional discounts.";
  }

  if (conventionalPolicyIds.length > 0 && !input.conventionalDiscountReason.trim()) {
    fieldErrors.conventionalDiscountReason = "Reason is required for conventional discounts.";
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
      studentTypeOverride: input.studentTypeOverride as "new" | "existing",
      tuitionOverride,
      transportOverride,
      discountAmount: discountAmount ?? 0,
      lateFeeWaiverAmount: lateFeeWaiverAmount ?? 0,
      otherAdjustmentHead: normalizedOtherAdjustmentHead,
      otherAdjustmentAmount,
      feeProfileReason,
      feeProfileNotes: normalizeNullableText(input.feeProfileNotes, 1000),
      conventionalPolicyIds,
      conventionalDiscountReason:
        normalizeNullableText(input.conventionalDiscountReason, 180) ??
        "Conventional discount approved",
      conventionalDiscountNotes: normalizeNullableText(input.conventionalDiscountNotes, 1000),
      conventionalDiscountFamilyGroup: normalizeNullableText(
        input.conventionalDiscountFamilyGroup,
        180,
      ),
      conventionalDiscountManualOverrideReason: normalizeNullableText(
        input.conventionalDiscountManualOverrideReason,
        500,
      ),
      notes: normalizeNullableText(input.notes, 1000),
    },
  };
}

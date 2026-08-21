"use server";

import { after } from "next/server";

import { recordActivity } from "@/modules/activity/data/events";
import {
  matchesDeleteConfirmation,
  type StudentDangerActionState,
} from "@/app/protected/students/danger-action-state";
import {
  bulkUpdateStudentFields,
  createStudent,
  archiveStudent,
  hardDeleteStudent,
  getStudentDetail,
  getStudentFormOptions,
  getStudentDeletionSafety,
  updateStudent,
  updateStudentInfo,
  updateStudentPhoto,
  deleteStudentPhotoObject,
} from "@/modules/students/data/queries";
import type { StudentPhotoActionState } from "@/app/protected/students/student-photo-action-state";
import {
  getStudentInfoInput,
  getSubmittedStudentInfoFields,
  isDuplicateAadhaarError,
  validateStudentInfoInput,
} from "@/modules/students/domain/info-fields";
import type { StudentInfoFields } from "@/modules/students/domain/info-fields";
import type { StudentInfoActionState } from "@/app/protected/students/student-info-action-state";
import type { StudentStatus } from "@/platform/db/types";
import { parseAcademicSessionLabel } from "@/platform/config/fee-rules";
import { formatInr } from "@/platform/helpers/currency";
import { applyThirdChildPolicyForStudentFamilies } from "@/modules/fees/data/conventional-discounts";
import {
  type StudentFormInput,
  type StudentFormActionState,
} from "@/modules/students/domain/types";
import {
  isDuesSyncRelevantStatus,
  shouldSyncStudentDuesForChange,
} from "@/modules/students/domain/dues-sync";
import { getStudentFormInput, validateStudentInput } from "@/modules/students/domain/validation";
import { createClient } from "@/platform/supabase/server";
import {
  hasStaffPermission,
  requireAnyStaffPermission,
  requireStaffPermission,
} from "@/platform/supabase/session";
import {
  prepareDuesForStudentsAutomatically,
  revalidateFinanceSurfaces,
} from "@/modules/system-sync/domain/finance-sync";
import {
  buildFailedOfficeSyncOutcome,
  buildOfficeSyncOutcomeFromDuesResult,
  buildSyncedOfficeSyncOutcome,
  type OfficeSyncOutcome,
} from "@/modules/system-sync/domain/office-sync";
import { publishOfficeSyncEvent } from "@/modules/system-sync/data/office-sync-events";
import { drainFinancialViewRefresh } from "@/modules/system-sync/data/financial-view-refresh";

const DUPLICATE_AADHAAR_MESSAGE =
  "This Aadhaar number is already recorded against another student. Check the number, or open that student's record.";

const STUDENT_SAVED_DUES_FAILED_MESSAGE =
  "Student record was saved, but dues could not be prepared automatically. Open Admin Tools \u2192 Session Health if this student does not appear in Payment Desk.";

type RecentImportRealignRpcRow = {
  moved_count: number;
  attention_count: number;
  moved_student_ids: string[] | null;
};

function buildStudentDuesSyncOutcome(payload: {
  sessionLabel: string;
  studentIds: readonly string[];
  duesResult: Awaited<ReturnType<typeof prepareDuesForStudentsAutomatically>>;
}): OfficeSyncOutcome {
  return buildOfficeSyncOutcomeFromDuesResult({
    sessionLabel: payload.duesResult.raw.academicSessionLabel || payload.sessionLabel,
    affectedStudentIds: payload.studentIds,
    readyForPaymentCount: payload.duesResult.readyForPaymentCount,
    duesNeedAttentionCount: payload.duesResult.duesNeedAttentionCount,
    protectedRowCount: payload.duesResult.protectedRowCount,
    reasonSummary: payload.duesResult.reasonSummary,
  });
}

function getSubmittedSessionLabel(formData: FormData) {
  const raw = (formData.get("sessionLabel") ?? "").toString().trim();

  if (!raw) {
    return null;
  }

  try {
    return parseAcademicSessionLabel(raw).normalizedLabel;
  } catch {
    return null;
  }
}

function mapWriteErrorToState(
  message: string,
  submittedValues?: StudentFormInput,
): StudentFormActionState {
  const normalizedMessage = message.toLowerCase();

  if (message.toLowerCase().includes("admission_no") || message.toLowerCase().includes("students_admission_no_key")) {
    return {
      status: "error",
      message: "SR no already exists. Please use a unique SR no.",
      fieldErrors: {
        admissionNo: "SR no already exists.",
      },
      studentId: null,
      submittedValues,
    };
  }

  if (isDuplicateAadhaarError({ message })) {
    return {
      status: "error",
      message: DUPLICATE_AADHAAR_MESSAGE,
      fieldErrors: {
        aadhaarNo: DUPLICATE_AADHAAR_MESSAGE,
      },
      studentId: null,
      submittedValues,
    };
  }

  if (
    normalizedMessage.includes("conventional discount") ||
    normalizedMessage.includes("3rd child") ||
    normalizedMessage.includes("sibling group")
  ) {
    return {
      status: "error",
      message,
      fieldErrors: {
        conventionalPolicyIds: message,
      },
      studentId: null,
      submittedValues,
    };
  }

  return {
    status: "error",
    message: "Unable to save student right now. Please try again.",
    fieldErrors: {},
    studentId: null,
    submittedValues,
  };
}

function conventionalDiscountSelectionChanged(
  previousPolicyIds: readonly string[] = [],
  nextPolicyIds: readonly string[] = [],
) {
  const previousKey = [...previousPolicyIds].sort().join("|");
  const nextKey = [...nextPolicyIds].sort().join("|");
  return previousKey !== nextKey;
}

async function getThirdChildPolicyAffectedStudentIds(
  studentId: string,
  sessionLabel: string,
) {
  const results = await applyThirdChildPolicyForStudentFamilies({
    studentId,
    academicSessionLabel: sessionLabel,
  });

  return results.flatMap((result) => result.affectedStudentIds);
}

export async function createStudentAction(
  _previous: StudentFormActionState,
  formData: FormData,
): Promise<StudentFormActionState> {
  await requireStaffPermission("students:write");
  const input = getStudentFormInput(formData);
  const submittedSessionLabel = getSubmittedSessionLabel(formData);
  const { classOptions, routeOptions, resolvedSessionLabel } = await getStudentFormOptions({
    sessionLabel: submittedSessionLabel,
  });

  const validated = validateStudentInput(input, {
    classIds: new Set(classOptions.map((option) => option.id)),
    routeIds: new Set(routeOptions.map((option) => option.id)),
    allowBlankAdmissionNo: true,
    sessionLabel: resolvedSessionLabel,
  });

  if (!validated.ok) {
    return {
      status: "error",
      message: validated.message,
      fieldErrors: validated.fieldErrors,
      studentId: null,
      submittedValues: input,
    };
  }

  let studentId: string;

  try {
    studentId = await createStudent(validated.data);
  } catch (error) {
    return mapWriteErrorToState(
      error instanceof Error ? error.message : "Unexpected error while creating student.",
      input,
    );
  }

  let syncMessage = "";
  let duesStatus: StudentDuesMessage["status"] = "success";
  let syncOutcome: OfficeSyncOutcome;

  try {
    const thirdChildAffectedStudentIds = await getThirdChildPolicyAffectedStudentIds(
      studentId,
      resolvedSessionLabel,
    );
    const affectedStudentIds = Array.from(
      new Set([studentId, ...thirdChildAffectedStudentIds]),
    );

    if (isDuesSyncRelevantStatus(validated.data.status)) {
      const duesResult = await prepareDuesForStudentsAutomatically({
        studentIds: affectedStudentIds,
        sessionLabel: resolvedSessionLabel,
        reason: "Student added",
      });
      // Writing installments only ENQUEUES a matview refresh (migration
      // 20260726154843). Without this drain the new student's dues stay
      // invisible on every list and profile until the */2 cron fires — the
      // office adds a student and installments 1 and 2 look absent for two
      // minutes. revalidateFinanceSurfaces alone busts the Next.js cache and
      // re-queries a stale matview.
      after(drainFinancialViewRefresh);
      syncOutcome = buildStudentDuesSyncOutcome({
        sessionLabel: resolvedSessionLabel,
        studentIds: affectedStudentIds,
        duesResult,
      });

      const duesMessage = buildStudentDuesMessage({
        action: "added",
        readyForPaymentCount: duesResult.readyForPaymentCount,
        duesNeedAttentionCount: duesResult.duesNeedAttentionCount,
        protectedRowCount: duesResult.protectedRowCount,
        residualCreditTotal: duesResult.residualCreditTotal,
        reasonSummary: duesResult.reasonSummary,
      });
      syncMessage = duesMessage.message;
      duesStatus = duesMessage.status;
    } else {
      revalidateFinanceSurfaces({ studentIds: affectedStudentIds });
      syncOutcome = buildSyncedOfficeSyncOutcome({
        sessionLabel: resolvedSessionLabel,
        affectedStudentIds,
      });
    }
    await publishOfficeSyncEvent({
      sessionLabel: syncOutcome.sessionLabel,
      entityType: "student",
      entityId: studentId,
      action: "created",
      affectedStudentIds,
      metadata: { status: syncOutcome.status },
    });

    return {
      status: duesStatus,
      message: syncMessage || "Student record created successfully.",
      fieldErrors: {},
      studentId,
      syncOutcome,
    };
  } catch (error) {
    const syncOutcome = buildFailedOfficeSyncOutcome({
      sessionLabel: resolvedSessionLabel,
      affectedStudentIds: [studentId],
      error,
    });
    await publishOfficeSyncEvent({
      sessionLabel: syncOutcome.sessionLabel,
      entityType: "student",
      entityId: studentId,
      action: "created_sync_failed",
      affectedStudentIds: [studentId],
      metadata: { status: syncOutcome.status },
    });

    return {
      status: "error",
      message: STUDENT_SAVED_DUES_FAILED_MESSAGE,
      fieldErrors: {},
      studentId,
      submittedValues: input,
      syncOutcome,
    };
  }
}

export async function updateStudentAction(
  studentId: string,
  _previous: StudentFormActionState,
  formData: FormData,
): Promise<StudentFormActionState> {
  const staffSession = await requireAnyStaffPermission([
    "students:write",
    "students:edit_basic",
  ]);

  // Teachers (students:edit_basic only) can edit identity / contact fields but
  // not the SR No, the new-vs-existing toggle, fee overrides, or conventional
  // discount assignments. Restore those fields from the saved record before
  // validation so a tampered client form cannot rewrite them.
  const canEditAdmissionNo = hasStaffPermission(staffSession, "students:edit_sr_no");
  const canEditFinance = hasStaffPermission(staffSession, "students:write");

  /**
   * Fee fields that a form may legitimately not render at all.
   *
   * ABSENT and EMPTY are different answers and must not be conflated. A text
   * input that is on screen always posts, empty string included — so "empty"
   * means the user cleared it. "Absent" means the form never offered the field,
   * which is the case whenever fee editing is delegated elsewhere, and the only
   * safe reading is "leave what is on the record".
   *
   * Without this, the first save from a form that stops rendering these inputs
   * silently wipes every override on the student.
   */
  const OPTIONAL_FEE_FIELDS = [
    "tuitionOverride",
    "transportOverride",
    "discountAmount",
    "otherAdjustmentHead",
    "otherAdjustmentAmount",
    "feeProfileReason",
    "feeProfileNotes",
  ] as const;

  const absentFeeFields = OPTIONAL_FEE_FIELDS.filter((field) => !formData.has(field));

  if (!canEditAdmissionNo || !canEditFinance || absentFeeFields.length > 0) {
    const existing = await getStudentDetail(studentId);

    if (!canEditAdmissionNo) {
      formData.set("admissionNo", existing?.admissionNo ?? "");
    }

    // Restore only the fields the form did not offer. Applies to every role:
    // a field that was never on screen cannot have been edited by anyone.
    if (existing && absentFeeFields.length > 0) {
      const savedValue: Record<(typeof OPTIONAL_FEE_FIELDS)[number], string> = {
        tuitionOverride: existing.tuitionOverride?.toString() ?? "",
        transportOverride: existing.transportOverride?.toString() ?? "",
        discountAmount: existing.discountAmount.toString(),
        otherAdjustmentHead: existing.otherAdjustmentHead ?? "",
        otherAdjustmentAmount: existing.otherAdjustmentAmount?.toString() ?? "",
        feeProfileReason: existing.overrideReason ?? "Student Master workbook profile",
        feeProfileNotes: existing.overrideNotes ?? "",
      };

      for (const field of absentFeeFields) {
        formData.set(field, savedValue[field]);
      }
    }

    if (!canEditFinance && existing) {
      formData.set("studentTypeOverride", existing.studentTypeOverride ?? "existing");
      formData.set("tuitionOverride", existing.tuitionOverride?.toString() ?? "");
      formData.set("transportOverride", existing.transportOverride?.toString() ?? "");
      formData.set("discountAmount", existing.discountAmount.toString());
      formData.set("otherAdjustmentHead", existing.otherAdjustmentHead ?? "");
      formData.set(
        "otherAdjustmentAmount",
        existing.otherAdjustmentAmount?.toString() ?? "",
      );
      formData.set(
        "feeProfileReason",
        existing.overrideReason ?? "Student Master workbook profile",
      );
      formData.set("feeProfileNotes", existing.overrideNotes ?? "");
      formData.delete("conventionalPolicyIds");
      for (const policyId of existing.conventionalDiscountPolicyIds) {
        formData.append("conventionalPolicyIds", policyId);
      }
      formData.set(
        "conventionalDiscountReason",
        existing.conventionalDiscountReason ?? "",
      );
      formData.set(
        "conventionalDiscountNotes",
        existing.conventionalDiscountNotes ?? "",
      );
      formData.set(
        "conventionalDiscountFamilyGroup",
        existing.conventionalDiscountFamilyGroupLabel ?? "",
      );
      formData.set(
        "conventionalDiscountManualOverrideReason",
        existing.conventionalDiscountManualOverrideReason ?? "",
      );
    }
  }

  const input = getStudentFormInput(formData);
  const submittedSessionLabel = getSubmittedSessionLabel(formData);
  const { classOptions, routeOptions, resolvedSessionLabel } = await getStudentFormOptions({
    sessionLabel: submittedSessionLabel,
  });

  const validated = validateStudentInput(input, {
    classIds: new Set(classOptions.map((option) => option.id)),
    routeIds: new Set(routeOptions.map((option) => option.id)),
    sessionLabel: resolvedSessionLabel,
  });

  if (!validated.ok) {
    return {
      status: "error",
      message: validated.message,
      fieldErrors: validated.fieldErrors,
      studentId: null,
      submittedValues: input,
    };
  }

  try {
    const previousStudent = await getStudentDetail(studentId);

    if (!previousStudent) {
      return {
        status: "error",
        message: "Student record was not found.",
        fieldErrors: {},
        studentId: null,
        submittedValues: input,
      };
    }

    /**
     * Two surfaces write these same columns: this form and StudentFeePlanSheet.
     * The sheet has always been the stricter of the two — `fees:write`, a
     * mandatory reason, and it resolves the conventional-discount collision.
     * This form asked for none of that, so the same money could be changed
     * under a weaker contract depending on which button was clicked.
     *
     * Rather than duplicate the sheet's collision logic here — a second copy is
     * how the two drifted apart in the first place — the form now holds the
     * same guards and refuses the one case only the sheet handles correctly.
     */
    const feeFieldsChanged =
      previousStudent.tuitionOverride !== validated.data.tuitionOverride ||
      previousStudent.transportOverride !== validated.data.transportOverride ||
      previousStudent.discountAmount !== validated.data.discountAmount ||
      (previousStudent.otherAdjustmentHead ?? "") !==
        (validated.data.otherAdjustmentHead ?? "") ||
      (previousStudent.otherAdjustmentAmount ?? null) !==
        (validated.data.otherAdjustmentAmount ?? null);

    if (feeFieldsChanged) {
      const feeError = (message: string): StudentFormActionState => ({
        status: "error",
        message,
        fieldErrors: {},
        studentId: null,
        submittedValues: input,
      });

      if (!hasStaffPermission(staffSession, "fees:write")) {
        return feeError(
          "Changing a student's fee exceptions needs fee-edit permission. Everything else on this form saved nothing — no change was made.",
        );
      }

      if ((validated.data.feeProfileReason ?? "").trim().length < 4) {
        return feeError(
          "Add a reason of at least 4 characters for the fee exception change, so the audit trail explains it.",
        );
      }

      // A tuition override on a student carrying a policy discount is the one
      // case that needs the backfilled conventional discount unwound from
      // discount_amount. Only the fee-plan editor does that; getting it wrong
      // double-subtracts.
      const settingTuitionOverride =
        validated.data.tuitionOverride !== null &&
        validated.data.tuitionOverride !== previousStudent.tuitionOverride;

      if (settingTuitionOverride && previousStudent.conventionalDiscountPolicyIds.length > 0) {
        return feeError(
          "This student is on a conventional discount policy, so a custom tuition amount has to be set through “Edit custom fees” — that editor unwinds the policy discount at the same time. Nothing was changed.",
        );
      }
    }

    const updatedStudentId = await updateStudent(studentId, validated.data);
    const thirdChildAffectedStudentIds = await getThirdChildPolicyAffectedStudentIds(
      updatedStudentId,
      resolvedSessionLabel,
    );
    const affectedStudentIds = Array.from(
      new Set([updatedStudentId, ...thirdChildAffectedStudentIds]),
    );
    const shouldSyncDues =
      shouldSyncStudentDuesForChange(previousStudent, validated.data) ||
      thirdChildAffectedStudentIds.length > 0 ||
      conventionalDiscountSelectionChanged(
        previousStudent.conventionalDiscountPolicyIds,
        validated.data.conventionalPolicyIds,
      );

    let syncMessage = "";
    let duesStatus: StudentDuesMessage["status"] = "success";
    let syncOutcome: OfficeSyncOutcome;

    if (shouldSyncDues) {
      const duesResult = await prepareDuesForStudentsAutomatically({
        studentIds: affectedStudentIds,
        sessionLabel: resolvedSessionLabel,
        reason: "Student updated",
      });
      // See the note on the create path: the refresh is queued, not applied.
      // A discount edit that does not drain leaves the fee snapshot showing
      // the pre-discount figure until the cron catches up.
      after(drainFinancialViewRefresh);
      syncOutcome = buildStudentDuesSyncOutcome({
        sessionLabel: resolvedSessionLabel,
        studentIds: affectedStudentIds,
        duesResult,
      });

      const duesMessage = buildStudentDuesMessage({
        action: "updated",
        readyForPaymentCount: duesResult.readyForPaymentCount,
        duesNeedAttentionCount: duesResult.duesNeedAttentionCount,
        protectedRowCount: duesResult.protectedRowCount,
        residualCreditTotal: duesResult.residualCreditTotal,
        reasonSummary: duesResult.reasonSummary,
      });
      syncMessage = ` ${duesMessage.message}`;
      duesStatus = duesMessage.status;
    } else {
      revalidateFinanceSurfaces({ studentIds: affectedStudentIds });
      syncOutcome = buildSyncedOfficeSyncOutcome({
        sessionLabel: resolvedSessionLabel,
        affectedStudentIds,
      });
    }
    await publishOfficeSyncEvent({
      sessionLabel: syncOutcome.sessionLabel,
      entityType: "student",
      entityId: updatedStudentId,
      action: "updated",
      affectedStudentIds,
      metadata: { status: syncOutcome.status },
    });

    await recordActivity({
      userId: (staffSession?.id as string | undefined) ?? null,
      kind: "student_edited",
      refId: updatedStudentId,
      payload: {
        sessionLabel: resolvedSessionLabel,
        affectedStudentIds,
      },
    });

    return {
      status: duesStatus,
      message: syncMessage ? `Student record updated successfully.${syncMessage}` : "Student record updated successfully.",
      fieldErrors: {},
      studentId: updatedStudentId,
      syncOutcome,
    };
  } catch (error) {
    return mapWriteErrorToState(
      error instanceof Error ? error.message : "Unexpected error while updating student.",
      input,
    );
  }
}

/**
 * Saves one group of student information fields, and nothing else.
 *
 * Deliberately not a thin wrapper over `updateStudentAction`. That action reads
 * the whole student form, so a partial post has to be padded back out of the
 * saved record before it is safe — the absent-vs-empty restore above. The
 * quick-edit sheets post one group at a time, which is exactly the shape that
 * goes wrong there.
 *
 * Here the untouched columns are simply never in the UPDATE: only fields the
 * form actually rendered are read, validated and written. Class, fees,
 * discounts, record status and SR no cannot move through this path at all.
 */
export async function updateStudentInfoAction(
  studentId: string,
  _previous: StudentInfoActionState,
  formData: FormData,
): Promise<StudentInfoActionState> {
  const staffSession = await requireAnyStaffPermission([
    "students:write",
    "students:edit_basic",
  ]);

  const offeredFields = getSubmittedStudentInfoFields(formData);

  if (offeredFields.length === 0) {
    return {
      status: "error",
      message: "Nothing to save.",
      fieldErrors: {},
    };
  }

  const validated = validateStudentInfoInput(getStudentInfoInput(formData));

  if (!validated.ok) {
    return {
      status: "error",
      message: "Please fix the highlighted fields and try again.",
      fieldErrors: validated.fieldErrors,
    };
  }

  // Narrow the validated set down to the fields this form offered. Everything
  // else validated as blank simply because it was never on screen.
  const columns: Partial<StudentInfoFields> = {};
  for (const field of offeredFields) {
    columns[field.name] = validated.data[field.name];
  }

  try {
    await updateStudentInfo(studentId, columns);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save student details.";

    if (isDuplicateAadhaarError({ message })) {
      return {
        status: "error",
        message: DUPLICATE_AADHAAR_MESSAGE,
        fieldErrors: { aadhaarNo: DUPLICATE_AADHAAR_MESSAGE },
      };
    }

    return { status: "error", message, fieldErrors: {} };
  }

  // No money moved, so no dues preparation and no financial view refresh —
  // just the read surfaces that show a student record.
  revalidateFinanceSurfaces({ studentIds: [studentId] });

  await recordActivity({
    userId: (staffSession?.id as string | undefined) ?? null,
    kind: "student_edited",
    refId: studentId,
    payload: { fields: offeredFields.map((field) => field.name) },
  });

  return {
    status: "success",
    message: "Student details saved.",
    fieldErrors: {},
  };
}

/**
 * Saves a student's photo, and nothing else.
 *
 * Narrow for the same reason `updateStudentInfoAction` is, plus one specific to
 * photos: the edit form posts `photoPath` on every save, so submitting that
 * form with the field blank CLEARS the stored photo. A quick-edit sheet that
 * reused it would inherit that, and "I opened the photo sheet and cancelled"
 * would be indistinguishable from "remove this photo".
 *
 * Here the only column in the statement is `photo_path`.
 */
export async function updateStudentPhotoAction(
  studentId: string,
  _previous: StudentPhotoActionState,
  formData: FormData,
): Promise<StudentPhotoActionState> {
  const staffSession = await requireAnyStaffPermission([
    "students:write",
    "students:edit_basic",
  ]);

  if (!formData.has("photoPath")) {
    return { status: "error", message: "Nothing to save.", photoPath: null };
  }

  const raw = formData.get("photoPath");
  const nextPath =
    typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 500) : null;

  // Reject anything that is not a path inside the bucket. The value comes from
  // a hidden input, so it is client-supplied however the UI got it there.
  if (nextPath && (nextPath.includes("..") || nextPath.startsWith("/"))) {
    return {
      status: "error",
      message: "That photo could not be saved. Please try again.",
      photoPath: null,
    };
  }

  const existing = await getStudentDetail(studentId);

  if (!existing) {
    return { status: "error", message: "Student record was not found.", photoPath: null };
  }

  const previousPath = existing.photoPath;

  try {
    await updateStudentPhoto(studentId, nextPath);
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to save the photo.",
      photoPath: previousPath,
    };
  }

  // Row first, cleanup second, and never the other way round: a failed delete
  // leaves an orphaned object, while a failed update after a delete would leave
  // a student pointing at a photo that no longer exists. Uploads are written
  // under a fresh random name every time, so without this the bucket only grows.
  if (previousPath && previousPath !== nextPath) {
    try {
      await deleteStudentPhotoObject(previousPath);
    } catch {
      // Orphan left behind. Not worth failing a save the office just watched
      // succeed.
    }
  }

  revalidateFinanceSurfaces({ studentIds: [studentId] });

  await recordActivity({
    userId: (staffSession?.id as string | undefined) ?? null,
    kind: "student_edited",
    refId: studentId,
    payload: { photo: nextPath ? "updated" : "removed" },
  });

  return {
    status: "success",
    message: nextPath ? "Photo updated." : "Photo removed.",
    photoPath: nextPath,
  };
}

type StudentDuesMessage = { status: "success" | "warning"; message: string };

/**
 * What the office is told after a save that touched fee records.
 *
 * This used to be a two-branch string: "dues could not be prepared" or the
 * green "Student updated and fee records updated." There was no third case for
 * "the save happened, but some rows were left alone" — so a discount applied to
 * a student who had already paid returned the green sentence while the
 * installments never moved.
 */
function buildStudentDuesMessage(payload: {
  action: "added" | "updated";
  readyForPaymentCount: number;
  duesNeedAttentionCount: number;
  protectedRowCount: number;
  residualCreditTotal: number;
  reasonSummary: string | null;
}): StudentDuesMessage {
  const savedVerb = payload.action === "added" ? "saved" : "updated";

  if (payload.duesNeedAttentionCount > 0) {
    return {
      status: "warning",
      message: `Student ${savedVerb}, but dues could not be prepared. ${
        payload.reasonSummary ?? "Check Fee Setup for this class and year."
      }`,
    };
  }

  if (payload.protectedRowCount > 0) {
    const rowWord = payload.protectedRowCount === 1 ? "row" : "rows";
    const verb = payload.protectedRowCount === 1 ? "was" : "were";
    return {
      status: "warning",
      message:
        `Student ${savedVerb}. ${payload.protectedRowCount} fee ${rowWord} already carrying ` +
        `payments ${verb} left unchanged. Open Admin Tools → Session Health to review ` +
        `before collecting.`,
    };
  }

  if (payload.residualCreditTotal > 0) {
    return {
      status: "warning",
      message:
        `Student ${savedVerb} and fee records updated. The discount is larger than the ` +
        `unpaid balance, so ${formatInr(payload.residualCreditTotal)} is now refundable. ` +
        `Open Finance Controls to process a refund.`,
    };
  }

  if (payload.readyForPaymentCount > 0) {
    return {
      status: "success",
      message:
        payload.action === "added"
          ? "Student added and dues prepared. Open Payment Desk to collect payment."
          : "Student updated and fee records updated.",
    };
  }

  return {
    status: "warning",
    message: `Student ${savedVerb}, but no fee record changed. Open Admin Tools → Session Health to check Fee Setup.`,
  };
}

// Both danger-zone actions return state instead of throwing. A `throw` from a
// server action bound straight to `<form action={...}>` escapes to the nearest
// error boundary: staff saw a blank "something went wrong" screen with no clue
// which record failed or why, and the typed SR no was lost.
export async function archiveStudentAction(
  _prevState: StudentDangerActionState,
  formData: FormData,
): Promise<StudentDangerActionState> {
  const studentId = (formData.get("studentId") ?? "").toString().trim();

  if (!studentId) {
    return { status: "error", message: "Student is required.", deleted: false };
  }

  try {
    await requireStaffPermission("students:write");

    const student = await getStudentDetail(studentId);

    await archiveStudent(studentId);
    await prepareDuesForStudentsAutomatically({
      studentIds: [studentId],
      sessionLabel: student?.classSessionLabel || undefined,
      reason: "Student withdrawn",
    });
    after(drainFinancialViewRefresh);
    revalidateFinanceSurfaces({ studentIds: [studentId] });
    await publishOfficeSyncEvent({
      sessionLabel: student?.classSessionLabel || "unknown",
      entityType: "student",
      entityId: studentId,
      action: "archived",
      affectedStudentIds: [studentId],
    });

    return {
      status: "success",
      message: "Student withdrawn. Receipts and payment history stay saved.",
      deleted: false,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while withdrawing this student.",
      deleted: false,
    };
  }
}

export async function hardDeleteStudentAction(
  _prevState: StudentDangerActionState,
  formData: FormData,
): Promise<StudentDangerActionState> {
  const studentId = (formData.get("studentId") ?? "").toString().trim();

  if (!studentId) {
    return { status: "error", message: "Student is required.", deleted: false };
  }

  try {
    await requireStaffPermission("students:write");

    const safety = await getStudentDeletionSafety(studentId);

    if (!safety) {
      return {
        status: "error",
        message: "Student record was not found. It may already have been deleted.",
        deleted: false,
      };
    }

    const confirmation = (formData.get("confirmDelete") ?? "").toString();
    if (!matchesDeleteConfirmation(confirmation, safety.admissionNo)) {
      return {
        status: "error",
        message: `SR no did not match. Type ${safety.admissionNo} to confirm deleting this record.`,
        deleted: false,
      };
    }

    const forceTestRecord = formData.get("forceTestRecord") === "yes";
    await hardDeleteStudent(studentId, { forceTestRecord });
    revalidateFinanceSurfaces({ studentIds: [studentId] });
    await publishOfficeSyncEvent({
      sessionLabel: safety.sessionLabel || "unknown",
      entityType: "student",
      entityId: studentId,
      action: "deleted",
      affectedStudentIds: [studentId],
    });

    return {
      status: "success",
      message: `${safety.fullName} (SR ${safety.admissionNo}) was deleted.`,
      deleted: true,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unexpected error while deleting this student.",
      deleted: false,
    };
  }
}

export type BulkStudentEditResult = {
  status: "success" | "error";
  message: string;
  updatedCount: number;
  attemptedCount: number;
};

const STUDENT_STATUS_OPTIONS: ReadonlySet<StudentStatus> = new Set<StudentStatus>([
  "active",
  "inactive",
  "left",
  "graduated",
]);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function bulkUpdateStudentsAction(
  formData: FormData,
): Promise<BulkStudentEditResult> {
  const staffSession = await requireStaffPermission("students:write");

  const studentIds = Array.from(
    new Set(
      formData
        .getAll("studentIds")
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => UUID_REGEX.test(value)),
    ),
  );

  if (studentIds.length === 0) {
    return {
      status: "error",
      message: "Select at least one student to update.",
      updatedCount: 0,
      attemptedCount: 0,
    };
  }

  const rawClassId = (formData.get("classId") ?? "").toString().trim();
  const rawRouteId = (formData.get("transportRouteId") ?? "").toString().trim();
  const rawRouteClear = (formData.get("transportRouteClear") ?? "").toString().trim() === "yes";
  const rawStatus = (formData.get("status") ?? "").toString().trim();

  const patch: Parameters<typeof bulkUpdateStudentFields>[1] = {};

  if (rawClassId) {
    if (!UUID_REGEX.test(rawClassId)) {
      return {
        status: "error",
        message: "Selected class is invalid.",
        updatedCount: 0,
        attemptedCount: studentIds.length,
      };
    }

    const supabase = await createClient();
    const { data: classRow, error: classLookupError } = await supabase
      .from("classes")
      .select("id, session_label, is_active")
      .eq("id", rawClassId)
      .maybeSingle();

    if (classLookupError) {
      return {
        status: "error",
        message: `Class lookup failed: ${classLookupError.message}`,
        updatedCount: 0,
        attemptedCount: studentIds.length,
      };
    }

    if (!classRow || classRow.is_active === false) {
      return {
        status: "error",
        message: "Selected class is not active in the current session.",
        updatedCount: 0,
        attemptedCount: studentIds.length,
      };
    }

    const { data: feeSettingRow, error: feeSettingError } = await supabase
      .from("fee_settings")
      .select("id")
      .eq("class_id", rawClassId)
      .eq("is_active", true)
      .maybeSingle();

    if (feeSettingError) {
      return {
        status: "error",
        message: `Fee setup lookup failed: ${feeSettingError.message}`,
        updatedCount: 0,
        attemptedCount: studentIds.length,
      };
    }

    if (!feeSettingRow) {
      return {
        status: "error",
        message:
          "Selected class has no active fee settings. Open Fee Setup for this class before bulk-assigning students.",
        updatedCount: 0,
        attemptedCount: studentIds.length,
      };
    }

    patch.classId = rawClassId;
  }

  if (rawRouteClear) {
    patch.transportRouteId = null;
  } else if (rawRouteId) {
    if (!UUID_REGEX.test(rawRouteId)) {
      return {
        status: "error",
        message: "Selected transport route is invalid.",
        updatedCount: 0,
        attemptedCount: studentIds.length,
      };
    }
    patch.transportRouteId = rawRouteId;
  }

  if (rawStatus) {
    if (!STUDENT_STATUS_OPTIONS.has(rawStatus as StudentStatus)) {
      return {
        status: "error",
        message: "Selected status is not allowed.",
        updatedCount: 0,
        attemptedCount: studentIds.length,
      };
    }
    patch.status = rawStatus as StudentStatus;
  }

  if (Object.keys(patch).length === 0) {
    return {
      status: "error",
      message: "Choose at least one field to update.",
      updatedCount: 0,
      attemptedCount: studentIds.length,
    };
  }

  let updatedCount = 0;

  try {
    const result = await bulkUpdateStudentFields(studentIds, patch);
    updatedCount = result.updatedCount;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bulk update failed unexpectedly.";
    return {
      status: "error",
      message,
      updatedCount: 0,
      attemptedCount: studentIds.length,
    };
  }

  let syncOutcome: OfficeSyncOutcome | null = null;
  try {
    const duesResult = await prepareDuesForStudentsAutomatically({
      studentIds,
      reason: "Bulk student edit",
    });
    after(drainFinancialViewRefresh);
    syncOutcome = buildStudentDuesSyncOutcome({
      sessionLabel: duesResult.raw?.academicSessionLabel || "unknown",
      studentIds,
      duesResult,
    });
  } catch (error) {
    syncOutcome = buildFailedOfficeSyncOutcome({
      sessionLabel: "unknown",
      affectedStudentIds: studentIds,
      error,
    });
  }

  revalidateFinanceSurfaces({ studentIds });

  await publishOfficeSyncEvent({
    sessionLabel: syncOutcome?.sessionLabel ?? "unknown",
    entityType: "student",
    entityId: null,
    action: "bulk_updated",
    affectedStudentIds: studentIds,
    metadata: {
      patch,
      status: syncOutcome?.status ?? "unknown",
      updatedCount,
    },
  });

  await Promise.all(
    studentIds.map((studentId) =>
      recordActivity({
        userId: (staffSession?.id as string | undefined) ?? null,
        kind: "student_edited",
        refId: studentId,
        payload: {
          source: "bulk_edit",
          patch,
        },
      }),
    ),
  );

  return {
    status: "success",
    message:
      updatedCount === studentIds.length
        ? `Updated ${updatedCount} student${updatedCount === 1 ? "" : "s"}.`
        : `Updated ${updatedCount} of ${studentIds.length} selected students.`,
    updatedCount,
    attemptedCount: studentIds.length,
  };
}

export async function realignRecentImportsToActiveSessionAction(): Promise<{
  movedCount: number;
  preparedCount: number;
  attentionCount: number;
}> {
  const staff = await requireStaffPermission("fees:write");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "realign_recent_import_students_to_active_session",
    {
      p_run_by: staff.id ?? null,
    },
  );

  if (error) {
    throw new Error(`Unable to move recent import students: ${error.message}`);
  }

  const rpcRow = Array.isArray(data)
    ? ((data[0] ?? null) as RecentImportRealignRpcRow | null)
    : ((data ?? null) as RecentImportRealignRpcRow | null);
  const movedStudentIds = rpcRow?.moved_student_ids ?? [];
  const movedCount = rpcRow?.moved_count ?? movedStudentIds.length;
  const attentionCount = rpcRow?.attention_count ?? 0;

  if (movedStudentIds.length === 0) {
    return {
      movedCount,
      preparedCount: 0,
      attentionCount,
    };
  }

  const duesResult = await prepareDuesForStudentsAutomatically({
    studentIds: movedStudentIds,
    reason: "Recent import session realign",
  });

  after(drainFinancialViewRefresh);
  revalidateFinanceSurfaces({ studentIds: movedStudentIds });
  await publishOfficeSyncEvent({
    sessionLabel: duesResult.raw?.academicSessionLabel || "unknown",
    entityType: "import",
    entityId: null,
    action: "recent_imports_realigned",
    affectedStudentIds: movedStudentIds,
    metadata: {
      movedCount,
      preparedCount: duesResult.readyForPaymentCount,
      attentionCount: attentionCount + duesResult.duesNeedAttentionCount,
    },
  });

  return {
    movedCount,
    preparedCount: duesResult.readyForPaymentCount,
    attentionCount: attentionCount + duesResult.duesNeedAttentionCount,
  };
}


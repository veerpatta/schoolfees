"use server";

import { recordActivity } from "@/lib/activity/events";
import {
  bulkUpdateStudentFields,
  createStudent,
  archiveStudent,
  hardDeleteStudent,
  getStudentDetail,
  getStudentFormOptions,
  getStudentDeletionSafety,
  updateStudent,
} from "@/lib/students/data";
import type { StudentStatus } from "@/lib/db/types";
import { parseAcademicSessionLabel } from "@/lib/config/fee-rules";
import { applyThirdChildPolicyForStudentFamilies } from "@/lib/fees/conventional-discounts";
import {
  type StudentFormInput,
  type StudentFormActionState,
} from "@/lib/students/types";
import {
  isDuesSyncRelevantStatus,
  shouldSyncStudentDuesForChange,
} from "@/lib/students/dues-sync";
import { getStudentFormInput, validateStudentInput } from "@/lib/students/validation";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/supabase/session";
import {
  prepareDuesForStudentsAutomatically,
  revalidateFinanceSurfaces,
} from "@/lib/system-sync/finance-sync";
import {
  buildFailedOfficeSyncOutcome,
  buildOfficeSyncOutcomeFromDuesResult,
  buildSyncedOfficeSyncOutcome,
  type OfficeSyncOutcome,
} from "@/lib/system-sync/office-sync";
import { publishOfficeSyncEvent } from "@/lib/system-sync/office-sync-events";

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
      syncOutcome = buildStudentDuesSyncOutcome({
        sessionLabel: resolvedSessionLabel,
        studentIds: affectedStudentIds,
        duesResult,
      });

      syncMessage = buildStudentDuesMessage({
        action: "added",
        readyForPaymentCount: duesResult.readyForPaymentCount,
        duesNeedAttentionCount: duesResult.duesNeedAttentionCount,
        reasonSummary: duesResult.reasonSummary,
      });
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
      status: "success",
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
  const staffSession = await requireStaffPermission("students:write");
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
    let syncOutcome: OfficeSyncOutcome;

    if (shouldSyncDues) {
      const duesResult = await prepareDuesForStudentsAutomatically({
        studentIds: affectedStudentIds,
        sessionLabel: resolvedSessionLabel,
        reason: "Student updated",
      });
      syncOutcome = buildStudentDuesSyncOutcome({
        sessionLabel: resolvedSessionLabel,
        studentIds: affectedStudentIds,
        duesResult,
      });

      syncMessage = ` ${buildStudentDuesMessage({
        action: "updated",
        readyForPaymentCount: duesResult.readyForPaymentCount,
        duesNeedAttentionCount: duesResult.duesNeedAttentionCount,
        reasonSummary: duesResult.reasonSummary,
      })}`;
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
      status: "success",
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

function buildStudentDuesMessage(payload: {
  action: "added" | "updated";
  readyForPaymentCount: number;
  duesNeedAttentionCount: number;
  reasonSummary: string | null;
}) {
  if (payload.duesNeedAttentionCount === 0 && payload.readyForPaymentCount > 0) {
    return payload.action === "added"
      ? "Student added and dues prepared. Open Payment Desk to collect payment."
      : "Student updated and fee records updated.";
  }

  const savedVerb = payload.action === "added" ? "saved" : "updated";
  return `Student ${savedVerb}, but dues could not be prepared. ${
    payload.reasonSummary ?? "Check Fee Setup for this class and year."
  }`;
}

export async function archiveStudentAction(formData: FormData) {
  await requireStaffPermission("students:write");
  const studentId = (formData.get("studentId") ?? "").toString().trim();

  if (!studentId) {
    throw new Error("Student is required.");
  }

  const student = await getStudentDetail(studentId);

  await archiveStudent(studentId);
  await prepareDuesForStudentsAutomatically({
    studentIds: [studentId],
    sessionLabel: student?.classSessionLabel || undefined,
    reason: "Student withdrawn",
  });
  revalidateFinanceSurfaces({ studentIds: [studentId] });
  await publishOfficeSyncEvent({
    sessionLabel: student?.classSessionLabel || "unknown",
    entityType: "student",
    entityId: studentId,
    action: "archived",
    affectedStudentIds: [studentId],
  });
}

export async function hardDeleteStudentAction(formData: FormData) {
  await requireStaffPermission("students:write");
  const studentId = (formData.get("studentId") ?? "").toString().trim();

  if (!studentId) {
    throw new Error("Student is required.");
  }

  const safety = await getStudentDeletionSafety(studentId);

  if (!safety) {
    throw new Error("Student record was not found.");
  }

  const confirmation = (formData.get("confirmDelete") ?? "").toString().trim();
  if (confirmation !== safety.admissionNo) {
    throw new Error("Type the student's SR no exactly before deleting this record.");
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


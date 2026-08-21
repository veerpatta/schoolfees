"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { recordActivity } from "@/modules/activity/data/events";
import { getActiveSessionLabel } from "@/platform/session/active";
import {
  applyBulkUpdate,
  buildBulkUpdateLookups,
  loadBulkUpdateSnapshot,
} from "@/modules/students/data/bulk-update/data";
import { buildBulkUpdatePreview, type BulkUpdatePreview } from "@/modules/students/domain/bulk-update/diff";
import { resolveBulkUpdateFields } from "@/modules/students/domain/bulk-update/fields";
import { readBulkUpdateSheet } from "@/modules/students/domain/bulk-update/workbook";
import { requireStaffPermission } from "@/platform/supabase/session";
import {
  prepareDuesForStudentsAutomatically,
  revalidateFinanceSurfaces,
} from "@/modules/system-sync/domain/finance-sync";
import { drainFinancialViewRefresh } from "@/modules/system-sync/data/financial-view-refresh";

import type {
  BulkUpdateApplyState,
  BulkUpdatePreviewState,
} from "@/app/protected/students/bulk-update/action-state";

function readSelections(formData: FormData) {
  const classIds = formData
    .getAll("classIds")
    .map((value) => value.toString().trim())
    .filter(Boolean);
  const fieldKeys = formData
    .getAll("fieldKeys")
    .map((value) => value.toString().trim())
    .filter(Boolean);
  const file = formData.get("file");

  return {
    classIds,
    fieldKeys,
    file: file instanceof File ? file : null,
  };
}

/**
 * Recomputes the change set from the uploaded file every time. The client never
 * sends a list of changes to write — it sends the same file back — so what gets
 * applied is always what the server itself derived from current stored values.
 */
async function computePreview(formData: FormData): Promise<
  | { ok: true; preview: BulkUpdatePreview }
  | { ok: false; message: string }
> {
  const { classIds, fieldKeys, file } = readSelections(formData);

  if (classIds.length === 0) {
    return { ok: false, message: "Choose at least one class." };
  }

  if (fieldKeys.length === 0) {
    return { ok: false, message: "Choose at least one field to update." };
  }

  if (!file || file.size === 0) {
    return { ok: false, message: "Attach the filled-in Excel file." };
  }

  const fields = resolveBulkUpdateFields(fieldKeys);

  if (fields.length === 0) {
    return { ok: false, message: "None of the selected fields can be bulk updated." };
  }

  const sessionLabel = await getActiveSessionLabel();
  const { classes, resolver } = await buildBulkUpdateLookups(sessionLabel);

  // Class ids arrive from the form, so confine them to the active session
  // before they reach the snapshot query. Otherwise a hand-edited request could
  // pull students from another academic year into range.
  const allowedClassIds = classIds.filter((id) =>
    classes.some((option) => option.classId === id),
  );

  if (allowedClassIds.length === 0) {
    return { ok: false, message: `Those classes are not part of ${sessionLabel}.` };
  }

  const [snapshot, table] = await Promise.all([
    loadBulkUpdateSnapshot(allowedClassIds),
    readBulkUpdateSheet(file),
  ]);

  if (snapshot.length === 0) {
    return { ok: false, message: "No students were found in the selected classes." };
  }

  return {
    ok: true,
    preview: buildBulkUpdatePreview({ table, fields, snapshot, lookups: resolver }),
  };
}

export async function previewBulkUpdateAction(
  _prevState: BulkUpdatePreviewState,
  formData: FormData,
): Promise<BulkUpdatePreviewState> {
  try {
    await requireStaffPermission("students:write");

    const result = await computePreview(formData);

    if (!result.ok) {
      return { status: "error", message: result.message, preview: null, token: null };
    }

    const { preview } = result;

    if (preview.changedStudentCount === 0 && preview.errorRowCount === 0) {
      return {
        status: "success",
        message: "Nothing to update — every value in the sheet already matches what is saved.",
        preview,
        token: null,
      };
    }

    return {
      status: "success",
      message: `${preview.changeCount} change${preview.changeCount === 1 ? "" : "s"} across ${
        preview.changedStudentCount
      } student${preview.changedStudentCount === 1 ? "" : "s"}.`,
      preview,
      token: "ready",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to read that file.",
      preview: null,
      token: null,
    };
  }
}

export async function applyBulkUpdateAction(
  _prevState: BulkUpdateApplyState,
  formData: FormData,
): Promise<BulkUpdateApplyState> {
  try {
    const staff = await requireStaffPermission("students:write");
    const { classIds } = readSelections(formData);

    const result = await computePreview(formData);

    if (!result.ok) {
      return {
        status: "error",
        message: result.message,
        updatedStudentCount: 0,
        failures: [],
      };
    }

    const { preview } = result;

    if (preview.applicableRows.length === 0) {
      return {
        status: "error",
        message: "There is nothing to apply. Fix the flagged rows or change some values first.",
        updatedStudentCount: 0,
        failures: [],
      };
    }

    const outcome = await applyBulkUpdate(preview.applicableRows);

    const touchedIds = preview.applicableRows
      .map((row) => row.studentId)
      .filter((value): value is string => Boolean(value));

    // Only students whose class/route/status actually moved need dues rework —
    // regenerating for a phone-number edit would be pure load.
    if (preview.feeImpactStudentIds.length > 0) {
      try {
        await prepareDuesForStudentsAutomatically({
          studentIds: preview.feeImpactStudentIds,
          reason: "Bulk student update",
        });
        // Installment writes only enqueue a matview refresh (20260726154843);
        // without this the bulk-updated students keep showing their old dues
        // until the */2 cron fires.
        after(drainFinancialViewRefresh);
      } catch (error) {
        // The student rows are already saved; surface this without pretending
        // the whole apply failed.
        return {
          status: "error",
          message: `Saved ${outcome.updatedStudentCount} students, but dues could not be recalculated: ${
            error instanceof Error ? error.message : "unknown error"
          }. Open Admin Tools → Session Health.`,
          updatedStudentCount: outcome.updatedStudentCount,
          failures: outcome.failures,
        };
      }
    }

    revalidateFinanceSurfaces({ studentIds: touchedIds });
    // The workspace itself is not a finance surface, so it was never in that
    // list — leaving the class chips and their counts showing pre-apply numbers.
    revalidatePath("/protected/students/bulk-update");

    // A class change moves a student out of the classes that were selected, so
    // they vanish from this list. That reads as "my change did not save" unless
    // it is said out loud.
    const movedOut = preview.applicableRows.filter((row) =>
      row.changes.some(
        (change) =>
          change.fieldKey === "class" && change.toValue && !classIds.includes(change.toValue),
      ),
    );

    await recordActivity({
      userId: (staff?.id as string | undefined) ?? null,
      kind: "student_edited",
      refId: touchedIds[0] ?? null,
      payload: {
        source: "bulk-update",
        updatedStudentCount: outcome.updatedStudentCount,
        updatedFieldCount: outcome.updatedFieldCount,
        feeImpactCount: preview.feeImpactStudentIds.length,
      },
    });

    if (outcome.failures.length > 0) {
      return {
        status: "error",
        message: `Updated ${outcome.updatedStudentCount} students. ${outcome.failures.length} could not be saved.`,
        updatedStudentCount: outcome.updatedStudentCount,
        failures: outcome.failures,
      };
    }

    const movedNote =
      movedOut.length > 0
        ? ` ${movedOut.length === 1 ? `${movedOut[0]!.fullName} (SR ${movedOut[0]!.admissionNo}) has` : `${movedOut.length} students have`} moved to another class, so ${movedOut.length === 1 ? "they are" : "they are"} no longer in this list.`
        : "";

    return {
      status: "success",
      message: `Updated ${outcome.updatedFieldCount} value${
        outcome.updatedFieldCount === 1 ? "" : "s"
      } across ${outcome.updatedStudentCount} student${
        outcome.updatedStudentCount === 1 ? "" : "s"
      }.${movedNote}`,
      updatedStudentCount: outcome.updatedStudentCount,
      failures: [],
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to apply these updates.",
      updatedStudentCount: 0,
      failures: [],
    };
  }
}

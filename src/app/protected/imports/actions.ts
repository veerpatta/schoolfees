"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import {
  approveAllSafeImportRows,
  bulkUpdateImportRowReview,
  commitStudentImportBatch,
  createStudentImportBatch,
  resumeStudentImportBatch,
  runStudentImportDryRun,
  updateStudentImportRowReview,
} from "@/modules/imports/data/queries";
import {
  clearDuplicateAuditDecision,
  recordDuplicateAuditDecision,
} from "@/modules/imports/data/duplicate-audit";
import type { DuplicateAuditDecision } from "@/modules/imports/domain/types";
import { getStudentImportColumnMapping } from "@/modules/imports/domain/mapping";
import type { ImportAnomalyCategory } from "@/modules/imports/domain/types";
import type { ImportMode } from "@/modules/imports/domain/types";
import { requireStaffPermission } from "@/platform/supabase/session";
import {
  prepareDuesForStudentsAutomatically,
  revalidateCoreFinancePaths,
} from "@/modules/system-sync/domain/finance-sync";
import { publishOfficeSyncEvent } from "@/modules/system-sync/data/office-sync-events";
import { drainFinancialViewRefresh } from "@/modules/system-sync/data/financial-view-refresh";

/**
 * Wall-clock budget for one commit request. Comfortably inside the platform's
 * function ceiling, so the action returns a progress message under its own
 * control instead of being killed with the batch left mid-flight.
 */
const IMPORT_COMMIT_BUDGET_MS = 45_000;

function normalizeImportMode(value: FormDataEntryValue | string | null): ImportMode {
  return value === "update" ? "update" : "add";
}

function parseOptionalString(value: FormDataEntryValue | string | null) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}

function revalidateImportPostCommit(studentIds: readonly string[] = []) {
  revalidateCoreFinancePaths(studentIds);
}

function buildImportsUrl(
  batchId: string | null,
  notice?: string,
  error?: string,
  mode: ImportMode = "add",
  sessionLabel?: string | null,
) {
  const searchParams = new URLSearchParams();

  searchParams.set("mode", mode);

  if (sessionLabel?.trim()) {
    searchParams.set("session", sessionLabel.trim());
  }

  if (batchId) {
    searchParams.set("batchId", batchId);
  }

  if (notice) {
    searchParams.set("notice", notice);
  }

  if (error) {
    searchParams.set("error", error);
  }

  const queryString = searchParams.toString();

  return queryString ? `/protected/imports?${queryString}` : "/protected/imports";
}

export async function uploadStudentImportBatchAction(formData: FormData) {
  await requireStaffPermission("students:write");

  const file = formData.get("importFile");
  const mode = normalizeImportMode(formData.get("importMode"));
  const sessionLabel = parseOptionalString(formData.get("sessionLabel"));
  let batchId: string | null = null;
  let autoValidated = false;

  try {
    if (!(file instanceof File)) {
      throw new Error("Please select a CSV or XLSX file to import.");
    }

    const result = await createStudentImportBatch(file, mode, sessionLabel);
    batchId = result.batchId;
    autoValidated = result.autoValidated;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to upload the import file.";

    redirect(buildImportsUrl(batchId, undefined, message, mode, sessionLabel));
  }

  revalidatePath("/protected/imports");
  redirect(
    buildImportsUrl(
      batchId,
      autoValidated
        ? "Upload complete. Rows were checked automatically. Review summary and import valid students."
        : "Upload complete. Match spreadsheet columns, then check rows.",
      undefined,
      mode,
      sessionLabel,
    ),
  );
}

export async function runStudentImportDryRunAction(formData: FormData) {
  await requireStaffPermission("students:write");

  const batchId =
    typeof formData.get("batchId") === "string" ? String(formData.get("batchId")) : "";
  const mode = normalizeImportMode(formData.get("importMode"));
  const mapping = getStudentImportColumnMapping(formData);

  try {
    if (!batchId) {
      throw new Error("Select an import batch before running dry-run validation.");
    }

    await runStudentImportDryRun(batchId, mapping);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to run dry-run validation.";

    redirect(buildImportsUrl(batchId || null, undefined, message, mode));
  }

  revalidatePath("/protected/imports");
  redirect(
    buildImportsUrl(
      batchId,
      "Rows checked. Review rows needing correction, then import valid students.",
      undefined,
      mode,
    ),
  );
}

export async function updateStudentImportRowReviewAction(formData: FormData) {
  await requireStaffPermission("students:write");

  const batchId =
    typeof formData.get("batchId") === "string" ? String(formData.get("batchId")) : "";
  const mode = normalizeImportMode(formData.get("importMode"));
  const rowId = typeof formData.get("rowId") === "string" ? String(formData.get("rowId")) : "";
  const reviewStatus =
    typeof formData.get("reviewStatus") === "string"
      ? String(formData.get("reviewStatus"))
      : "";
  const reviewNote =
    typeof formData.get("reviewNote") === "string" ? String(formData.get("reviewNote")) : "";

  try {
    if (!batchId || !rowId || !reviewStatus) {
      throw new Error("Batch, row, and review action are required.");
    }

    if (![
      "pending",
      "approved",
      "hold",
      "skipped",
    ].includes(reviewStatus)) {
      throw new Error("Invalid review action.");
    }

    await updateStudentImportRowReview(
      batchId,
      rowId,
      reviewStatus as "pending" | "approved" | "hold" | "skipped",
      reviewNote.trim() || null,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update row review status.";

    redirect(buildImportsUrl(batchId || null, undefined, message, mode));
  }

  revalidatePath("/protected/imports");
  redirect(buildImportsUrl(batchId, "Review status updated for the selected row.", undefined, mode));
}

export async function bulkUpdateImportRowReviewAction(formData: FormData) {
  await requireStaffPermission("students:write");

  const batchId =
    typeof formData.get("batchId") === "string" ? String(formData.get("batchId")) : "";
  const mode = normalizeImportMode(formData.get("importMode"));
  const reviewStatus =
    typeof formData.get("reviewStatus") === "string"
      ? String(formData.get("reviewStatus"))
      : "";
  const reviewNote =
    typeof formData.get("reviewNote") === "string" ? String(formData.get("reviewNote")) : "";
  const categories = formData.getAll("categories").filter(
    (value): value is ImportAnomalyCategory =>
      value === "missing-admission-no" ||
      value === "invalid-dob" ||
      value === "duplicate-admission-no" ||
      value === "duplicate-name-class-dob" ||
      value === "unmapped-class" ||
      value === "unmapped-route" ||
      value === "missing-parent-fields" ||
      value === "placeholder-values",
  );

  try {
    if (!batchId || !reviewStatus || categories.length === 0) {
      throw new Error("Batch, review action, and anomaly categories are required.");
    }

    if (!["pending", "approved", "hold", "skipped"].includes(reviewStatus)) {
      throw new Error("Invalid review action.");
    }

    await bulkUpdateImportRowReview(
      batchId,
      categories,
      reviewStatus as "pending" | "approved" | "hold" | "skipped",
      reviewNote.trim() || null,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update row review status.";

    redirect(buildImportsUrl(batchId || null, undefined, message, mode));
  }

  revalidatePath("/protected/imports");
  redirect(buildImportsUrl(batchId, "Review status updated for matching rows.", undefined, mode));
}

export async function commitStudentImportBatchAction(formData: FormData) {
  await requireStaffPermission("students:write");

  const batchId =
    typeof formData.get("batchId") === "string" ? String(formData.get("batchId")) : "";
  const mode = normalizeImportMode(formData.get("importMode"));
  let result: Awaited<ReturnType<typeof commitStudentImportBatch>> | null = null;

  try {
    if (!batchId) {
      throw new Error("Select an import batch before saving rows.");
    }

    // Commit in chunks under a wall-clock budget rather than one unbounded
    // pass. Each chunk persists its own progress, so if this request is killed
    // the already-saved rows stay saved and the batch is left continuable
    // instead of stranded — the failure that silently dropped 99 approved rows
    // from batch 59fb0977 on 2026-08-06.
    const deadline = Date.now() + IMPORT_COMMIT_BUDGET_MS;

    for (;;) {
      result = await commitStudentImportBatch(batchId);

      if (result.remainingCount === 0 || Date.now() >= deadline) {
        break;
      }
    }

    await publishOfficeSyncEvent({
      sessionLabel: result.targetSessionLabel || "unknown",
      entityType: "import",
      entityId: batchId,
      action: "committed",
      affectedStudentIds: result.affectedStudentIds,
      metadata: {
        status: result.status,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        duesReadyCount: result.duesReadyCount,
        duesAttentionCount: result.duesAttentionCount,
      },
    });

    const importedStudentIds = result.affectedStudentIds ?? [];

    if (importedStudentIds.length > 0) {
      after(async () => {
        await prepareDuesForStudentsAutomatically({
          studentIds: importedStudentIds,
          reason: "Bulk import auto-prepare",
          useSystemClient: true,
        });
        // The installment writes above only enqueue a matview refresh
        // (20260726154843). Drain it here or the freshly imported students
        // read as "Dues not prepared" until the */2 cron fires.
        await drainFinancialViewRefresh();
      });
    }

    if (result.ledgerSyncError) {
      revalidateImportPostCommit(result.affectedStudentIds);
      redirect(
        buildImportsUrl(
          batchId,
          `Students imported, but dues sync needs attention: ${result.ledgerSyncError}`,
          undefined,
          mode,
        ),
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to complete the import batch.";

    redirect(buildImportsUrl(batchId || null, undefined, message, mode));
  }

  revalidateImportPostCommit(result?.affectedStudentIds ?? []);

  // Budget ran out with rows still queued. Say so plainly with the count — the
  // old behaviour reported a finished import and silently dropped the rest.
  if (result && result.remainingCount > 0) {
    redirect(
      buildImportsUrl(
        batchId,
        `Saved ${result.importedCount} row${result.importedCount === 1 ? "" : "s"} so far. ${result.remainingCount} still to go — press Import again to continue where it stopped.`,
        undefined,
        mode,
      ),
    );
  }

  redirect(
    buildImportsUrl(
      batchId,
      "Import finished. Valid rows were saved to Student Master. Rows needing correction remain available for follow-up.",
      undefined,
      mode,
    ),
  );
}

export async function recordDuplicateAuditDecisionAction(formData: FormData) {
  await requireStaffPermission("students:write");

  const batchId =
    typeof formData.get("batchId") === "string" ? String(formData.get("batchId")) : "";
  const rowId =
    typeof formData.get("rowId") === "string" ? String(formData.get("rowId")) : "";
  const decisionValue =
    typeof formData.get("decision") === "string" ? String(formData.get("decision")) : "";
  const targetStudentId =
    typeof formData.get("targetStudentId") === "string"
      ? String(formData.get("targetStudentId")).trim() || null
      : null;
  const mode = normalizeImportMode(formData.get("importMode"));

  try {
    if (!batchId || !rowId) {
      throw new Error("Batch and row are required to record an audit decision.");
    }

    if (decisionValue === "clear") {
      await clearDuplicateAuditDecision({ batchId, rowId });
    } else if (
      decisionValue === "proceed_new" ||
      decisionValue === "mark_duplicate" ||
      decisionValue === "mark_update"
    ) {
      await recordDuplicateAuditDecision({
        batchId,
        rowId,
        decision: decisionValue as DuplicateAuditDecision,
        targetStudentId,
      });
    } else {
      throw new Error("Invalid duplicate audit decision.");
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to record duplicate audit decision.";

    redirect(buildImportsUrl(batchId || null, undefined, message, mode));
  }

  revalidatePath("/protected/imports");
  redirect(
    buildImportsUrl(
      batchId,
      decisionValue === "clear"
        ? "Cleared duplicate audit decision."
        : "Duplicate audit decision saved.",
      undefined,
      mode,
    ),
  );
}

export async function resumeStudentImportBatchAction(formData: FormData) {
  await requireStaffPermission("students:write");

  const batchId =
    typeof formData.get("batchId") === "string" ? String(formData.get("batchId")) : "";
  const mode = normalizeImportMode(formData.get("importMode"));
  let result: Awaited<ReturnType<typeof resumeStudentImportBatch>> | null = null;

  try {
    if (!batchId) {
      throw new Error("Select an import batch before resuming.");
    }

    result = await resumeStudentImportBatch(batchId);
    await publishOfficeSyncEvent({
      sessionLabel: result.targetSessionLabel || "unknown",
      entityType: "import",
      entityId: batchId,
      action: "committed",
      affectedStudentIds: result.affectedStudentIds,
      metadata: {
        status: result.status,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        duesReadyCount: result.duesReadyCount,
        duesAttentionCount: result.duesAttentionCount,
        resumed: true,
      },
    });

    const importedStudentIds = result.affectedStudentIds ?? [];

    if (importedStudentIds.length > 0) {
      after(async () => {
        await prepareDuesForStudentsAutomatically({
          studentIds: importedStudentIds,
          reason: "Resume failed import auto-prepare",
          useSystemClient: true,
        });
        await drainFinancialViewRefresh();
      });
    }

    if (result.ledgerSyncError) {
      revalidateImportPostCommit(result.affectedStudentIds);
      redirect(
        buildImportsUrl(
          batchId,
          `Resume finished, but dues sync needs attention: ${result.ledgerSyncError}`,
          undefined,
          mode,
        ),
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to resume the import batch.";

    redirect(buildImportsUrl(batchId || null, undefined, message, mode));
  }

  revalidateImportPostCommit(result?.affectedStudentIds ?? []);
  redirect(
    buildImportsUrl(
      batchId,
      "Resume finished. Previously failed rows were retried; any rows still failing remain available for correction.",
      undefined,
      mode,
    ),
  );
}

export async function approveAllSafeRowsAction(formData: FormData) {
  await requireStaffPermission("students:write");

  const batchId =
    typeof formData.get("batchId") === "string" ? String(formData.get("batchId")) : "";
  const mode = normalizeImportMode(formData.get("importMode"));

  try {
    if (!batchId) {
      throw new Error("Select an upload before approving rows.");
    }

    await approveAllSafeImportRows(batchId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to approve safe rows.";

    redirect(buildImportsUrl(batchId || null, undefined, message, mode));
  }

  revalidatePath("/protected/imports");
  redirect(buildImportsUrl(batchId, "All safe rows are approved and ready to import.", undefined, mode));
}

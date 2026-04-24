"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  approveAllSafeImportRows,
  bulkUpdateImportRowReview,
  commitStudentImportBatch,
  createStudentImportBatch,
  runStudentImportDryRun,
  updateStudentImportRowReview,
} from "@/lib/import/data";
import { getStudentImportColumnMapping } from "@/lib/import/mapping";
import type { ImportAnomalyCategory } from "@/lib/import/types";
import type { ImportMode } from "@/lib/import/types";
import { requireStaffPermission } from "@/lib/supabase/session";

function normalizeImportMode(value: FormDataEntryValue | string | null): ImportMode {
  return value === "update" ? "update" : "add";
}

function buildImportsUrl(
  batchId: string | null,
  notice?: string,
  error?: string,
  mode: ImportMode = "add",
) {
  const searchParams = new URLSearchParams();

  searchParams.set("mode", mode);

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
  let batchId: string | null = null;
  let autoValidated = false;

  try {
    if (!(file instanceof File)) {
      throw new Error("Please select a CSV or XLSX file to import.");
    }

    const result = await createStudentImportBatch(file, mode);
    batchId = result.batchId;
    autoValidated = result.autoValidated;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to upload the import file.";

    redirect(buildImportsUrl(batchId, undefined, message, mode));
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

  try {
    if (!batchId) {
      throw new Error("Select an import batch before saving rows.");
    }

    const result = await commitStudentImportBatch(batchId);

    if (result.ledgerSyncError) {
      revalidatePath("/protected/imports");
      revalidatePath("/protected/students");
      revalidatePath("/protected/dues");
      revalidatePath("/protected/defaulters");
      revalidatePath("/protected/reports");
      revalidatePath("/protected/fee-setup");
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

  revalidatePath("/protected/imports");
  revalidatePath("/protected/students");
  redirect(
    buildImportsUrl(
      batchId,
      "Import finished. Valid rows were saved to Student Master. Rows needing correction remain available for follow-up.",
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

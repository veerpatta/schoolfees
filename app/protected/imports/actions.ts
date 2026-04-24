"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  bulkUpdateImportRowReview,
  commitStudentImportBatch,
  createStudentImportBatch,
  runStudentImportDryRun,
  updateStudentImportRowReview,
} from "@/lib/import/data";
import { getStudentImportColumnMapping } from "@/lib/import/mapping";
import type { ImportAnomalyCategory } from "@/lib/import/types";
import { requireStaffPermission } from "@/lib/supabase/session";

function buildImportsUrl(batchId: string | null, notice?: string, error?: string) {
  const searchParams = new URLSearchParams();

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
  let batchId: string | null = null;

  try {
    if (!(file instanceof File)) {
      throw new Error("Please select a CSV or XLSX file to import.");
    }

    batchId = await createStudentImportBatch(file);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to upload the import file.";

    redirect(buildImportsUrl(batchId, undefined, message));
  }

  revalidatePath("/protected/imports");
  redirect(
    buildImportsUrl(
      batchId,
      "Batch uploaded. Review the auto-mapping, then run dry-run validation.",
    ),
  );
}

export async function runStudentImportDryRunAction(formData: FormData) {
  await requireStaffPermission("students:write");

  const batchId =
    typeof formData.get("batchId") === "string" ? String(formData.get("batchId")) : "";
  const mapping = getStudentImportColumnMapping(formData);

  try {
    if (!batchId) {
      throw new Error("Select an import batch before running dry-run validation.");
    }

    await runStudentImportDryRun(batchId, mapping);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to run dry-run validation.";

    redirect(buildImportsUrl(batchId || null, undefined, message));
  }

  revalidatePath("/protected/imports");
  redirect(
    buildImportsUrl(
      batchId,
      "Dry-run complete. Review duplicates and row-level errors before importing valid rows.",
    ),
  );
}

export async function updateStudentImportRowReviewAction(formData: FormData) {
  await requireStaffPermission("students:write");

  const batchId =
    typeof formData.get("batchId") === "string" ? String(formData.get("batchId")) : "";
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

    redirect(buildImportsUrl(batchId || null, undefined, message));
  }

  revalidatePath("/protected/imports");
  redirect(buildImportsUrl(batchId, "Review status updated for the selected row."));
}

export async function bulkUpdateImportRowReviewAction(formData: FormData) {
  await requireStaffPermission("students:write");

  const batchId =
    typeof formData.get("batchId") === "string" ? String(formData.get("batchId")) : "";
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

    redirect(buildImportsUrl(batchId || null, undefined, message));
  }

  revalidatePath("/protected/imports");
  redirect(buildImportsUrl(batchId, "Review status updated for matching anomaly rows."));
}

export async function commitStudentImportBatchAction(formData: FormData) {
  await requireStaffPermission("students:write");

  const batchId =
    typeof formData.get("batchId") === "string" ? String(formData.get("batchId")) : "";

  try {
    if (!batchId) {
      throw new Error("Select an import batch before saving rows.");
    }

    await commitStudentImportBatch(batchId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to complete the import batch.";

    redirect(buildImportsUrl(batchId || null, undefined, message));
  }

  revalidatePath("/protected/imports");
  revalidatePath("/protected/students");
  revalidatePath("/protected/dues");
  revalidatePath("/protected/defaulters");
  revalidatePath("/protected/reports");
  revalidatePath("/protected/fee-setup");
  redirect(
    buildImportsUrl(
      batchId,
      "Import finished. Approved rows were saved to Student Master. Matching SR numbers updated existing students; unapproved rows remain in the QA queue.",
    ),
  );
}

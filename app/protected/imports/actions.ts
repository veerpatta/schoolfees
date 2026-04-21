"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  commitStudentImportBatch,
  createStudentImportBatch,
  runStudentImportDryRun,
} from "@/lib/import/data";
import { getStudentImportColumnMapping } from "@/lib/import/mapping";
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
  revalidatePath("/protected/fee-setup");
  redirect(
    buildImportsUrl(
      batchId,
      "Import finished. Imported rows are now part of the student master. Invalid and duplicate rows remain in the batch trail.",
    ),
  );
}

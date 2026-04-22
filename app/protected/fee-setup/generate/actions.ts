"use server";

import { revalidatePath } from "next/cache";

import {
  applyLedgerRegenerationBatch,
  createLedgerRegenerationPreview,
} from "@/lib/fees/regeneration";
import type { LedgerRegenerationActionState } from "@/lib/fees/types";
import { requireStaffPermission } from "@/lib/supabase/session";

function parseIntent(formData: FormData) {
  const intent = (formData.get("_intent") ?? "preview").toString().trim();
  return intent === "apply" ? "apply" : "preview";
}

function parseRequiredString(value: FormDataEntryValue | null, label: string) {
  const normalized = (value ?? "").toString().trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function parseUuid(value: FormDataEntryValue | null, label: string) {
  const normalized = (value ?? "").toString().trim();
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(normalized)) {
    throw new Error(`${label} is invalid.`);
  }

  return normalized;
}

function toErrorState(error: unknown): LedgerRegenerationActionState {
  return {
    status: "error",
    message:
      error instanceof Error
        ? error.message
        : "Unable to run ledger regeneration right now. Please try again.",
    batchId: null,
    preview: null,
  };
}

function toPreviewState(payload: {
  batchId: string;
  preview: NonNullable<LedgerRegenerationActionState["preview"]>;
  message: string;
}): LedgerRegenerationActionState {
  return {
    status: "preview",
    message: payload.message,
    batchId: payload.batchId,
    preview: payload.preview,
  };
}

function toSuccessState(message: string): LedgerRegenerationActionState {
  return {
    status: "success",
    message,
    batchId: null,
    preview: null,
  };
}

function buildPreviewMessage(payload: {
  policyRevisionLabel: string;
  rowsRecalculated: number;
  rowsSkipped: number;
  rowsRequiringReview: number;
  studentsAffected: number;
}) {
  return `Preview ready for ${payload.policyRevisionLabel}: ${payload.rowsRecalculated} rows will be recalculated, ${payload.rowsSkipped} rows will be skipped, and ${payload.rowsRequiringReview} rows need manual review across ${payload.studentsAffected} students.`;
}

function buildApplyMessage(payload: {
  policyRevisionLabel: string;
  rowsInserted: number;
  rowsUpdated: number;
  rowsCancelled: number;
  rowsRequiringReview: number;
}) {
  const recalculated = payload.rowsInserted + payload.rowsUpdated + payload.rowsCancelled;

  return `Applied ${payload.policyRevisionLabel}: ${recalculated} rows recalculated (${payload.rowsInserted} inserted, ${payload.rowsUpdated} updated, ${payload.rowsCancelled} cancelled) and ${payload.rowsRequiringReview} rows left for manual review.`;
}

function revalidateRegenerationSurface() {
  revalidatePath("/protected");
  revalidatePath("/protected/setup");
  revalidatePath("/protected/students");
  revalidatePath("/protected/fee-setup");
  revalidatePath("/protected/fee-setup/generate");
  revalidatePath("/protected/ledger");
  revalidatePath("/protected/payments");
  revalidatePath("/protected/collections");
  revalidatePath("/protected/defaulters");
  revalidatePath("/protected/reports");
}

export async function runLedgerRegenerationAction(
  _previous: LedgerRegenerationActionState,
  formData: FormData,
): Promise<LedgerRegenerationActionState> {
  try {
    await requireStaffPermission("fees:write");

    if (parseIntent(formData) === "apply") {
      const batchId = parseUuid(formData.get("batchId"), "Preview batch");
      const result = await applyLedgerRegenerationBatch(batchId);
      revalidateRegenerationSurface();

      return toSuccessState(
        buildApplyMessage({
          policyRevisionLabel: result.applied.policyRevisionLabel as string,
          rowsInserted: Number(result.applied.rowsInserted ?? 0),
          rowsUpdated: Number(result.applied.rowsUpdated ?? 0),
          rowsCancelled: Number(result.applied.rowsCancelled ?? 0),
          rowsRequiringReview: Number(result.applied.rowsRequiringReview ?? 0),
        }),
      );
    }

    const previewResult = await createLedgerRegenerationPreview({
      reason: parseRequiredString(formData.get("reason"), "Reason"),
    });

    return toPreviewState({
      batchId: previewResult.batchId,
      preview: previewResult.preview,
      message: buildPreviewMessage({
        policyRevisionLabel: previewResult.preview.policyRevisionLabel,
        rowsRecalculated: previewResult.preview.rowsRecalculated,
        rowsSkipped: previewResult.preview.rowsSkipped,
        rowsRequiringReview: previewResult.preview.rowsRequiringReview,
        studentsAffected: previewResult.preview.affectedStudents,
      }),
    });
  } catch (error) {
    return toErrorState(error);
  }
}

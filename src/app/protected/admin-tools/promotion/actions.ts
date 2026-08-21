"use server";

import { revalidatePath } from "next/cache";

import { revalidateTagAfterWrite } from "@/modules/system-sync/domain/finance-revalidation";
import { redirect } from "next/navigation";

import { deleteAcademicSession } from "@/modules/master-data/data/queries";
import {
  applyPromotionRun,
  createPromotionPreview,
  rollbackPromotionRun,
  updatePromotionEntryDecision,
  type PromotionEntryDecision,
} from "@/modules/promotion/data/queries";
import { requireStaffPermission } from "@/platform/supabase/session";

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function createPromotionPreviewAction(formData: FormData) {
  const sourceSession = asString(formData.get("sourceSessionLabel"));
  const targetSession = asString(formData.get("targetSessionLabel"));

  try {
    const result = await createPromotionPreview({
      sourceSessionLabel: sourceSession,
      targetSessionLabel: targetSession,
    });
    revalidatePath("/protected/admin-tools/promotion");
    redirect(`/protected/admin-tools/promotion/${result.run.id}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to build promotion preview.";
    redirect(`/protected/admin-tools/promotion?error=${encodeURIComponent(message)}`);
  }
}

export async function applyPromotionRunAction(formData: FormData) {
  const runId = asString(formData.get("runId"));
  const confirmation = asString(formData.get("confirmation"));

  if (!runId) {
    redirect(
      `/protected/admin-tools/promotion?error=${encodeURIComponent("Run id is required.")}`,
    );
  }

  if (confirmation !== "APPLY") {
    redirect(
      `/protected/admin-tools/promotion/${runId}?error=${encodeURIComponent("Type APPLY to confirm the bulk class promotion.")}`,
    );
  }

  try {
    await applyPromotionRun(runId);
    // Transfer to Next Session copies the fee policy into the new year. The
    // fee-policy resolvers are cached for 300s under this tag; without the
    // bust, loadPolicyForSession cannot see the new row and silently falls
    // back to the outgoing year's schedule and late fee.
    revalidateTagAfterWrite("fee-policy");
    revalidatePath("/protected/admin-tools/promotion");
    revalidatePath(`/protected/admin-tools/promotion/${runId}`);
    redirect(
      `/protected/admin-tools/promotion/${runId}?notice=${encodeURIComponent("Promotion applied. Review the summary below and roll back if needed.")}`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to apply promotion.";
    redirect(`/protected/admin-tools/promotion/${runId}?error=${encodeURIComponent(message)}`);
  }
}

export async function rollbackPromotionRunAction(formData: FormData) {
  const runId = asString(formData.get("runId"));
  const confirmation = asString(formData.get("confirmation"));

  if (!runId) {
    redirect(
      `/protected/admin-tools/promotion?error=${encodeURIComponent("Run id is required.")}`,
    );
  }

  if (confirmation !== "ROLLBACK") {
    redirect(
      `/protected/admin-tools/promotion/${runId}?error=${encodeURIComponent("Type ROLLBACK to confirm.")}`,
    );
  }

  try {
    await rollbackPromotionRun(runId);
    revalidatePath("/protected/admin-tools/promotion");
    revalidatePath(`/protected/admin-tools/promotion/${runId}`);
    redirect(
      `/protected/admin-tools/promotion/${runId}?notice=${encodeURIComponent("Promotion rolled back.")}`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to roll back promotion.";
    redirect(`/protected/admin-tools/promotion/${runId}?error=${encodeURIComponent(message)}`);
  }
}

export async function deleteSessionByMistakeAction(formData: FormData) {
  const sessionId = asString(formData.get("sessionId"));
  const confirmation = asString(formData.get("confirmation"));

  if (!sessionId) {
    redirect(
      `/protected/admin-tools/promotion?error=${encodeURIComponent("Session id is required.")}`,
    );
  }

  if (confirmation !== "DELETE") {
    redirect(
      `/protected/admin-tools/promotion?error=${encodeURIComponent("Type DELETE to confirm removing the session created by mistake.")}`,
    );
  }

  try {
    await requireStaffPermission("settings:write");
    await deleteAcademicSession(sessionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete session.";
    redirect(`/protected/admin-tools/promotion?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/protected/admin-tools/promotion");
  redirect(
    `/protected/admin-tools/promotion?notice=${encodeURIComponent("Session deleted. Its classes, fee setup, and copied policies were removed.")}`,
  );
}

export async function updatePromotionEntryDecisionAction(formData: FormData) {
  const runId = asString(formData.get("runId"));
  const entryId = asString(formData.get("entryId"));
  const decisionRaw = asString(formData.get("decision"));

  if (!runId || !entryId) {
    redirect(
      `/protected/admin-tools/promotion?error=${encodeURIComponent("Run and entry are required.")}`,
    );
  }

  if (
    decisionRaw !== "pending" &&
    decisionRaw !== "promote" &&
    decisionRaw !== "graduate" &&
    decisionRaw !== "skip" &&
    decisionRaw !== "manual"
  ) {
    redirect(
      `/protected/admin-tools/promotion/${runId}?error=${encodeURIComponent("Invalid decision.")}`,
    );
  }

  try {
    await updatePromotionEntryDecision({
      runId,
      entryId,
      decision: decisionRaw as PromotionEntryDecision,
    });
    revalidatePath(`/protected/admin-tools/promotion/${runId}`);
    // ?done= so the run page can confirm the save. Without it the dropdown
    // simply re-rendered and there was no way to tell a saved decision from
    // one that never took.
    redirect(`/protected/admin-tools/promotion/${runId}?done=entryDecisionSaved`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update decision.";
    redirect(`/protected/admin-tools/promotion/${runId}?error=${encodeURIComponent(message)}`);
  }
}

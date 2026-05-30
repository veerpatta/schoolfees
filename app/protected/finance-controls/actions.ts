"use server";

import { revalidatePath } from "next/cache";

import type { PaymentMode, RefundRequestStatus } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import type { FinanceControlsActionState } from "@/lib/finance-controls/types";
import { requireStaffPermission } from "@/lib/supabase/session";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseRequiredString(value: FormDataEntryValue | null, label: string) {
  const normalized = (value ?? "").toString().trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function parseOptionalString(value: FormDataEntryValue | null) {
  const normalized = (value ?? "").toString().trim();
  return normalized || null;
}

function parseUuid(value: FormDataEntryValue | null, label: string) {
  const normalized = parseRequiredString(value, label);

  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${label} is invalid.`);
  }

  return normalized;
}

function parseDate(value: FormDataEntryValue | null, label: string) {
  const normalized = parseRequiredString(value, label);

  if (!DATE_PATTERN.test(normalized)) {
    throw new Error(`${label} is invalid.`);
  }

  return normalized;
}

function parseAmount(value: FormDataEntryValue | null, label: string) {
  const numeric = Number((value ?? "").toString().trim());

  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${label} must be a whole number greater than 0.`);
  }

  return numeric;
}

function parseRefundMethod(value: FormDataEntryValue | null): PaymentMode {
  const normalized = (value ?? "").toString().trim();

  if (
    normalized === "cash" ||
    normalized === "upi" ||
    normalized === "bank_transfer" ||
    normalized === "cheque"
  ) {
    return normalized;
  }

  throw new Error("Refund method is invalid.");
}

function parseRefundStatus(value: FormDataEntryValue | null): RefundRequestStatus {
  const normalized = (value ?? "").toString().trim();

  if (
    normalized === "pending_approval" ||
    normalized === "approved" ||
    normalized === "processed" ||
    normalized === "rejected"
  ) {
    return normalized;
  }

  throw new Error("Refund status is invalid.");
}

function parseWorkflowAction(value: FormDataEntryValue | null) {
  const normalized = (value ?? "").toString().trim();

  if (
    normalized === "request_refund" ||
    normalized === "approve_refund" ||
    normalized === "reject_refund" ||
    normalized === "process_refund" ||
    normalized === "review_adjustment"
  ) {
    return normalized;
  }

  throw new Error("Workflow action is invalid.");
}

function toActionStateError(error: unknown): FinanceControlsActionState {
  return {
    status: "error",
    message:
      error instanceof Error
        ? error.message
        : "Unable to save finance controls right now. Please try again.",
  };
}

function toSuccess(message: string): FinanceControlsActionState {
  return {
    status: "success",
    message,
  };
}

function revalidateFinanceSurface() {
  revalidatePath("/protected/finance-controls");
  revalidatePath("/protected/payments");
  revalidatePath("/protected/receipts");
  revalidatePath("/protected/ledger");
  revalidatePath("/protected/defaulters");
  revalidatePath("/protected/reports");
  revalidatePath("/protected");
}

export async function submitRefundWorkflowAction(
  _previous: FinanceControlsActionState,
  formData: FormData,
): Promise<FinanceControlsActionState> {
  try {
    const workflowAction = parseWorkflowAction(formData.get("workflowAction"));
    const staff =
      workflowAction === "request_refund" || workflowAction === "process_refund"
        ? await requireStaffPermission("finance:write")
        : await requireStaffPermission("finance:approve");
    const supabase = await createClient();

    if (workflowAction === "request_refund") {
      const receiptId = parseUuid(formData.get("receiptId"), "Receipt");
      const refundDate = parseDate(formData.get("refundDate"), "Refund date");
      const requestedAmount = parseAmount(formData.get("requestedAmount"), "Requested amount");
      const refundMethod = parseRefundMethod(formData.get("refundMethod"));
      const refundReference = parseOptionalString(formData.get("refundReference"));
      const reason = parseRequiredString(formData.get("reason"), "Reason");
      const notes = parseOptionalString(formData.get("notes"));

      const { data: receiptRaw, error: receiptError } = await supabase
        .from("receipts")
        .select("id, student_id, receipt_number, total_amount")
        .eq("id", receiptId)
        .single();

      if (receiptError || !receiptRaw) {
        throw new Error("Selected receipt was not found.");
      }

      if (requestedAmount > receiptRaw.total_amount) {
        throw new Error("Refund amount cannot exceed the receipt total.");
      }

      const { error } = await supabase.from("refund_requests").insert({
        refund_date: refundDate,
        receipt_id: receiptRaw.id,
        student_id: receiptRaw.student_id,
        requested_amount: requestedAmount,
        refund_method: refundMethod,
        refund_reference: refundReference,
        reason,
        notes,
        status: "pending_approval",
      });

      if (error) {
        throw new Error(error.message);
      }

      revalidateFinanceSurface();
      return toSuccess(`Refund request saved for ${receiptRaw.receipt_number} and sent for approval.`);
    }

    const refundRequestId = parseUuid(formData.get("refundRequestId"), "Refund request");
    const refundStatus = parseRefundStatus(formData.get("refundStatus"));
    const approvalNote = parseOptionalString(formData.get("approvalNote"));
    const processingNote = parseOptionalString(formData.get("processingNote"));

    const { data: existingRaw, error: existingError } = await supabase
      .from("refund_requests")
      .select("id, status, receipt_ref:receipts(receipt_number)")
      .eq("id", refundRequestId)
      .maybeSingle();

    if (existingError || !existingRaw) {
      throw new Error("Selected refund request was not found.");
    }

    const existingStatus = existingRaw.status as RefundRequestStatus;

    if (workflowAction === "approve_refund" && existingStatus !== "pending_approval") {
      throw new Error("Only pending refund requests can be approved.");
    }

    if (workflowAction === "reject_refund" && existingStatus !== "pending_approval") {
      throw new Error("Only pending refund requests can be rejected.");
    }

    if (workflowAction === "process_refund" && existingStatus !== "approved") {
      throw new Error("Only approved refund requests can be processed.");
    }

    // Processing a refund moves real money: the RPC posts reversal
    // payment_adjustments against the receipt's payments and flips the status to
    // processed, atomically. This is what makes the refund show up in the
    // student ledger, Transactions, and the financial projection.
    if (workflowAction === "process_refund") {
      const { error: processError } = await supabase.rpc("process_refund_with_adjustment", {
        p_refund_request_id: refundRequestId,
      });

      if (processError) {
        throw new Error(processError.message);
      }

      revalidateFinanceSurface();
      return toSuccess(
        `Refund processed for ${(existingRaw as { receipt_ref?: { receipt_number?: string } | null }).receipt_ref?.receipt_number ?? "the receipt"}. A reversal was posted to the student ledger.`,
      );
    }

    const updatePayload: Record<string, unknown> = {
      status: refundStatus,
      approval_note: approvalNote,
      processing_note: processingNote,
    };

    if (workflowAction === "approve_refund") {
      updatePayload.approved_at = new Date().toISOString();
      updatePayload.approved_by = staff.id;
    }

    const { error } = await supabase
      .from("refund_requests")
      .update(updatePayload)
      .eq("id", refundRequestId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateFinanceSurface();

    if (workflowAction === "approve_refund") {
      return toSuccess("Refund request approved.");
    }

    return toSuccess("Refund request rejected.");
  } catch (error) {
    return toActionStateError(error);
  }
}

export async function submitCorrectionReviewAction(
  _previous: FinanceControlsActionState,
  formData: FormData,
): Promise<FinanceControlsActionState> {
  try {
    const workflowAction = parseWorkflowAction(formData.get("workflowAction"));

    if (workflowAction !== "review_adjustment") {
      throw new Error("Unsupported review action.");
    }

    const staff = await requireStaffPermission("finance:approve");
    const paymentAdjustmentId = parseUuid(formData.get("paymentAdjustmentId"), "Correction row");
    const reviewStatus = parseRequiredString(formData.get("reviewStatus"), "Review status");
    const reviewNote = parseOptionalString(formData.get("reviewNote"));

    if (
      reviewStatus !== "reviewed" &&
      reviewStatus !== "flagged" &&
      reviewStatus !== "needs_followup"
    ) {
      throw new Error("Review status is invalid.");
    }

    const supabase = await createClient();
    const { data: existingRaw, error: existingError } = await supabase
      .from("payment_adjustment_reviews")
      .select("payment_adjustment_id")
      .eq("payment_adjustment_id", paymentAdjustmentId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existingRaw) {
      throw new Error("This correction has already been reviewed.");
    }

    const { error } = await supabase.from("payment_adjustment_reviews").insert({
      payment_adjustment_id: paymentAdjustmentId,
      review_status: reviewStatus,
      review_note: reviewNote,
      created_by: staff.id,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidateFinanceSurface();
    return toSuccess("Correction review recorded.");
  } catch (error) {
    return toActionStateError(error);
  }
}

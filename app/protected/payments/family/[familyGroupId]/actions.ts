"use server";

import { familyPaymentsEnabled } from "@/lib/config/feature-flags";
import { parseAcademicSessionLabel } from "@/lib/config/fee-rules";
import type { PaymentMode } from "@/lib/db/types";
import {
  validateFamilyAllocationSum,
} from "@/lib/payments/family-allocation";
import type { FamilyPaymentActionState } from "@/lib/payments/types";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/supabase/session";
import { revalidateSessionFinance } from "@/lib/system-sync/finance-sync";
import { buildSyncedOfficeSyncOutcome } from "@/lib/system-sync/office-sync";
import { publishOfficeSyncEvent } from "@/lib/system-sync/office-sync-events";

type FamilyPaymentRpcRow = {
  family_payment_id: string;
  receipt_ids: string[];
};

function parseRequiredString(value: FormDataEntryValue | null, fieldLabel: string) {
  const normalized = (value ?? "").toString().trim();

  if (!normalized) {
    throw new Error(`${fieldLabel} is required.`);
  }

  return normalized;
}

function parseUuid(value: FormDataEntryValue | null, fieldLabel: string) {
  const normalized = parseRequiredString(value, fieldLabel);
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

  if (!uuidPattern.test(normalized)) {
    throw new Error(`${fieldLabel} is invalid.`);
  }

  return normalized;
}

function parseWholeNumber(value: FormDataEntryValue | null, fieldLabel: string) {
  const numeric = Number((value ?? "").toString().trim());

  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`${fieldLabel} must be a whole number.`);
  }

  return numeric;
}

function parsePositiveWholeNumber(value: FormDataEntryValue | null, fieldLabel: string) {
  const numeric = parseWholeNumber(value, fieldLabel);

  if (numeric <= 0) {
    throw new Error(`${fieldLabel} must be greater than 0.`);
  }

  return numeric;
}

function parsePaymentDate(value: FormDataEntryValue | null) {
  const normalized = parseRequiredString(value, "Payment date");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("Payment date is invalid.");
  }

  return normalized;
}

function toActionError(error: unknown): FamilyPaymentActionState {
  return {
    status: "error",
    message: error instanceof Error ? error.message : "Unable to post family payment.",
    familyPaymentId: null,
    receiptIds: [],
    receiptNumbers: [],
    clientRequestId: null,
  };
}

export async function submitFamilyPaymentAction(
  _previous: FamilyPaymentActionState,
  formData: FormData,
): Promise<FamilyPaymentActionState> {
  try {
    if (!familyPaymentsEnabled) {
      throw new Error("Family payments are not enabled yet.");
    }

    await requireStaffPermission("payments:write");

    const familyGroupId = parseUuid(formData.get("familyGroupId"), "Family");
    const sessionLabel = parseAcademicSessionLabel(
      parseRequiredString(formData.get("sessionLabel"), "Academic session"),
    ).normalizedLabel;
    const paymentDate = parsePaymentDate(formData.get("paymentDate"));
    const paymentMode = parseRequiredString(formData.get("paymentMode"), "Payment mode") as PaymentMode;
    const totalAmount = parsePositiveWholeNumber(formData.get("totalAmount"), "Family payment amount");
    const clientRequestId = parseUuid(formData.get("clientRequestId"), "Family payment attempt");
    const referenceNumber = (formData.get("referenceNumber") ?? "").toString().trim() || null;
    const receivedBy = parseRequiredString(formData.get("receivedBy"), "Received by");
    const notes = (formData.get("notes") ?? "").toString().trim() || null;
    const studentIds = formData.getAll("studentId").map((value) => parseUuid(value, "Student"));
    const amounts = formData.getAll("amount").map((value, index) =>
      parsePositiveWholeNumber(value, `Allocation ${index + 1}`),
    );

    if (studentIds.length === 0 || studentIds.length !== amounts.length) {
      throw new Error("Family allocation rows are incomplete.");
    }

    const allocations = studentIds.map((studentId, index) => ({
      student_id: studentId,
      amount: amounts[index],
      discount: 0,
      late_fee_waiver: 0,
    }));
    const validation = validateFamilyAllocationSum(
      allocations.map((allocation) => ({ allocatedAmount: allocation.amount })),
      totalAmount,
    );

    if (!validation.valid) {
      throw new Error("Family allocation total must match payment total exactly.");
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("post_family_payment", {
      p_family_group_id: familyGroupId,
      p_session_label: sessionLabel,
      p_payment_date: paymentDate,
      p_payment_mode: paymentMode,
      p_reference_number: referenceNumber,
      p_received_by: receivedBy,
      p_notes: notes,
      p_total_amount: totalAmount,
      p_allocations: allocations,
      p_client_request_id: clientRequestId,
      p_receipt_prefix: "SVP",
    });

    if (error) {
      throw new Error(error.message);
    }

    const row = Array.isArray(data)
      ? ((data[0] ?? null) as FamilyPaymentRpcRow | null)
      : (data as FamilyPaymentRpcRow | null);

    if (!row?.family_payment_id || row.receipt_ids.length === 0) {
      throw new Error("Family payment saved, but receipt details are missing.");
    }

    const { data: receiptRows } = await supabase
      .from("receipts")
      .select("id, receipt_number")
      .in("id", row.receipt_ids);
    const receiptNumbers = row.receipt_ids.map((receiptId) => {
      const receipt = (receiptRows ?? []).find((item) => item.id === receiptId);

      return receipt?.receipt_number ?? receiptId;
    });

    revalidateSessionFinance(sessionLabel, studentIds);
    const syncOutcome = buildSyncedOfficeSyncOutcome({
      sessionLabel,
      affectedStudentIds: studentIds,
    });
    await publishOfficeSyncEvent({
      sessionLabel,
      entityType: "payment",
      entityId: row.family_payment_id,
      action: "posted",
      affectedStudentIds: studentIds,
      metadata: {
        receiptIds: row.receipt_ids,
        status: syncOutcome.status,
      },
    });

    return {
      status: "success",
      message: `${row.receipt_ids.length} family receipts created.`,
      familyPaymentId: row.family_payment_id,
      receiptIds: row.receipt_ids,
      receiptNumbers,
      clientRequestId,
    };
  } catch (error) {
    return toActionError(error);
  }
}

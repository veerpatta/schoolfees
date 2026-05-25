"use server";

import { redirect } from "next/navigation";

import {
  postFamilyPayment,
  type FamilyPaymentMode,
} from "@/lib/family-payments/data";

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

const VALID_MODES = new Set<FamilyPaymentMode>(["cash", "upi", "bank_transfer", "cheque"]);

export async function postFamilyPaymentAction(formData: FormData) {
  const familyGroupId = asString(formData.get("familyGroupId"));
  const paymentDate = asString(formData.get("paymentDate"));
  const paymentMode = asString(formData.get("paymentMode")) as FamilyPaymentMode;
  const referenceNumber = asString(formData.get("referenceNumber")) || null;
  const receivedBy = asString(formData.get("receivedBy")) || null;
  const notes = asString(formData.get("notes")) || null;
  const totalAmount = Number.parseInt(asString(formData.get("totalAmount")), 10);

  const studentIds = formData.getAll("studentId").map((value) => value.toString().trim());
  const amounts = formData.getAll("studentAmount").map((value) => Number.parseInt(value.toString(), 10) || 0);

  if (!familyGroupId) {
    redirect(`/protected/students/families?error=${encodeURIComponent("Family group is required.")}`);
  }
  if (!VALID_MODES.has(paymentMode)) {
    redirect(
      `/protected/students/family/${familyGroupId}/pay?error=${encodeURIComponent("Choose a valid payment mode.")}`,
    );
  }
  if (!paymentDate) {
    redirect(
      `/protected/students/family/${familyGroupId}/pay?error=${encodeURIComponent("Payment date is required.")}`,
    );
  }
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    redirect(
      `/protected/students/family/${familyGroupId}/pay?error=${encodeURIComponent("Enter a payment amount greater than 0.")}`,
    );
  }
  if (studentIds.length !== amounts.length || studentIds.length === 0) {
    redirect(
      `/protected/students/family/${familyGroupId}/pay?error=${encodeURIComponent("Allocation rows are missing.")}`,
    );
  }

  const allocations = studentIds
    .map((studentId, index) => ({
      studentId,
      amount: amounts[index] ?? 0,
    }))
    .filter((entry) => entry.studentId && entry.amount > 0);

  if (allocations.length === 0) {
    redirect(
      `/protected/students/family/${familyGroupId}/pay?error=${encodeURIComponent("At least one student must receive a non-zero amount.")}`,
    );
  }

  try {
    const result = await postFamilyPayment({
      familyGroupId,
      paymentDate,
      paymentMode,
      referenceNumber,
      receivedBy,
      notes,
      totalAmount,
      allocations,
    });
    const firstReceipt = result.receiptIds[0];
    if (firstReceipt) {
      redirect(
        `/protected/students/family/${familyGroupId}/receipts?print=1&backTo=${encodeURIComponent(`/protected/students/family/${familyGroupId}/pay`)}`,
      );
    }
    redirect(
      `/protected/students/family/${familyGroupId}/pay?notice=${encodeURIComponent("Family payment posted.")}`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Family payment failed.";
    redirect(
      `/protected/students/family/${familyGroupId}/pay?error=${encodeURIComponent(message)}`,
    );
  }
}

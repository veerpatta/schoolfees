"use server";

import { revalidatePath } from "next/cache";

import { previewLedgerGeneration, generateSessionLedgersAction as doGenerate } from "@/lib/fees/generator";
import { requireStaffPermission } from "@/lib/supabase/session";

export async function previewGenerationAction() {
  await requireStaffPermission("fees:write");
  return previewLedgerGeneration();
}

export async function submitGenerationAction() {
  await requireStaffPermission("fees:write");
  
  try {
    const result = await doGenerate();
    revalidatePath("/protected");
    revalidatePath("/protected/ledger");
    revalidatePath("/protected/fee-setup");
    revalidatePath("/protected/fee-setup/generate");
    revalidatePath("/protected/payments");
    revalidatePath("/protected/collections");
    revalidatePath("/protected/defaulters");
    revalidatePath("/protected/reports");
    revalidatePath("/protected/settings");
    return {
      success: true,
      message: `Inserted ${result.installmentsToInsert}, updated ${result.installmentsToUpdate}, cancelled ${result.installmentsToCancel}, and left ${result.lockedInstallments} locked installments untouched.`,
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to generate ledgers." };
  }
}

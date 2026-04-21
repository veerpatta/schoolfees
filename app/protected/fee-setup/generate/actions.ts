"use server";

import { revalidatePath } from "next/cache";

import { previewLedgerGeneration, generateSessionLedgersAction as doGenerate } from "@/lib/fees/generator";
import { requireStaffPermission } from "@/lib/supabase/session";

export async function previewGenerationAction() {
  await requireStaffPermission("fees:write");
  return await previewLedgerGeneration();
}

export async function submitGenerationAction() {
  await requireStaffPermission("fees:write");
  
  try {
    const result = await doGenerate();
    revalidatePath("/protected/ledger");
    revalidatePath("/protected/fee-setup");
    revalidatePath("/protected/dashboard");
    return { success: true, message: `Successfully generated ${result.count} new installments.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to generate ledgers." };
  }
}

"use server";

import { redirect } from "next/navigation";

import { generateSessionLedgersAction } from "@/lib/fees/generator";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/supabase/session";
import { revalidateSessionFinance } from "@/lib/system-sync/finance-sync";

function sessionHealthUrl(params: Record<string, string | number>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });

  return `/protected/admin-tools/session-health?${searchParams.toString()}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function reconcileSessionAction(formData: FormData) {
  const staff = await requireStaffPermission("fees:write");
  const label = String(formData.get("sessionLabel") ?? "").trim();

  if (!label) {
    throw new Error("Choose a session to reconcile.");
  }

  const supabase = await createClient();
  const { data: logRow, error: insertError } = await supabase
    .from("session_reconcile_log")
    .insert({
      session_label: label,
      run_by: staff.id ?? null,
    })
    .select("id")
    .single();

  if (insertError || !logRow?.id) {
    throw new Error(insertError?.message ?? "Unable to start reconcile log.");
  }

  let preparedCount = 0;

  try {
    const result = await generateSessionLedgersAction({
      scopedSessionLabel: label,
      useAdminClient: true,
    });
    preparedCount = result.installmentsToInsert;
    const attentionCount = result.skippedStudents.length + result.errors.length;
    const { error: updateError } = await supabase
      .from("session_reconcile_log")
      .update({
        finished_at: new Date().toISOString(),
        prepared_count: result.installmentsToInsert,
        updated_count: result.installmentsToUpdate,
        locked_count: result.lockedInstallments,
        attention_count: attentionCount,
      })
      .eq("id", logRow.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    revalidateSessionFinance(label);
  } catch (error) {
    const message = getErrorMessage(error);

    await supabase
      .from("session_reconcile_log")
      .update({
        finished_at: new Date().toISOString(),
        error_message: message.slice(0, 500),
      })
      .eq("id", logRow.id);

    redirect(
      sessionHealthUrl({
        error: message,
        session: label,
      }),
    );
  }

  redirect(
    sessionHealthUrl({
      reconciled: label,
      prepared: preparedCount,
    }),
  );
}

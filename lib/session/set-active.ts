import "server-only";

import { parseAcademicSessionLabel } from "@/lib/config/fee-rules";
import { createClient } from "@/lib/supabase/server";

export async function setActiveSessionLabel(label: string) {
  const normalizedLabel = parseAcademicSessionLabel(label).normalizedLabel;
  const supabase = await createClient();
  const updatedAt = new Date().toISOString();

  const { error: settingsError } = await supabase
    .from("app_settings")
    .upsert({
      key: "active_session_label",
      value: normalizedLabel,
      updated_at: updatedAt,
    });

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  const { error: deactivatePoliciesError } = await supabase
    .from("fee_policy_configs")
    .update({ is_active: false })
    .neq("academic_session_label", normalizedLabel);

  if (deactivatePoliciesError) {
    throw new Error(deactivatePoliciesError.message);
  }

  const { error: activatePolicyError } = await supabase
    .from("fee_policy_configs")
    .update({ is_active: true })
    .eq("academic_session_label", normalizedLabel);

  if (activatePolicyError) {
    throw new Error(activatePolicyError.message);
  }

  const { error: clearSessionsError } = await supabase
    .from("academic_sessions")
    .update({ is_current: false })
    .neq("session_label", normalizedLabel);

  if (clearSessionsError) {
    throw new Error(clearSessionsError.message);
  }

  const { error: markSessionError } = await supabase
    .from("academic_sessions")
    .update({ is_current: true })
    .eq("session_label", normalizedLabel);

  if (markSessionError) {
    throw new Error(markSessionError.message);
  }
}

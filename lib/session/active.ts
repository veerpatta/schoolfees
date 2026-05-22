import "server-only";

import { getCacheSafeClient } from "@/lib/supabase/cache-safe";

export async function getActiveSessionLabel(): Promise<string> {
  const supabase = await getCacheSafeClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "active_session_label")
    .maybeSingle();

  if (data?.value) {
    return data.value;
  }

  const { data: policy } = await supabase
    .from("fee_policy_configs")
    .select("academic_session_label")
    .eq("is_active", true)
    .maybeSingle();

  return policy?.academic_session_label ?? "";
}

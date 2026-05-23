import "server-only";

import { cacheSafeUnstableCache, getCacheSafeClient } from "@/lib/supabase/cache-safe";

async function fetchActiveSessionLabel(): Promise<string> {
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

export const getActiveSessionLabel = cacheSafeUnstableCache(
  fetchActiveSessionLabel,
  ["active-session-label"],
  { tags: ["app-settings"], revalidate: 60 },
);

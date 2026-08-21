import "server-only";

import { revalidateTag } from "next/cache";
import { parseAcademicSessionLabel } from "@/platform/config/fee-rules";
import { clearSessionSwitcherCache } from "@/platform/session/switcher";
import { createClient } from "@/platform/supabase/server";

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

  revalidateTag("app-settings", "max");

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

  // revalidateTag above only invalidates the Next cache. The switcher also
  // keeps a five-minute, module-scoped copy of activeSessionLabel and the
  // is_current flags, which that tag cannot reach — without this the switcher
  // would keep showing the previous session as "live" for up to five minutes
  // on every instance that had already served it.
  clearSessionSwitcherCache();
}

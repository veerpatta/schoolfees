"use server";

import { revalidatePath } from "next/cache";

import { parseAcademicSessionLabel } from "@/lib/config/fee-rules";
import {
  mergeRequiredOfficeSessions,
  type AvailableSessionRow,
} from "@/lib/session/available-sessions";
import { getActiveSessionLabel } from "@/lib/session/active";
import { setViewSessionCookie } from "@/lib/session/cookie";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedStaff } from "@/lib/supabase/session";

export async function listAvailableSessionsAction(): Promise<AvailableSessionRow[]> {
  await requireAuthenticatedStaff();

  const supabase = await createClient();
  const activeSessionLabel = await getActiveSessionLabel();
  const { data, error } = await supabase
    .from("academic_sessions")
    .select("id, session_label, status")
    .order("session_label", { ascending: false });

  if (error) {
    throw new Error(`Unable to load academic sessions: ${error.message}`);
  }

  return mergeRequiredOfficeSessions(
    (data ?? []) as Omit<AvailableSessionRow, "is_current">[],
    activeSessionLabel,
  );
}

export async function setViewSessionAction(label: string) {
  await requireAuthenticatedStaff();
  const sessionLabel = parseAcademicSessionLabel(label).normalizedLabel;

  await setViewSessionCookie(sessionLabel);
  revalidatePath("/protected");

  return { success: true, sessionLabel };
}

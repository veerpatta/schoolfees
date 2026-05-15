"use server";

import { revalidatePath } from "next/cache";

import { parseAcademicSessionLabel } from "@/lib/config/fee-rules";
import { setViewSessionCookie } from "@/lib/session/cookie";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedStaff } from "@/lib/supabase/session";

export type AvailableSessionRow = {
  id: string;
  session_label: string;
  status: string;
  is_current: boolean;
};

export async function listAvailableSessionsAction(): Promise<AvailableSessionRow[]> {
  await requireAuthenticatedStaff();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("academic_sessions")
    .select("id, session_label, status, is_current")
    .order("is_current", { ascending: false })
    .order("session_label", { ascending: false });

  if (error) {
    throw new Error(`Unable to load academic sessions: ${error.message}`);
  }

  return ((data ?? []) as AvailableSessionRow[]).filter((row) => {
    try {
      parseAcademicSessionLabel(row.session_label);
      return true;
    } catch {
      return false;
    }
  });
}

export async function setViewSessionAction(label: string) {
  await requireAuthenticatedStaff();
  const sessionLabel = parseAcademicSessionLabel(label).normalizedLabel;

  await setViewSessionCookie(sessionLabel);
  revalidatePath("/protected");

  return { success: true, sessionLabel };
}

"use server";

import { revalidatePath } from "next/cache";

import { parseAcademicSessionLabel } from "@/lib/config/fee-rules";
import type { AvailableSessionRow } from "@/lib/session/available-sessions";
import { setViewSessionCookie } from "@/lib/session/cookie";
import { getSessionSwitcherData } from "@/lib/session/switcher";
import { requireAuthenticatedStaff } from "@/lib/supabase/session";

export async function listAvailableSessionsAction(): Promise<AvailableSessionRow[]> {
  await requireAuthenticatedStaff();

  return (await getSessionSwitcherData()).availableSessions;
}

export async function setViewSessionAction(label: string) {
  await requireAuthenticatedStaff();
  const sessionLabel = parseAcademicSessionLabel(label).normalizedLabel;

  await setViewSessionCookie(sessionLabel);
  revalidatePath("/protected");

  const { availableSessions } = await getSessionSwitcherData();

  return {
    success: true,
    sessionLabel,
    availableSessions,
  };
}

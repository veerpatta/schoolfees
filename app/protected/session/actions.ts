"use server";

import { revalidateTag } from "next/cache";

import { parseAcademicSessionLabel } from "@/lib/config/fee-rules";
import type { AvailableSessionRow } from "@/lib/session/available-sessions";
import { getViewSessionCookie, setViewSessionCookie } from "@/lib/session/cookie";
import { getSessionSwitcherData } from "@/lib/session/switcher";
import { requireAuthenticatedStaff } from "@/lib/supabase/session";

export async function listAvailableSessionsAction(): Promise<AvailableSessionRow[]> {
  await requireAuthenticatedStaff();

  return (await getSessionSwitcherData()).availableSessions;
}

export async function setViewSessionAction(label: string) {
  await requireAuthenticatedStaff();
  const sessionLabel = parseAcademicSessionLabel(label).normalizedLabel;
  const previousLabel = await getViewSessionCookie();

  await setViewSessionCookie(sessionLabel);

  // Keep session switches scoped to the sessions involved. A full protected
  // path bust makes every office page cold at once after router.refresh().
  if (previousLabel && previousLabel !== sessionLabel) {
    revalidateTag(`session:${previousLabel}`, "max");
  }
  revalidateTag(`session:${sessionLabel}`, "max");

  const { availableSessions } = await getSessionSwitcherData();

  return {
    success: true,
    sessionLabel,
    availableSessions,
  };
}

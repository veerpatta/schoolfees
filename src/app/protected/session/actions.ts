"use server";

import { revalidateTag } from "next/cache";

import { parseAcademicSessionLabel } from "@/platform/config/fee-rules";
import type { AvailableSessionRow } from "@/platform/session/available-sessions";
import { setViewSessionCookie } from "@/platform/session/cookie";
import { getSessionSwitcherData } from "@/platform/session/switcher";
import { requireAuthenticatedStaff } from "@/platform/supabase/session";

export async function listAvailableSessionsAction(): Promise<AvailableSessionRow[]> {
  await requireAuthenticatedStaff();

  return (await getSessionSwitcherData()).availableSessions;
}

export async function setViewSessionAction(label: string) {
  await requireAuthenticatedStaff();
  const sessionLabel = parseAcademicSessionLabel(label).normalizedLabel;

  await setViewSessionCookie(sessionLabel);

  // Keep session switches scoped to the session being switched TO. A full
  // protected path bust makes every office page cold at once.
  //
  // The session being left used to be busted here as well. Nothing about its
  // data changed by walking away from it, and throwing its cache away made
  // switching back cost exactly as much as switching away — the round trip a
  // clerk comparing two years makes constantly.
  revalidateTag(`session:${sessionLabel}`, "max");

  // getSessionSwitcherData() is deliberately NOT awaited here. It only
  // refreshes dropdown rows the client already holds as `initialSessions`, and
  // on a cold instance it is two sequential 1,200ms Promise.race timeouts —
  // up to ~2.4s of the clerk's wait, spent after the cookie is already
  // written. The pill refreshes its own list via listAvailableSessionsAction.
  return {
    success: true,
    sessionLabel,
  };
}

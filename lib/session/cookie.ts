import "server-only";

import { cookies } from "next/headers";

import { parseAcademicSessionLabel } from "@/lib/config/fee-rules";

export const VIEW_SESSION_COOKIE_NAME = "vpps_view_session";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

type CookieStore = Awaited<ReturnType<typeof cookies>>;

async function getCookieStore(cookieStore?: CookieStore) {
  return cookieStore ?? (await cookies());
}

export async function getViewSessionCookie(cookieStore?: CookieStore) {
  const store = await getCookieStore(cookieStore);
  return store.get(VIEW_SESSION_COOKIE_NAME)?.value ?? null;
}

export async function setViewSessionCookie(
  sessionLabel: string,
  cookieStore?: CookieStore,
) {
  const normalizedLabel = parseAcademicSessionLabel(sessionLabel).normalizedLabel;
  const store = await getCookieStore(cookieStore);

  store.set(VIEW_SESSION_COOKIE_NAME, normalizedLabel, {
    httpOnly: false,
    maxAge: THIRTY_DAYS_SECONDS,
    path: "/",
    sameSite: "lax",
  });
}

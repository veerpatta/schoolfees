import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getRequiredEnvVar, hasRequiredEnvVars } from "@/platform/env";
import { resolveStaffRole, type StaffRole } from "@/platform/auth/roles";

/**
 * Where `/protected` sends each role — a deliberate second copy of
 * `getDefaultProtectedHref()`.
 *
 * Not imported, because `lib/config/navigation.ts` pulls in the whole
 * lucide-react icon set and this file runs on every single request. The copy is
 * pinned to the original by `tests/unit/protected-root-redirect.test.ts`, so a
 * drift is a two-second unit failure rather than a role quietly landing on the
 * wrong screen.
 */
const DEFAULT_LANDING: Record<StaffRole, string> = {
  admin: "/protected/dashboard",
  accountant: "/protected/payments",
  teacher: "/protected/students",
  fee_collector: "/protected/defaulters",
  view_only: "/protected/dashboard",
};

type StaffClaims = {
  app_metadata?: { staff_role?: unknown };
};

/**
 * The role as the JWT carries it, or null.
 *
 * `app_metadata.staff_role` is a mirror of `public.users.role`, which stays
 * authoritative — this is only choosing which screen to open. If the two ever
 * disagree the destination page's own guard still decides what the staff member
 * may see, so the worst case is landing somewhere and being redirected on, not
 * seeing something they should not.
 */
function staffRoleFromClaims(claims: unknown): StaffRole | null {
  const raw = (claims as StaffClaims | undefined)?.app_metadata?.staff_role;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return resolveStaffRole(raw);
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });
  const pathname = request.nextUrl.pathname;
  const isProtectedPath =
    pathname === "/protected" || pathname.startsWith("/protected/");

  if (!hasRequiredEnvVars) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Use getClaims() instead of getUser() so the JWT is verified locally when
  // asymmetric signing keys are configured (no round trip to the Supabase
  // auth server on every navigation). Falls back to getUser() internally if
  // only the legacy symmetric secret is set, so this is safe either way. The
  // cookie-refresh machinery (the setAll callback above) still runs, keeping
  // auth cookies fresh for SSR. The page-level requireAuthenticatedStaff()
  // still calls getUser() (cached via React.cache) once per request where a
  // verified user is actually needed.
  const { data: claimsData } = await supabase.auth.getClaims();
  const hasUser = Boolean(claimsData?.claims?.sub);

  if (isProtectedPath && !hasUser) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(url);
  }

  /**
   * Send `/protected` on from here rather than from the page.
   *
   * `app/protected/page.tsx` calls `redirect(getDefaultProtectedHref(role))`,
   * but the app is `force-dynamic` and streams: by the time the page resolves,
   * the root layout has already flushed, so Next answers **200 with the shell**
   * and carries the redirect in the RSC payload. The client Router then swaps
   * trees mid-hydration, which is where "Rendered more hooks than during the
   * previous render" came from — 19 events over two weeks, all on `/protected`
   * (Sentry SCHOOLFEES-8).
   *
   * Doing it here makes it a real 307 before anything renders: no shell, no
   * hydration, no hook-order change, and the staff member sees their own
   * landing screen immediately instead of a flash of empty chrome.
   *
   * Three things keep this safe:
   *  - it fires only on the exact path, never on `/protected/...`;
   *  - an unknown or missing claim falls through to the page, which still does
   *    its own authoritative lookup — so this can only ever be a shortcut;
   *  - the target is asserted to differ from `/protected`, because a redirect
   *    that loops back on itself is hard safety rule 4.
   */
  if (pathname === "/protected") {
    const role = staffRoleFromClaims(claimsData?.claims);
    const target = role ? DEFAULT_LANDING[role] : null;

    if (target && target !== "/protected") {
      const url = request.nextUrl.clone();
      url.pathname = target;
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

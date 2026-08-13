import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getRequiredEnvVar, hasRequiredEnvVars } from "@/lib/env";

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

  return supabaseResponse;
}

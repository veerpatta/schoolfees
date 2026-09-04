import { updateSession } from "@/platform/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // Keep Supabase auth cookies fresh for SSR and protected routes.
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - the offline shell: service-worker.js, offline.html, the static
     *   manifest and everything under /branding. The installed app fetches
     *   these on every launch, and none of them needs a session; running the
     *   auth refresh for them put an edge getClaims() in front of the worker
     *   script itself.
     * - static file extensions: images, styles, scripts, fonts, source maps
     *
     * /api/manifest is deliberately still matched: it is role-aware, so it
     * needs the cookie refresh this proxy performs.
     */
    "/((?!_next/static|_next/image|favicon.ico|service-worker.js|offline.html|manifest.webmanifest|branding/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|map)$).*)",
  ],
};

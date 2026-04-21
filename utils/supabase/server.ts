import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getRequiredEnvVar } from "@/lib/env";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

export async function createClient(cookieStore?: CookieStore) {
  const resolvedCookieStore = cookieStore ?? (await cookies());

  return createServerClient(
    getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll() {
          return resolvedCookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              resolvedCookieStore.set(name, value, options),
            );
          } catch {
            // Server Components can't persist cookie updates directly.
          }
        },
      },
    },
  );
}

import { createBrowserClient } from "@supabase/ssr";
import { getRequiredEnvVar } from "@/lib/env";

export function createClient() {
  return createBrowserClient(
    getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  );
}

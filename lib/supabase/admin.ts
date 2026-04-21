import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getOptionalEnvVar, getRequiredEnvVar } from "@/lib/env";

export function createAdminClient() {
  const serviceRoleKey = getOptionalEnvVar("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceRoleKey) {
    throw new Error(
      "Missing environment variable: SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createSupabaseClient(
    getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

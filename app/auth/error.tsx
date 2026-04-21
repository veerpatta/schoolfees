"use client";

import { RouteErrorState } from "@/components/admin/route-error-state";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      title="The authentication screen failed to load"
      description="This usually means the environment values or Supabase auth configuration are incomplete for this deployment. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
      errorDigest={error.digest}
      reset={reset}
      homeHref="/auth/login"
      homeLabel="Back to sign in"
    />
  );
}

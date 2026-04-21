"use client";

import { RouteErrorState } from "@/components/admin/route-error-state";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      title="The authentication screen failed to load"
      description="This usually means the environment values or Supabase auth configuration are incomplete for this deployment."
      reset={reset}
      homeHref="/auth/login"
      homeLabel="Back to sign in"
    />
  );
}

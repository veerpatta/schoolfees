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
      title="Sign-in is temporarily unavailable"
      description="Please contact the school admin."
      errorDigest={error.digest}
      reset={reset}
      homeHref="/auth/login"
      homeLabel="Back to sign in"
    />
  );
}

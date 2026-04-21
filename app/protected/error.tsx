"use client";

import { RouteErrorState } from "@/components/admin/route-error-state";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isPermissionError =
    error.message?.startsWith("You do not have permission") ||
    error.message?.startsWith("You do not have any required permissions");

  const title = isPermissionError
    ? "Access not permitted"
    : "The protected workspace hit an error";

  const description = isPermissionError
    ? "Your current staff role does not include permission for this section. Contact an admin if you believe this is wrong."
    : "A data load or environment dependency failed before the page could render. Try again, or contact an admin if the problem persists.";

  return (
    <RouteErrorState
      title={title}
      description={description}
      errorDigest={error.digest}
      reset={reset}
      homeHref="/protected"
      homeLabel="Back to dashboard"
    />
  );
}

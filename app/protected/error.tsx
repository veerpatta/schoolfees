"use client";

import { RouteErrorState } from "@/components/admin/route-error-state";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isPermissionError = error.message?.includes("permission");
  const description = isPermissionError
    ? error.message
    : "The request reached a signed-in route, but a data load or environment dependency failed before the page could render completely.";

  return (
    <RouteErrorState
      title={isPermissionError ? "Permission Denied" : "The protected workspace hit an error"}
      description={description}
      reset={reset}
      homeHref="/protected"
      homeLabel="Back to dashboard"
    />
  );
}

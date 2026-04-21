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
      title="The protected workspace hit an error"
      description="The request reached a signed-in route, but a data load or environment dependency failed before the page could render completely."
      reset={reset}
      homeHref="/protected"
      homeLabel="Back to dashboard"
    />
  );
}

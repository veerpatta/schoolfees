"use client";

import { RouteErrorState } from "@/components/admin/route-error-state";

export default function ActivityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const showTechnical = process.env.NODE_ENV !== "production";
  const description = `The activity feed could not load. The audit log is read-only and does not affect any other workflow.${
    showTechnical ? ` Error: ${error.message}.` : ""
  }`;

  return (
    <RouteErrorState
      title="Activity feed hit an error"
      description={description}
      errorDigest={error.digest}
      reset={reset}
      homeHref="/protected/admin-tools"
      homeLabel="Back to Admin Tools"
    />
  );
}

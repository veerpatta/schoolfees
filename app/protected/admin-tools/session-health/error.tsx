"use client";

import { RouteErrorState } from "@/components/admin/route-error-state";

export default function SessionHealthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const showTechnical = process.env.NODE_ENV !== "production";
  const description = `Session Health could not finish loading. The reconcile log and health checks both need the database to respond.${
    showTechnical ? ` Error: ${error.message}.` : ""
  }`;

  return (
    <RouteErrorState
      title="Session Health hit an error"
      description={description}
      errorDigest={error.digest}
      reset={reset}
      homeHref="/protected/admin-tools"
      homeLabel="Back to Admin Tools"
    />
  );
}

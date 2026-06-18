"use client";

import { RouteErrorState } from "@/components/admin/route-error-state";

export default function RecoveryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const showTechnical = process.env.NODE_ENV !== "production";
  const description = `The recovery queue could not load.${
    showTechnical ? ` Error: ${error.message}.` : ""
  }`;

  return (
    <RouteErrorState
      title="Recovery queue hit an error"
      description={description}
      errorDigest={error.digest}
      reset={reset}
      homeHref="/protected/admin-tools"
      homeLabel="Back to Admin Tools"
    />
  );
}

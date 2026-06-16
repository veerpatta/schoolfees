"use client";

import { RouteErrorState } from "@/components/admin/route-error-state";

export default function PrevYearDuesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const showTechnical = process.env.NODE_ENV !== "production";
  const description = `Previous-year dues could not load.${
    showTechnical ? ` Error: ${error.message}.` : ""
  }`;

  return (
    <RouteErrorState
      title="Previous-year dues hit an error"
      description={description}
      errorDigest={error.digest}
      reset={reset}
      homeHref="/protected/admin-tools"
      homeLabel="Back to Admin Tools"
    />
  );
}

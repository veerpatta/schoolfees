"use client";

import { RouteErrorState } from "@/components/admin/route-error-state";

export default function PromotionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const showTechnical = process.env.NODE_ENV !== "production";
  const description = `Class Promotion could not load. No promotion changes are applied until you explicitly confirm a preview.${
    showTechnical ? ` Error: ${error.message}.` : ""
  }`;

  return (
    <RouteErrorState
      title="Promotion hit an error"
      description={description}
      errorDigest={error.digest}
      reset={reset}
      homeHref="/protected/admin-tools"
      homeLabel="Back to Admin Tools"
    />
  );
}

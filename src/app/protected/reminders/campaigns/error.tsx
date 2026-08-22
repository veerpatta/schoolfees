"use client";

import { RouteErrorState } from "@/ui/shell/route-error-state";

export default function ReminderSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const showTechnical = process.env.NODE_ENV !== "production";
  const description = `Saved campaigns could not load. Nothing has been sent and no campaign has changed.${showTechnical ? ` Error: ${error.message}.` : ""}`;

  return (
    <RouteErrorState
      title="Campaigns hit an error"
      description={description}
      errorDigest={error.digest}
      reset={reset}
      homeHref="/protected/reminders"
      homeLabel="Back to Reminders"
    />
  );
}

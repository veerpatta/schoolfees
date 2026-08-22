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
  const description = `The run record could not be read. The messages it sent are unaffected.${showTechnical ? ` Error: ${error.message}.` : ""}`;

  return (
    <RouteErrorState
      title="That run could not load"
      description={description}
      errorDigest={error.digest}
      reset={reset}
      homeHref="/protected/reminders"
      homeLabel="Back to Reminders"
    />
  );
}

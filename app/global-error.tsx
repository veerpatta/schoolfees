// Goes at: app/global-error.tsx
// Catches React render errors at the App Router root and reports them.
"use client";

import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    // Imported here rather than at module scope. A static import of the Sentry
    // SDK in the root error boundary pins the whole browser SDK into the shared
    // chunk that every route loads, to report an error that almost never
    // happens. By the time this component renders we can afford to fetch it.
    void import("@sentry/nextjs")
      .then((Sentry) => {
        Sentry.captureException(error);
      })
      .catch(() => {
        // The app has already crashed; a failed reporter must not crash it again.
      });
  }, [error]);

  return (
    <html>
      <body>
        {/* NextError is Next.js's default error page. The App Router does not
            expose a status code here, so we pass 0 for a generic message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}

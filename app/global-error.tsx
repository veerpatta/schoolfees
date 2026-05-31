// Goes at: app/global-error.tsx
// Catches React render errors at the App Router root and reports them.
"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
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

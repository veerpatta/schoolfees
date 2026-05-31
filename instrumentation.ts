// Goes at REPO ROOT: instrumentation.ts
// Next.js instrumentation hook — loads the right Sentry config per runtime
// and forwards server/edge request errors to Sentry.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown in Server Components, route handlers, proxy.ts, etc.
export const onRequestError = Sentry.captureRequestError;

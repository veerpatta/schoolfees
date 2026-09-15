// Next.js instrumentation hook — loads the right Sentry config per runtime,
// forwards server/edge request errors to Sentry, and refuses to start at all
// if this process is pointed at the live school database when it should not be.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Before Sentry, before anything: if the database target is wrong, the
    // right outcome is a deployment that visibly does not boot. A preview
    // reading production looks identical to one that is not, until somebody
    // acts on what they see. Node runtime only — the Edge runtime never holds
    // the service-role key and instrumentation there cannot stop a request.
    const { assertSafeDatabaseTarget } = await import("./platform/db-target");
    assertSafeDatabaseTarget();

    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown in Server Components, route handlers, proxy.ts, etc.
export const onRequestError = Sentry.captureRequestError;

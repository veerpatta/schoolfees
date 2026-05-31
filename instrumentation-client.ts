// Goes at REPO ROOT: instrumentation-client.ts
// Client-side (browser) Sentry initialization. Runs in the user's browser.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Environment label in Sentry (production / preview / development).
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",

  // This is an internal admin tool handling student financial data.
  // Do NOT attach IPs / request headers automatically.
  sendDefaultPii: false,

  // Low-traffic internal app: full tracing is fine. Dial down if volume grows.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.5,

  integrations: [
    // Session Replay, with aggressive masking so student/financial data
    // is never captured in replays.
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],

  // Record replay for 10% of normal sessions, 100% of sessions with an error.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Structured logs -> Sentry.
  enableLogs: true,
});

// Instruments client-side router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

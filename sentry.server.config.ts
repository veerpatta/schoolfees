// Goes at REPO ROOT: sentry.server.config.ts
// Server-side (Node.js runtime) Sentry initialization.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: process.env.VERCEL_ENV ?? "development",

  // Internal admin tool with student financial data — keep PII off.
  sendDefaultPii: false,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.5,

  enableLogs: true,
});

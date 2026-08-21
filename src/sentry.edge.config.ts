// Goes at REPO ROOT: sentry.edge.config.ts
// Edge runtime Sentry initialization (middleware/proxy.ts and edge routes).
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: process.env.VERCEL_ENV ?? "development",

  sendDefaultPii: false,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.5,

  enableLogs: true,
});

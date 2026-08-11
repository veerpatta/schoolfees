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

  // Session Replay is NOT listed here on purpose — see the lazy load below.
  integrations: [],

  // Record replay for 10% of normal sessions, 100% of sessions with an error.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Structured logs -> Sentry.
  enableLogs: true,
});

/**
 * Load the replay recorder after the page is interactive, not with it.
 *
 * `Sentry.replayIntegration()` in the `integrations` array is a static import,
 * so the rrweb recorder landed in `rootMainFiles` — 37.2 KB gzip that every
 * route paid on first load, for a feature that records 10% of sessions. It was
 * the single largest avoidable item in a 254 KB shared bundle.
 *
 * `lazyLoadIntegration` fetches the same recorder from the Sentry CDN and adds
 * it to the running client, so replay still starts within the first moments of
 * a session and the sampling rates above still decide whether anything is kept.
 * The masking options are unchanged: this app shows student names and family
 * finances, so text, inputs and media stay masked and blocked.
 *
 * Deferred to `load` and wrapped in a catch because replay is diagnostics. If
 * the CDN is blocked on the school's network the app must carry on — errors and
 * tracing come from the core bundle and are unaffected.
 */
function loadReplayWhenIdle() {
  Sentry.lazyLoadIntegration("replayIntegration")
    .then((replayIntegration) => {
      Sentry.getClient()?.addIntegration(
        replayIntegration({
          maskAllText: true,
          maskAllInputs: true,
          blockAllMedia: true,
        }),
      );
    })
    .catch(() => {
      // Replay unavailable (offline, CDN blocked, CSP). Not worth surfacing.
    });
}

if (typeof window !== "undefined") {
  if (document.readyState === "complete") {
    loadReplayWhenIdle();
  } else {
    window.addEventListener("load", loadReplayWhenIdle, { once: true });
  }
}

// Instruments client-side router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

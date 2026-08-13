// Goes at REPO ROOT: instrumentation-client.ts
// Client-side (browser) Sentry initialization. Runs in the user's browser.

/**
 * Sentry is loaded AFTER the page is interactive, not with it.
 *
 * `import * as Sentry from "@sentry/nextjs"` at the top of this file put the
 * whole browser SDK — core, tracing and logs — into `rootMainFiles`, the chunk
 * every route loads before it can render. Measured on the deployed build that
 * was 151.6 KB gzip of a 217.5 KB shared bundle, 494 KB unpacked, paid on the
 * login screen as much as on the Payment Desk.
 *
 * Deferring it costs one thing: the pageload transaction. Tracing now starts a
 * moment into the session rather than at the first byte, so `tracesSampleRate`
 * samples navigations and interactions but no longer the initial load. Error
 * reporting is unaffected — the buffer below catches anything thrown before the
 * SDK arrives and replays it once the SDK is running, so a crash during first
 * paint still reaches Sentry with its stack intact.
 */

type BufferedEvent =
  | { kind: "error"; value: unknown }
  | { kind: "transition"; args: unknown[] };

const buffered: BufferedEvent[] = [];
const MAX_BUFFERED = 20;

let sentryPromise: Promise<typeof import("@sentry/nextjs")> | null = null;

function buffer(event: BufferedEvent) {
  // A crash loop must not turn into an unbounded array.
  if (buffered.length < MAX_BUFFERED) {
    buffered.push(event);
  }
}

function loadSentry() {
  sentryPromise ??= import("@sentry/nextjs").then((Sentry) => {
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

    for (const event of buffered.splice(0, buffered.length)) {
      if (event.kind === "error") {
        Sentry.captureException(event.value);
      } else {
        (
          Sentry.captureRouterTransitionStart as unknown as (
            ...args: unknown[]
          ) => void
        )(...event.args);
      }
    }

    loadReplayWhenIdle(Sentry);
    return Sentry;
  });

  return sentryPromise;
}

/**
 * Load the replay recorder after the page is interactive, not with it.
 *
 * `Sentry.replayIntegration()` in the `integrations` array is a static import,
 * so the rrweb recorder landed in `rootMainFiles` — 37.2 KB gzip that every
 * route paid on first load, for a feature that records 10% of sessions.
 *
 * `lazyLoadIntegration` fetches the same recorder from the Sentry CDN and adds
 * it to the running client, so replay still starts within the first moments of
 * a session and the sampling rates above still decide whether anything is kept.
 * The masking options are unchanged: this app shows student names and family
 * finances, so text, inputs and media stay masked and blocked.
 *
 * Wrapped in a catch because replay is diagnostics. If the CDN is blocked on
 * the school's network the app must carry on.
 */
function loadReplayWhenIdle(Sentry: typeof import("@sentry/nextjs")) {
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
  // Installed synchronously so the window between first paint and the SDK
  // landing is covered. Without this, deferring the SDK would quietly drop
  // exactly the errors that matter most — the ones that fire during boot.
  window.addEventListener("error", (event) => {
    if (!sentryPromise) {
      buffer({ kind: "error", value: event.error ?? event.message });
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (!sentryPromise) {
      buffer({ kind: "error", value: event.reason });
    }
  });

  const start = () => {
    const idle = window.requestIdleCallback;
    if (typeof idle === "function") {
      idle(() => void loadSentry(), { timeout: 3000 });
    } else {
      window.setTimeout(() => void loadSentry(), 1000);
    }
  };

  if (document.readyState === "complete") {
    start();
  } else {
    window.addEventListener("load", start, { once: true });
  }
}

/**
 * Instruments client-side router navigations for tracing.
 *
 * Next.js imports this by name at module scope, so it has to exist before the
 * SDK does. Transitions that happen during that window are buffered and
 * replayed rather than dropped.
 */
export function onRouterTransitionStart(...args: unknown[]) {
  if (!sentryPromise) {
    buffer({ kind: "transition", args });
    return;
  }

  void sentryPromise.then((Sentry) => {
    (
      Sentry.captureRouterTransitionStart as unknown as (
        ...args: unknown[]
      ) => void
    )(...args);
  });
}

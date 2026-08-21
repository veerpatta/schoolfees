"use client";

import { useEffect } from "react";

/**
 * Drains office metrics into Sentry.
 *
 * `recordOfficeMetric` has always dispatched a `vpps:office-metric` window
 * event and a `performance.mark`, and nothing listened — so the budgets in
 * quality/office-quality-budgets.json (payment search latency, student
 * selection → fee summary, post failure rate) were unanswerable in production.
 * Sentry is already installed and configured; this is the missing listener.
 *
 * Deliberately conservative:
 * - breadcrumbs, not events — a metric is context for a later error, not an
 *   alert of its own, and breadcrumbs do not consume error quota.
 * - failures and slow outcomes are sampled UP; routine successes are sampled
 *   DOWN, because this is a handful of counter phones, not a consumer app.
 * - never throws: telemetry must not be able to break a payment flow.
 */

/** Outcomes worth keeping every time. */
const ALWAYS_KEEP_OUTCOMES = new Set(["error", "cancelled"]);
/** Routine successes are noisy; keep a slice for trend, drop the rest. */
const SUCCESS_SAMPLE_RATE = 0.1;
/** Anything slower than this is interesting regardless of outcome. */
const SLOW_MS = 1500;

type OfficeMetricDetail = {
  area?: string;
  name?: string;
  outcome?: string;
  surface?: string;
  durationMs?: number;
  sessionKind?: string;
  metadata?: Record<string, unknown>;
};

export function TelemetrySentrySink() {
  useEffect(() => {
    let cancelled = false;
    let capture: ((detail: OfficeMetricDetail) => void) | null = null;

    const onMetric = (event: Event) => {
      const detail = (event as CustomEvent<OfficeMetricDetail>).detail;
      if (!detail || !capture) return;

      const isSlow = (detail.durationMs ?? 0) >= SLOW_MS;
      const keep =
        ALWAYS_KEEP_OUTCOMES.has(detail.outcome ?? "") ||
        isSlow ||
        Math.random() < SUCCESS_SAMPLE_RATE;
      if (!keep) return;

      capture(detail);
    };

    // Sentry is a sizeable client module; import it only once a metric surface
    // is actually mounted, and keep the listener alive in the meantime.
    void import("@sentry/nextjs")
      .then((Sentry) => {
        if (cancelled) return;
        capture = (detail) => {
          try {
            if (typeof detail.durationMs === "number" && detail.name) {
              Sentry.setMeasurement(`office.${detail.name}`, detail.durationMs, "millisecond");
            }
            Sentry.addBreadcrumb({
              category: "office-metric",
              type: "info",
              level: detail.outcome === "error" ? "warning" : "info",
              message: `${detail.area ?? "app"}:${detail.name ?? "metric"}`,
              data: {
                outcome: detail.outcome ?? "success",
                surface: detail.surface ?? null,
                durationMs: detail.durationMs ?? null,
                sessionKind: detail.sessionKind ?? null,
                ...(detail.metadata ?? {}),
              },
            });
          } catch {
            // Telemetry is never allowed to surface an error to the user.
          }
        };
      })
      .catch(() => {
        // Sentry unavailable (blocked, offline) — metrics simply stay local.
      });

    window.addEventListener("vpps:office-metric", onMetric);
    return () => {
      cancelled = true;
      window.removeEventListener("vpps:office-metric", onMetric);
    };
  }, []);

  return null;
}

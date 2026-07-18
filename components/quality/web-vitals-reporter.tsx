"use client";

import { useReportWebVitals } from "next/web-vitals";

const trackedVitals = new Set(["LCP", "INP", "CLS"]);

function getSafeRouteSurface() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  return segments[0] === "protected" ? segments[1] ?? "landing" : segments[0] ?? "root";
}

function getSessionKind() {
  return new URLSearchParams(window.location.search).get("session")?.startsWith("TEST-")
    ? "test"
    : "live";
}

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (!trackedVitals.has(metric.name)) return;

    void import("@sentry/nextjs").then((Sentry) => {
      Sentry.metrics.distribution(`web_vital.${metric.name.toLowerCase()}`, metric.value, {
        unit: metric.name === "CLS" ? "none" : "millisecond",
        attributes: {
          rating: metric.rating,
          route_surface: getSafeRouteSurface(),
          session_kind: getSessionKind(),
        },
      });
    });
  });

  return null;
}

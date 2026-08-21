"use client";

import dynamic from "next/dynamic";

const OfficeMetricReporter = dynamic(
  () => import("@/ui/telemetry/office-metric-reporter").then((mod) => mod.OfficeMetricReporter),
  { ssr: false },
);
const WebVitalsReporter = dynamic(
  () => import("@/ui/telemetry/web-vitals-reporter").then((mod) => mod.WebVitalsReporter),
  { ssr: false },
);
const TelemetrySentrySink = dynamic(
  () => import("@/ui/telemetry/telemetry-sentry-sink").then((mod) => mod.TelemetrySentrySink),
  { ssr: false },
);

export function QualityReporterLoader() {
  return (
    <>
      <OfficeMetricReporter />
      <WebVitalsReporter />
      {/* Without this, every metric the reporters emit is dispatched to a
          window event that nothing listens to. */}
      <TelemetrySentrySink />
    </>
  );
}

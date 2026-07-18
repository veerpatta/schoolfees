"use client";

import dynamic from "next/dynamic";

const OfficeMetricReporter = dynamic(
  () => import("@/components/quality/office-metric-reporter").then((mod) => mod.OfficeMetricReporter),
  { ssr: false },
);
const WebVitalsReporter = dynamic(
  () => import("@/components/quality/web-vitals-reporter").then((mod) => mod.WebVitalsReporter),
  { ssr: false },
);

export function QualityReporterLoader() {
  return (
    <>
      <OfficeMetricReporter />
      <WebVitalsReporter />
    </>
  );
}

"use client";

import { useEffect } from "react";

import type { OfficeMetricEvent } from "@/lib/quality/office-telemetry";

const DEFAULT_SAMPLE_RATE = 0.25;

function shouldSend(event: OfficeMetricEvent) {
  return event.outcome === "error" || Math.random() < DEFAULT_SAMPLE_RATE;
}

export function OfficeMetricReporter() {
  useEffect(() => {
    const report = async (rawEvent: Event) => {
      const event = (rawEvent as CustomEvent<OfficeMetricEvent>).detail;
      if (!event || !shouldSend(event)) return;
      const Sentry = await import("@sentry/nextjs");

      const attributes = {
        area: event.area,
        outcome: event.outcome ?? "success",
        session_kind: event.sessionKind,
        surface: event.surface,
      };

      Sentry.metrics.count(`office.${event.name}`, 1, { attributes });
      if (event.durationMs !== undefined) {
        Sentry.metrics.distribution(`office.${event.name}.duration`, event.durationMs, {
          unit: "millisecond",
          attributes,
        });
      }
    };

    window.addEventListener("vpps:office-metric", report);
    return () => window.removeEventListener("vpps:office-metric", report);
  }, []);

  return null;
}

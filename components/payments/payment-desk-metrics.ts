import {
  getOfficeMetricSessionKind,
  recordOfficeMetric,
  type OfficeMetricOutcome,
} from "@/lib/quality/office-telemetry";

export function markPaymentDeskStudentTiming(
  name: "student_click" | "summary_fetch_start" | "summary_fetch_end" | "summary_paint",
) {
  if (typeof performance === "undefined" || !performance.mark) return;
  performance.mark(`vpps:payment-desk:${name}`);
}

export function recordPaymentPostResult(input: {
  sessionLabel: string;
  outcome: OfficeMetricOutcome;
  surface: "payment-post" | "duplicate-protection";
  startedAt: number | null;
}) {
  recordOfficeMetric({
    area: "payment-desk",
    name: "payment_post_confirmed",
    durationMs: input.startedAt === null ? undefined : performance.now() - input.startedAt,
    outcome: input.outcome,
    surface: input.surface,
    sessionKind: getOfficeMetricSessionKind(input.sessionLabel),
  });
}

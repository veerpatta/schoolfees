export const officeMetricEventNames = [
  "offline_shell_ready",
  "payment_search_started",
  "payment_search_completed",
  "student_selected",
  "payment_post_attempted",
  "payment_post_confirmed",
  "fee_summary_ready",
  "students_filter_completed",
  "route_ready",
  "office_error_review_needed",
  "report_generated",
] as const;

export type OfficeMetricEventName = (typeof officeMetricEventNames)[number];

export type OfficeMetricArea =
  | "app-shell"
  | "payment-desk"
  | "students"
  | "dashboard"
  | "fee-setup"
  | "transactions"
  | "defaulters"
  | "exports"
  | "reports"
  | "admin-tools";

export type OfficeMetricOutcome = "success" | "error" | "cancelled";
export type OfficeMetricSessionKind = "test" | "live";

type OfficeMetricMetadataValue = string | number | boolean | null;
export type OfficeMetricMetadata = Record<string, OfficeMetricMetadataValue>;

export type OfficeMetricInput = {
  area: OfficeMetricArea;
  name: OfficeMetricEventName;
  metadata?: OfficeMetricMetadata;
  durationMs?: number;
  outcome?: OfficeMetricOutcome;
  surface?: string;
  sessionKind: OfficeMetricSessionKind;
  now?: number;
};

export type OfficeMetricEvent = {
  area: OfficeMetricArea;
  name: OfficeMetricEventName;
  metadata: OfficeMetricMetadata;
  durationMs?: number;
  outcome?: OfficeMetricOutcome;
  surface: string;
  sessionKind: OfficeMetricSessionKind;
  timestamp: string;
};

export type OfficeSupportState = "retry" | "review" | "complete";

const blockedMetadataKeyPattern =
  /(student|name|admission|receipt|phone|email|mobile|address|father|mother|amount|balance|fee|money|session)/i;

export function isSafeOfficeMetricMetadata(metadata: OfficeMetricMetadata) {
  return Object.keys(metadata).every((key) => !blockedMetadataKeyPattern.test(key));
}

export function getOfficeMetricSessionKind(session: string | null | undefined): OfficeMetricSessionKind {
  return session?.startsWith("TEST-") || session?.startsWith("UAT-") || session?.startsWith("DEMO-")
    ? "test"
    : "live";
}

export function buildOfficeMetricEvent(input: OfficeMetricInput): OfficeMetricEvent {
  const metadata = input.metadata ?? {};

  if (!isSafeOfficeMetricMetadata(metadata)) {
    throw new Error("Office telemetry metadata must not include identifiers, session labels, or money values.");
  }

  if (input.durationMs !== undefined && (!Number.isFinite(input.durationMs) || input.durationMs < 0)) {
    throw new Error("Office telemetry duration must be a non-negative finite number.");
  }

  const surface = input.surface ?? input.area;
  if (!/^[a-z0-9-]+$/.test(surface)) {
    throw new Error("Office telemetry surface must be a fixed, non-identifying slug.");
  }

  return {
    area: input.area,
    name: input.name,
    metadata,
    ...(input.durationMs === undefined ? {} : { durationMs: Math.round(input.durationMs) }),
    ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
    surface,
    sessionKind: input.sessionKind,
    timestamp: new Date(input.now ?? Date.now()).toISOString(),
  };
}

export function getOfficeSupportStateCopy(state: OfficeSupportState) {
  switch (state) {
    case "retry":
      return "You can safely try again after checking the connection.";
    case "review":
      return "This needs staff review before normal work continues.";
    case "complete":
      return "The action was saved by the school server.";
    default:
      state satisfies never;
      return "";
  }
}

export function recordOfficeMetric(input: OfficeMetricInput) {
  const event = buildOfficeMetricEvent(input);

  if (typeof window === "undefined") {
    return event;
  }

  window.dispatchEvent(new CustomEvent("vpps:office-metric", { detail: event }));

  if (window.performance?.mark) {
    window.performance.mark(`vpps:${event.area}:${event.name}`);
  }

  return event;
}

export const officeMetricEventNames = [
  "offline_shell_ready",
  "payment_search_started",
  "student_selected",
  "payment_post_attempted",
  "payment_post_confirmed",
  "office_error_review_needed",
  "report_generated",
] as const;

export type OfficeMetricEventName = (typeof officeMetricEventNames)[number];

export type OfficeMetricArea =
  | "app-shell"
  | "payment-desk"
  | "students"
  | "reports"
  | "admin-tools";

type OfficeMetricMetadataValue = string | number | boolean | null;
export type OfficeMetricMetadata = Record<string, OfficeMetricMetadataValue>;

export type OfficeMetricInput = {
  area: OfficeMetricArea;
  name: OfficeMetricEventName;
  metadata?: OfficeMetricMetadata;
  now?: number;
};

export type OfficeMetricEvent = {
  area: OfficeMetricArea;
  name: OfficeMetricEventName;
  metadata: OfficeMetricMetadata;
  timestamp: string;
};

export type OfficeSupportState = "retry" | "review" | "complete";

const blockedMetadataKeyPattern =
  /(student|name|admission|receipt|phone|email|mobile|address|father|mother)/i;

export function isSafeOfficeMetricMetadata(metadata: OfficeMetricMetadata) {
  return Object.keys(metadata).every((key) => !blockedMetadataKeyPattern.test(key));
}

export function buildOfficeMetricEvent(input: OfficeMetricInput): OfficeMetricEvent {
  const metadata = input.metadata ?? {};

  if (!isSafeOfficeMetricMetadata(metadata)) {
    throw new Error("Office telemetry metadata must not include student or receipt identifiers.");
  }

  return {
    area: input.area,
    name: input.name,
    metadata,
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

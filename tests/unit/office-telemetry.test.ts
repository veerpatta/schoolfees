import {
  buildOfficeMetricEvent,
  getOfficeSupportStateCopy,
  getOfficeMetricSessionKind,
  isSafeOfficeMetricMetadata,
  officeMetricEventNames,
} from "@/lib/quality/office-telemetry";
import { describe, expect, it } from "vitest";

describe("office telemetry contract", () => {
  it("keeps metric names focused on office workflow quality", () => {
    expect(officeMetricEventNames).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it("rejects metadata keys that could carry student or receipt identifiers", () => {
    expect(isSafeOfficeMetricMetadata({ resultCount: 5, cached: true })).toBe(true);
    expect(isSafeOfficeMetricMetadata({ sessionLabel: "TEST-2026-27" })).toBe(false);
    expect(isSafeOfficeMetricMetadata({ studentName: "Test Student" })).toBe(false);
    expect(isSafeOfficeMetricMetadata({ admissionNo: "123" })).toBe(false);
    expect(isSafeOfficeMetricMetadata({ receiptNumber: "SVP-1" })).toBe(false);
    expect(isSafeOfficeMetricMetadata({ amountPaise: 500 })).toBe(false);
  });

  it("builds timestamped events without hidden PII fields", () => {
    const event = buildOfficeMetricEvent({
      area: "payment-desk",
      name: "student_selected",
      metadata: { resultCount: 1 },
      durationMs: 499.6,
      outcome: "success",
      surface: "student-search",
      sessionKind: "test",
      now: 1_800_000_000_000,
    });

    expect(event).toMatchObject({
      area: "payment-desk",
      name: "student_selected",
      metadata: { resultCount: 1 },
      durationMs: 500,
      outcome: "success",
      surface: "student-search",
      sessionKind: "test",
      timestamp: "2027-01-15T08:00:00.000Z",
    });
  });

  it("rejects invalid durations", () => {
    expect(() =>
      buildOfficeMetricEvent({
        area: "students",
        name: "students_filter_completed",
        durationMs: -1,
        sessionKind: "test",
      }),
    ).toThrow(/duration/i);
  });

  it("classifies non-live sessions without retaining the session label", () => {
    expect(getOfficeMetricSessionKind("TEST-2026-27")).toBe("test");
    expect(getOfficeMetricSessionKind("UAT-2026-27")).toBe("test");
    expect(getOfficeMetricSessionKind("2026-27")).toBe("live");
  });

  it("defines clear staff support states for retry, review, and complete outcomes", () => {
    expect(getOfficeSupportStateCopy("retry")).toContain("try again");
    expect(getOfficeSupportStateCopy("review")).toContain("staff review");
    expect(getOfficeSupportStateCopy("complete")).toContain("saved");
  });
});

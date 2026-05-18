import {
  buildOfficeMetricEvent,
  getOfficeSupportStateCopy,
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
        "student_selected",
        "payment_post_attempted",
        "payment_post_confirmed",
        "office_error_review_needed",
        "report_generated",
      ]),
    );
  });

  it("rejects metadata keys that could carry student or receipt identifiers", () => {
    expect(isSafeOfficeMetricMetadata({ sessionLabel: "TEST-2026-27", resultCount: 5 })).toBe(
      true,
    );
    expect(isSafeOfficeMetricMetadata({ studentName: "Test Student" })).toBe(false);
    expect(isSafeOfficeMetricMetadata({ admissionNo: "123" })).toBe(false);
    expect(isSafeOfficeMetricMetadata({ receiptNumber: "SVP-1" })).toBe(false);
  });

  it("builds timestamped events without hidden PII fields", () => {
    const event = buildOfficeMetricEvent({
      area: "payment-desk",
      name: "student_selected",
      metadata: { sessionLabel: "TEST-2026-27", resultCount: 1 },
      now: 1_800_000_000_000,
    });

    expect(event).toMatchObject({
      area: "payment-desk",
      name: "student_selected",
      metadata: { sessionLabel: "TEST-2026-27", resultCount: 1 },
      timestamp: "2027-01-15T08:00:00.000Z",
    });
  });

  it("defines clear staff support states for retry, review, and complete outcomes", () => {
    expect(getOfficeSupportStateCopy("retry")).toContain("try again");
    expect(getOfficeSupportStateCopy("review")).toContain("staff review");
    expect(getOfficeSupportStateCopy("complete")).toContain("saved");
  });
});

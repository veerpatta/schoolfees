import { describe, expect, it } from "vitest";

import {
  matchDeliveryReport,
  parseDeliveryReport,
  phoneDigits,
  readDeliveryStatus,
  splitCsvLine,
  STATUS_RANK,
  type SendRowForMatching,
} from "@/modules/whatsapp/domain/delivery-report";

/**
 * Reading AiSensy's campaign report.
 *
 * `submitted_message_id` is an acceptance receipt, not proof a phone lit up. The
 * Basic plan has no webhooks, so this CSV is the only source of truth about
 * delivery — and everything it feeds is shown to the office as evidence that
 * reminders do or do not work.
 */

function send(overrides: Partial<SendRowForMatching> = {}): SendRowForMatching {
  return {
    id: "s1",
    providerMessageId: "msg-1",
    destinationDigits: "9352205884",
    sentOn: "2026-09-03",
    status: "sent",
    currentDeliveryStatus: null,
    ...overrides,
  };
}

describe("readDeliveryStatus", () => {
  it.each([
    ["Delivered", "delivered"],
    ["DELIVERY_SUCCESS", "delivered"],
    ["read", "read"],
    ["Seen", "read"],
    ["Failed", "failed"],
    ["Undelivered", "failed"],
    ["rejected", "failed"],
    ["Submitted", "submitted"],
    ["sent", "submitted"],
    ["queued", "submitted"],
    // "undelivered" CONTAINS "delivered". Checked in the obvious order, every
    // undelivered message imports as delivered and the office reads a run as
    // having worked when it did not.
    ["UNDELIVERED", "failed"],
    ["delivery failed", "failed"],
  ])("reads %s as %s", (input, expected) => {
    expect(readDeliveryStatus(input)).toBe(expected);
  });

  it("prefers the most progressed word when a cell carries two", () => {
    // "sent, read" means it was read. Matching `sent` first would throw away the
    // only fact worth importing.
    expect(readDeliveryStatus("sent / read")).toBe("read");
  });

  it("returns null rather than guessing", () => {
    for (const value of ["", null, undefined, "  ", "unknown-state"]) {
      expect(readDeliveryStatus(value)).toBeNull();
    }
  });
});

describe("phoneDigits", () => {
  it.each([
    ["+91 93522 05884", "9352205884"],
    ["919352205884", "9352205884"],
    ["9352205884", "9352205884"],
    ["+919352205884", "9352205884"],
  ])("reduces %s to %s", (input, expected) => {
    // The country code is not always in the file even when it is on the row we
    // stored, so the last ten digits are the only reliable key.
    expect(phoneDigits(input)).toBe(expected);
  });

  it("refuses anything too short to be a number", () => {
    expect(phoneDigits("12345")).toBeNull();
    expect(phoneDigits("")).toBeNull();
  });
});

describe("splitCsvLine", () => {
  it("honours quoted commas", () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
  });

  it("honours a doubled quote inside a quoted cell", () => {
    expect(splitCsvLine('a,"say ""hi""",c')).toEqual(["a", 'say "hi"', "c"]);
  });

  it("keeps empty cells", () => {
    expect(splitCsvLine("a,,c")).toEqual(["a", "", "c"]);
  });
});

describe("parseDeliveryReport", () => {
  const CSV = [
    "Message Id,Destination,Status,Updated At",
    "msg-1,+919352205884,Delivered,2026-09-03T10:15:00Z",
    "msg-2,+919876543210,Read,2026-09-03T11:00:00Z",
    "msg-3,+919111111111,Failed,2026-09-03T10:20:00Z",
  ].join("\n");

  it("reads a well-formed report", () => {
    const parsed = parseDeliveryReport(CSV);
    expect(parsed.error).toBeNull();
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toEqual({
      providerMessageId: "msg-1",
      destinationDigits: "9352205884",
      status: "delivered",
      at: "2026-09-03T10:15:00.000Z",
    });
  });

  it("finds columns by what the heading contains, not by an exact match", () => {
    // AiSensy has renamed these at least once. An exact-header match would turn
    // a whole import into zero rows with no error.
    const renamed = [
      "campaign,msg id,mobile number,delivery state,timestamp",
      "vpps_app_fee_due_hi_v2,msg-9,919352205884,delivered,2026-09-03",
    ].join("\n");
    const parsed = parseDeliveryReport(renamed);
    expect(parsed.error).toBeNull();
    expect(parsed.rows[0]?.providerMessageId).toBe("msg-9");
    expect(parsed.rows[0]?.status).toBe("delivered");
  });

  it("says so when it cannot find the columns at all", () => {
    // Better a sentence the office can act on than a silent import of nothing.
    const parsed = parseDeliveryReport("one,two\nfoo,bar");
    expect(parsed.rows).toEqual([]);
    expect(parsed.error).toContain("Could not find a status column");
  });

  it("counts rows it could not read rather than dropping them silently", () => {
    const messy = [
      "Message Id,Destination,Status",
      "msg-1,+919352205884,Delivered",
      ",,,",
      "msg-2,+919876543210,who-knows",
    ].join("\n");
    const parsed = parseDeliveryReport(messy);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.skipped).toBe(2);
  });

  it("reports an empty file rather than throwing", () => {
    expect(parseDeliveryReport("").error).toContain("no rows");
  });
});

describe("matchDeliveryReport", () => {
  it("matches on the provider id", () => {
    const result = matchDeliveryReport(
      [{ providerMessageId: "msg-1", destinationDigits: null, status: "delivered", at: null }],
      [send()],
    );
    expect(result.updates).toEqual([{ id: "s1", status: "delivered", at: null }]);
    expect(result.unmatched).toBe(0);
  });

  it("NEVER writes a delivery result onto a covered_by_sibling row", () => {
    // THE trap. Siblings on one phone share the id of the single message that
    // went to it, so matching on the id alone would mark a family of three as
    // three delivered messages — on the exact screen the office uses to decide
    // whether reminders are working.
    const family = [
      send({ id: "spokesperson", status: "sent" }),
      send({ id: "sibling-a", status: "covered_by_sibling" }),
      send({ id: "sibling-b", status: "covered_by_sibling" }),
    ];
    const result = matchDeliveryReport(
      [{ providerMessageId: "msg-1", destinationDigits: null, status: "delivered", at: null }],
      family,
    );

    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]!.id).toBe("spokesperson");
  });

  it("never writes onto a failed or pending row either", () => {
    // Only what this app actually sent can have been delivered.
    for (const status of ["failed", "pending"]) {
      const result = matchDeliveryReport(
        [{ providerMessageId: "msg-1", destinationDigits: null, status: "delivered", at: null }],
        [send({ status })],
      );
      expect(result.updates).toEqual([]);
      expect(result.unmatched).toBe(1);
    }
  });

  it("falls back to destination and day when there is no id", () => {
    const result = matchDeliveryReport(
      [
        {
          providerMessageId: null,
          destinationDigits: "9352205884",
          status: "read",
          at: "2026-09-03T10:00:00.000Z",
        },
      ],
      [send()],
    );
    expect(result.updates[0]).toMatchObject({ id: "s1", status: "read" });
  });

  it("refuses the fallback when one phone got two messages that day", () => {
    // Guessing would put a delivery result on the wrong notice, and the office
    // would read it as evidence about a message that was never delivered.
    const result = matchDeliveryReport(
      [
        {
          providerMessageId: null,
          destinationDigits: "9352205884",
          status: "read",
          at: "2026-09-03T10:00:00.000Z",
        },
      ],
      [
        send({ id: "a", providerMessageId: "msg-a" }),
        send({ id: "b", providerMessageId: "msg-b" }),
      ],
    );
    expect(result.updates).toEqual([]);
    expect(result.unmatched).toBe(1);
  });

  it("never moves a status backwards", () => {
    // Reports arrive out of order and get re-uploaded. A "submitted" row must
    // not overwrite a "read" one.
    const result = matchDeliveryReport(
      [{ providerMessageId: "msg-1", destinationDigits: null, status: "submitted", at: null }],
      [send({ currentDeliveryStatus: "read" })],
    );
    expect(result.updates).toEqual([]);
    expect(result.unchanged).toBe(1);
  });

  it("lets a failure overwrite a bare acceptance, but not an arrival", () => {
    expect(STATUS_RANK.failed).toBeGreaterThan(STATUS_RANK.submitted);
    expect(STATUS_RANK.failed).toBeLessThan(STATUS_RANK.delivered);

    const overSubmitted = matchDeliveryReport(
      [{ providerMessageId: "msg-1", destinationDigits: null, status: "failed", at: null }],
      [send({ currentDeliveryStatus: "submitted" })],
    );
    expect(overSubmitted.updates[0]?.status).toBe("failed");

    const overDelivered = matchDeliveryReport(
      [{ providerMessageId: "msg-1", destinationDigits: null, status: "failed", at: null }],
      [send({ currentDeliveryStatus: "delivered" })],
    );
    expect(overDelivered.updates).toEqual([]);
  });

  it("keeps only the most progressed result when one file reports twice", () => {
    const result = matchDeliveryReport(
      [
        { providerMessageId: "msg-1", destinationDigits: null, status: "submitted", at: null },
        { providerMessageId: "msg-1", destinationDigits: null, status: "read", at: null },
        { providerMessageId: "msg-1", destinationDigits: null, status: "delivered", at: null },
      ],
      [send()],
    );
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]!.status).toBe("read");
  });

  it("counts rows that matched nothing we sent", () => {
    const result = matchDeliveryReport(
      [{ providerMessageId: "unknown", destinationDigits: null, status: "read", at: null }],
      [send()],
    );
    expect(result.updates).toEqual([]);
    expect(result.unmatched).toBe(1);
  });
});

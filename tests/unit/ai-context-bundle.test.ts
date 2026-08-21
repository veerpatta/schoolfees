import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { STUDENT_SEGMENTS } from "@/modules/students/domain/student-segments";
import { buildTransportRouteLabel, hasTransport } from "@/modules/fees/domain/label";
import { readExportSurface } from "../helpers/export-surface";

/**
 * The AI context bundle is the one export whose job is to be COMPLETE — it is
 * fed to a model that cannot go and look anything up. A column that is missing
 * is a question the model will answer wrongly rather than decline.
 *
 * These are source-level assertions because the builder is a route handler that
 * needs a live Supabase session. They guard the two things that actually went
 * wrong: a sheet quietly disappearing, and transport being read off the route
 * name instead of the money.
 */

const route = readExportSurface();

const EXPECTED_SHEETS = [
  "_README",
  "_HEALTH",
  "Students",
  "Installments",
  "Payments",
  "Payment Allocations",
  "Adjustments",
  "Refunds",
  "Fee Overrides",
  "Late Fee Waivers",
  "Class Fee Settings",
  "Siblings",
  "Student Segments",
  "Classes",
  "Routes",
  "Discounts",
];

describe("ai context bundle", () => {
  it("ships every sheet the README promises", () => {
    for (const sheet of EXPECTED_SHEETS) {
      // book_append_sheet's name argument, whether the call is wrapped across
      // lines (trailing comma) or written on one (closing paren). Plain
      // string checks rather than a built RegExp: the backslash in \s does not
      // survive a template literal, and the accidental `s*` still passed.
      const appended =
        route.includes(`"${sheet}",`) || route.includes(`"${sheet}")`);
      expect(appended, `sheet "${sheet}" is not appended to the workbook`).toBe(true);
    }
  });

  it("documents each new sheet in the README, not just builds it", () => {
    // A sheet an LLM cannot interpret is close to useless, and the source-role
    // caveat on Late Fee Waivers is the difference between "622 forgiven" and
    // the truth, which is zero.
    for (const sheet of [
      "Fee Overrides",
      "Class Fee Settings",
      "Payment Allocations",
      "Late Fee Waivers",
      "Siblings",
      "Student Segments",
    ]) {
      expect(route, `README has no glossary entry for "${sheet}"`).toContain(`* ${sheet}`);
    }
    expect(route).toContain("READ THE");
    expect(route).toContain("Granted by a person");
  });

  it("checks every read, so an empty sheet cannot pass for an absence", () => {
    // The Adjustments read had been failing in production — payment_adjustments
    // has no foreign key to installments, so the embed was rejected and the
    // whole query errored. Nothing checked `.error`, so the sheet shipped empty
    // and the README reported "Adjustments: 0" while 39 corrections existed for
    // the live session. Every chunked read must now go through checkRead.
    // Collapsed, because prettier wraps these calls at different widths.
    const flat = route.replace(/\s+/g, " ");
    for (const source of [
      "payment_adjustments",
      "refund_requests",
      "student_fee_overrides",
      "student_late_fee_waivers",
      "payments (allocations)",
      "fee_settings",
      "v_student_directory",
      "student_family_members",
      "students (detail)",
    ]) {
      // checkRead, an optional generic, then this exact source as first arg.
      const registered = new RegExp(
        `checkRead\\s*(?:<[^(]*>)?\\s*\\(\\s*"${source.replace(/[()]/g, "\\$&")}"`,
      ).test(flat);
      expect(registered, `read "${source}" is not registered with checkRead`).toBe(true);
    }

    // No raw `.data ?? []` left on a chunked result: that is the shape that
    // turned a failure into an empty array with nothing recorded.
    for (const raw of [
      "adjustmentsResult.data ??",
      "refundsResult.data ??",
      "lateFeeWaiverResult.data ??",
      "allocationResult.data ??",
      "feeSettingResult.data ??",
      "directoryResult.data ??",
      "familyMemberResult.data ??",
      "studentDetailResult.data ??",
    ]) {
      expect(route, `${raw} bypasses checkRead`).not.toContain(raw);
    }
  });

  it("never embeds installments off payment_adjustments", () => {
    // The relationship does not exist. Re-adding it silently empties the sheet.
    expect(route).not.toContain("installment_ref:installments(installment_label)");
    expect(route).toContain("installmentLabelById");
  });

  it("reports incompleteness where a reader cannot miss it", () => {
    expect(route).toContain("THIS SNAPSHOT IS INCOMPLETE");
    expect(route).toContain("UNAVAILABLE (read failed — see _HEALTH)");
    // A count that came from a failed read must not render as a number.
    for (const counted of [
      'countOf("payment_adjustments"',
      'countOf("refund_requests"',
      'countOf("student_fee_overrides"',
      'countOf("payments (allocations)"',
      'countOf("student_late_fee_waivers"',
      'countOf("fee_settings"',
    ]) {
      expect(route, `${counted} is not guarded`).toContain(counted);
    }
  });

  it("says which population each headline count covers", () => {
    // Headcount and money count different students on purpose. The Students
    // line always said so; the Defaulters line did not.
    expect(route).toContain("Students (all statuses)");
    expect(route).toContain("Defaulters (fees pending > 0, all statuses)");
  });

  it("reads transport from the shared helper, never from the route name alone", () => {
    // The bug: a student with custom_transport_fee_amount and no route was
    // charged while the sheet showed nothing. The Students sheet must call the
    // helper and must carry the charged amount as its own column.
    expect(route).toContain("buildTransportRouteLabel({");
    expect(route).toContain('"Transport charged": row.transportFee');
    expect(route).toContain('"Transport is custom amount"');
    // The raw value is kept for comparison, but must not be the only transport
    // column any more.
    expect(route).toContain('"Transport route (raw)"');
    expect(route).not.toMatch(/"Route": row\.transportRouteName/);
  });

  it("warns the reader not to sum transport off the route name", () => {
    expect(route).toContain("ALWAYS sum \"Transport charged\"");
    expect(route).toContain("Is 'no transport' placeholder");
  });

  it("generates segment columns from the shared list so it cannot drift", () => {
    // Hardcoding 24 headers here would rot the first time a segment is added.
    expect(route).toContain("for (const segment of STUDENT_SEGMENTS)");
    expect(route).toContain("segmentHeader(segment.id)");
    expect(route).toContain("facets?.[segment.column]");
  });

  it("carries the money columns a fee question actually needs", () => {
    for (const column of [
      '"Total paid"',
      '"Discount close-out (not cash)"',
      // Renamed by the late-fee split: "Outstanding" still means everything the
      // family owes, and the two lines below it are the fees/late-fee split.
      '"Fees pending"',
      // Two columns carry a pending late fee, from two different reads. They
      // used to be "Late fee pending (student)" and "Late fee pending", which
      // is indistinguishable once the sheet is open — now named by source.
      '"Late fee pending (fee engine)"',
      '"Old balance (carry forward)"',
      '"Overdue amount"',
      '"Late fee pending (student list)"',
      '"Installment 1 pending"',
      '"Has fee override"',
      '"Custom transport amount"',
      '"Other adjustment head"',
    ]) {
      expect(route, `Students sheet is missing ${column}`).toContain(column);
    }
  });
});

describe("the transport rule the bundle depends on", () => {
  const cases = [
    {
      name: "a real route",
      input: { routeName: "Bhilwara Road", routeCode: "BR1", transportFeeAmount: 12000 },
      label: "Bhilwara Road (BR1)",
      onTransport: true,
    },
    {
      name: "no route but a custom amount — the three live students",
      input: { routeName: null, customTransportFeeAmount: 14000 },
      label: "Custom transport (₹14,000)",
      onTransport: true,
    },
    {
      name: "the 'No Transport' placeholder route with an override on top",
      input: { routeName: "No Transport", customTransportFeeAmount: 2500 },
      label: "Custom transport (₹2,500)",
      onTransport: true,
    },
    {
      name: "genuinely no transport",
      input: { routeName: "No Transport", customTransportFeeAmount: null, transportFeeAmount: 0 },
      label: "No transport",
      onTransport: false,
    },
  ];

  it.each(cases)("$name", ({ input, label, onTransport }) => {
    expect(buildTransportRouteLabel(input)).toBe(label);
    expect(hasTransport(input)).toBe(onTransport);
  });
});

describe("segment header generation", () => {
  it("turns every segment id into a readable column heading", () => {
    // Mirrors segmentHeader() in the route: de-camelise, sentence case.
    const header = (id: string) => {
      const spaced = id.replace(/([A-Z])/g, " $1").toLowerCase().trim();
      return spaced.charAt(0).toUpperCase() + spaced.slice(1);
    };

    expect(header("neverPaid")).toBe("Never paid");
    expect(header("oldBalanceDue")).toBe("Old balance due");
    expect(header("yearClear")).toBe("Year clear");
    expect(header("discountStaffChild")).toBe("Discount staff child");

    const headers = STUDENT_SEGMENTS.map((segment) => header(segment.id));
    expect(new Set(headers).size, "two segments collapse to the same heading").toBe(
      headers.length,
    );
    // No heading may collide with the identity columns already on the sheet.
    for (const reserved of ["SR no", "Student", "Class", "Status"]) {
      expect(headers).not.toContain(reserved);
    }
  });
});

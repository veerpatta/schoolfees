import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudentMoneyBand } from "@/components/students/student-money-band";

/**
 * The badge used to sit in the identity strip's due panel. It now sits on the
 * Outstanding figure in the money band, which is the number it actually
 * vouches for — the strip and the panel were deleted in the desktop redesign.
 */
const BASE_PROPS = {
  outstandingAmount: 12000,
  overdueAmount: 0,
  pendingLateFeeAmount: 0,
  creditBalance: 0,
  paidThisSession: 8000,
  discountClosedAmount: 0,
  sessionFeeTotal: 20000,
  installmentsPaid: 1,
  installmentsTotal: 4,
  installmentsPending: 3,
  receiptCount: 2,
  nextDue: { label: "Installment 2", amount: 6000, dueDate: "2026-07-20" },
  lastReceipt: null,
  emiPlan: null,
  encodedReturnTo: "%2Fprotected%2Fstudents",
};

describe("StudentMoneyBand — TrustBadge", () => {
  it("renders a TrustBadge with source 'Workbook v1'", () => {
    const html = renderToStaticMarkup(<StudentMoneyBand {...BASE_PROPS} />);
    expect(html).toContain("Workbook v1");
  });

  it("TrustBadge title attribute references the source", () => {
    const html = renderToStaticMarkup(<StudentMoneyBand {...BASE_PROPS} />);
    expect(html).toContain("Source: Workbook v1");
  });

  it("puts the badge on the outstanding amount it vouches for", () => {
    const html = renderToStaticMarkup(<StudentMoneyBand {...BASE_PROPS} />);
    expect(html).toContain("Workbook v1");
    expect(html).toContain("12,000");
  });

  it("shows exactly one ribbon state at a time", () => {
    // Overdue outranks next-due; both must never render together, or the page
    // says two contradictory things about the same student.
    const html = renderToStaticMarkup(
      <StudentMoneyBand {...BASE_PROPS} overdueAmount={5000} pendingLateFeeAmount={1000} />,
    );

    expect(html).toContain("Overdue");
    expect(html).not.toContain("Next due");
  });

  it("an EMI plan outranks the overdue banner", () => {
    // A plan changes what "overdue" means: those dates were renegotiated.
    const html = renderToStaticMarkup(
      <StudentMoneyBand
        {...BASE_PROPS}
        overdueAmount={5000}
        emiPlan={{ monthlyAmount: 2000, statusLabel: "on track", reviewNeeded: false }}
      />,
    );

    expect(html).toContain("monthly EMI plan");
    expect(html).not.toContain("past its due date");
  });
});

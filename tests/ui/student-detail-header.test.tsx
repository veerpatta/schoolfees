import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudentDetailHeader } from "@/components/students/student-detail-header";

/**
 * Design system §6 rule 1: one saffron CTA per screen. The page shipped two,
 * because `StudentRowCollectButton variant="primary"` hardcodes `bg-accent` and
 * appeared in both the identity strip's action row and its due panel.
 */
const STUDENT = {
  id: "test-student-id",
  fullName: "Arjun Singh",
  admissionNo: "TEST-001",
  classLabel: "Class 10-A",
  status: "active" as const,
  fatherName: "Rajendra Singh",
  fatherPhone: "9876543210",
  motherPhone: null,
};

const BASE_PROPS = {
  student: STUDENT,
  outstandingAmount: 12000,
  prevYearDuesAmount: 0,
  canPostPayments: true,
  canEditStudent: true,
  canPrintReceipts: true,
  latestReceiptId: null,
  returnTo: "/protected/students",
  encodedReturnTo: "%2Fprotected%2Fstudents",
};

describe("StudentDetailHeader", () => {
  it("offers exactly one Collect action, and it names the amount", () => {
    const html = renderToStaticMarkup(<StudentDetailHeader {...BASE_PROPS} />);
    const collects = html.match(/Collect /g) ?? [];

    expect(collects).toHaveLength(1);
    expect(html).toContain("12,000");
  });

  it("puts identity on one line and no money beside it", () => {
    const html = renderToStaticMarkup(<StudentDetailHeader {...BASE_PROPS} />);

    expect(html).toContain("Arjun Singh");
    expect(html).toContain("SR TEST-001");
    expect(html).toContain("Class 10-A");
    // The header carries identifiers; every money figure lives in the band.
    expect(html).not.toContain("Session due");
  });

  it("drops the Collect action for an archived student", () => {
    const html = renderToStaticMarkup(
      <StudentDetailHeader
        {...BASE_PROPS}
        student={{ ...STUDENT, status: "left" as const }}
      />,
    );

    expect(html).not.toContain("Collect ");
  });

  it("drops the Collect action when nothing is owed", () => {
    const html = renderToStaticMarkup(
      <StudentDetailHeader {...BASE_PROPS} outstandingAmount={0} />,
    );

    expect(html).not.toContain("Collect ");
  });

  it("hides Edit from staff without the permission", () => {
    const html = renderToStaticMarkup(
      <StudentDetailHeader {...BASE_PROPS} canEditStudent={false} />,
    );

    expect(html).not.toContain(">Edit<");
    // Statement stays: it is a read of data they can already see.
    expect(html).toContain("Statement");
  });

  it("no longer offers a Ledger button", () => {
    // Removed by owner decision: the student page already carries the dues
    // table, the receipt history and the statement, so the ledger view was a
    // fourth way to read the same rows.
    const html = renderToStaticMarkup(<StudentDetailHeader {...BASE_PROPS} />);
    expect(html).not.toContain(">Ledger<");
    expect(html).not.toContain("/reports/ledger/");
  });
});

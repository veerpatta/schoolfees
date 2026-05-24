import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudentIdentityStrip } from "@/components/students/student-identity-strip";

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
  overdueAmount: 0,
  pendingLateFeeAmount: 0,
  creditBalance: 0,
  nextDueDate: "2026-07-20",
  nextDueLabel: "Installment 2",
  nextDueAmount: 6000,
  todayIso: "2026-05-24",
  canPostPayments: true,
  canEditStudent: true,
  canPrintReceipts: true,
  canViewLedger: true,
  latestReceiptId: null,
  returnTo: "/protected/students",
  encodedReturnTo: "%2Fprotected%2Fstudents",
};

describe("StudentIdentityStrip — TrustBadge", () => {
  it("renders a TrustBadge with source 'Workbook v1' next to the session due amount", () => {
    const html = renderToStaticMarkup(<StudentIdentityStrip {...BASE_PROPS} />);
    expect(html).toContain("Workbook v1");
  });

  it("TrustBadge title attribute references the source", () => {
    const html = renderToStaticMarkup(<StudentIdentityStrip {...BASE_PROPS} />);
    expect(html).toContain("Source: Workbook v1");
  });

  it("renders the outstanding amount alongside the badge", () => {
    const html = renderToStaticMarkup(<StudentIdentityStrip {...BASE_PROPS} />);
    expect(html).toContain("Workbook v1");
    expect(html).toContain("12,000");
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudentListTable } from "@/components/students/student-list-table";
import type { StudentListItem } from "@/lib/students/types";

function student(overrides: Partial<StudentListItem> = {}): StudentListItem {
  return {
    id: "student-1",
    workbookStudentKey: "Class 1|SR001",
    admissionNo: "SR001",
    fullName: "TEST Student One",
    dateOfBirth: null,
    status: "active",
    studentStatusLabel: "Old",
    classLabel: "Class 1",
    transportRouteLabel: "No Transport",
    tuitionFee: 1000,
    transportFee: 0,
    academicFee: 0,
    grossBaseBeforeDiscount: 1000,
    discountAmount: 0,
    baseTotalDue: 1000,
    installment1Base: 250,
    installment2Base: 250,
    installment3Base: 250,
    installment4Base: 250,
    totalPaid: 0,
    lateFeeTotal: 0,
    totalDue: 1000,
    overdueAmount: 0,
    pendingLateFeeAmount: 0,
    hasFeeProfile: true,
    feeProfileStatusLabel: "Standard profile",
    fatherPhone: "8123456789",
    motherPhone: null,
    nextDueLabel: null,
    nextDueDate: null,
    nextDueAmount: null,
    statusLabel: "NOT STARTED",
    duesStatus: "generated",
    duesStatusLabel: "Generated",
    lastPaymentDate: null,
    lastPaymentAmount: 0,
    duplicateSrFlag: false,
    missingDobFlag: false,
    missingClassFlag: false,
    missingStatusFlag: false,
    outstandingAmount: 1000,
    conventionalDiscountLabels: [],
    siblingPill: null,
    updatedAt: "2026-05-21T00:00:00.000Z",
    ...overrides,
  };
}

describe("students sibling pill", () => {
  it("renders a confirmed family pill with a family route link", () => {
    const html = renderToStaticMarkup(
      <StudentListTable
        students={[
          student({
            siblingPill: {
              siblingCount: 2,
              href: "/protected/students/families?group=family-1",
              confidence: "confirmed",
            },
          }),
        ]}
        hasFilters={false}
        canWrite={true}
        returnTo="/protected/students"
        session="TEST-2026-27"
      />,
    );

    expect(html).toContain("+2 sibling");
    expect(html).toContain("/protected/students/families?group=family-1&amp;session=TEST-2026-27");
  });

  it("does not render a sibling pill when the student has no group", () => {
    const html = renderToStaticMarkup(
      <StudentListTable
        students={[student()]}
        hasFilters={false}
        canWrite={true}
        returnTo="/protected/students"
      />,
    );

    expect(html).not.toContain("sibling");
    expect(html).not.toContain("/protected/students/families");
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudentFamilyPanel } from "@/components/students/family-panel";
import type { StudentFamilyMemberDetail } from "@/lib/students/data";

const familyGroupId = "11111111-1111-4111-8111-111111111111";
const selfStudentId = "22222222-2222-4222-8222-222222222222";
const siblingStudentId = "33333333-3333-4333-8333-333333333333";
const sessionLabel = "TEST-2026-27";

function member(overrides: Partial<StudentFamilyMemberDetail>): StudentFamilyMemberDetail {
  return {
    id: "student-1",
    fullName: "TEST Student",
    admissionNo: "SR001",
    classLabel: "Class 1",
    statusLabel: "Active",
    isSelf: false,
    financials: {
      totalDue: 1000,
      totalPaid: 0,
      outstanding: 1000,
      discountCloseouts: 0,
      lateFeeWaiver: 0,
    },
    ...overrides,
  };
}

describe("family flow links", () => {
  it("preserves family statement and sibling links without exposing pay-together collection", () => {
    const html = renderToStaticMarkup(
      <StudentFamilyPanel
        studentId={selfStudentId}
        familyGroupId={familyGroupId}
        confidence="confirmed"
        sessionLabel={sessionLabel}
        members={[
          member({ id: selfStudentId, fullName: "TEST Self", isSelf: true }),
          member({ id: siblingStudentId, fullName: "TEST Sibling" }),
        ]}
      />,
    );

    expect(html).toContain(`/protected/students/family/${familyGroupId}/statement?session=${sessionLabel}`);
    expect(html).toContain(`/protected/students/${siblingStudentId}?session=${sessionLabel}`);
    expect(html).not.toContain(`/protected/payments/family/${familyGroupId}`);
  });

  it("no longer links suspected siblings to the removed Families page", () => {
    const html = renderToStaticMarkup(
      <StudentFamilyPanel
        studentId={selfStudentId}
        familyGroupId={null}
        confidence="suspected"
        sessionLabel={sessionLabel}
        members={[
          member({ id: selfStudentId, fullName: "TEST Self", isSelf: true }),
          member({ id: siblingStudentId, fullName: "TEST Sibling" }),
        ]}
      />,
    );

    // The "Confirm Sibling Group" flow and its Families route are gone; siblings
    // are linked/unlinked directly on the profile instead.
    expect(html).not.toContain("/protected/students/families");
    expect(html).toContain("Suspected Siblings");
  });
});

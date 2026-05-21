import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FamilySuccessSheet } from "@/components/payments/family-success-sheet";
import { StudentFamilyPanel } from "@/components/students/family-panel";
import type { FamilyPaymentActionState } from "@/lib/payments/types";
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
    },
    ...overrides,
  };
}

describe("family flow links", () => {
  it("uses real family routes and preserves the active session from the student family panel", () => {
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

    expect(html).toContain(`/protected/payments/family/${familyGroupId}?session=${sessionLabel}`);
    expect(html).toContain(`/protected/students/family/${familyGroupId}/statement?session=${sessionLabel}`);
    expect(html).toContain(`/protected/students/${siblingStudentId}?session=${sessionLabel}`);
    expect(html).not.toContain("/protected/payments/family?group=");
  });

  it("keeps the session when sending suspected siblings to confirmation", () => {
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

    expect(html).toContain(`/protected/students/families?search=${selfStudentId}&amp;session=${sessionLabel}`);
  });

  it("preserves the active session on the family receipt print link", () => {
    const state: FamilyPaymentActionState = {
      status: "success",
      message: "2 family receipts created.",
      familyPaymentId: "44444444-4444-4444-8444-444444444444",
      receiptIds: ["receipt-1", "receipt-2"],
      receiptNumbers: ["SVP-001", "SVP-002"],
      clientRequestId: "55555555-5555-4555-8555-555555555555",
    };

    const html = renderToStaticMarkup(<FamilySuccessSheet state={state} sessionLabel={sessionLabel} />);

    expect(html).toContain(`/protected/receipts/family/${state.familyPaymentId}?session=${sessionLabel}`);
  });
});

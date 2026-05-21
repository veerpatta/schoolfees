import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";

import { MasterStatementDocument } from "@/components/students/master-statement-document";

type MasterStatementProps = ComponentProps<typeof MasterStatementDocument>;

function buildStatementProps(): MasterStatementProps {
  return {
    student: {
      id: "student-1",
      fullName: "TEST Student",
      admissionNo: "TEST-001",
      classLabel: "Class 12 Science",
      studentStatusLabel: "Existing",
      transportRouteLabel: "No transport",
      fatherName: "Parent",
      fatherPhone: "9999999999",
      motherPhone: "",
      tuitionOverride: null,
      transportOverride: null,
      discountAmount: 0,
      lateFeeWaiverAmount: 0,
      otherAdjustmentHead: null,
      otherAdjustmentAmount: 0,
    },
    financialSnapshot: {
      policy: {
        academicSessionLabel: "TEST-2026-27",
      },
      resolvedBreakdown: {
        coreHeads: [
          { id: "tuition_fee", label: "Tuition fee", amount: 6000 },
          { id: "transport_fee", label: "Transport fee", amount: 0 },
          { id: "academic_fee", label: "Academic fee", amount: 500 },
          { id: "other_adjustment", label: "Other fee / adjustment", amount: 0 },
        ],
        customHeads: [],
        annualTotal: 6500,
        conventionalDiscountApplied: 32000,
        conventionalDiscountLabels: ["3rd Child Policy"],
        tuitionBeforeConventionalDiscount: 38000,
      },
      currentOutstanding: 6500,
      openInstallments: 1,
      overdueInstallments: 0,
      nextDueLabel: "Installment 1",
      nextDueDate: "2026-04-20",
      nextDueAmount: 6500,
      activeOverrideReason: null,
    },
    installmentBalances: [
      {
        installmentId: "installment-1",
        installmentLabel: "Installment 1",
        dueDate: "2026-04-20",
        totalCharge: 6500,
        paidAmount: 0,
        baseCharge: 6500,
        finalLateFee: 0,
        pendingAmount: 6500,
      },
    ],
  } as unknown as MasterStatementProps;
}

describe("student fee breakup display", () => {
  it("shows actual tuition before subtracting conventional discount", () => {
    const html = renderToStaticMarkup(
      <MasterStatementDocument {...buildStatementProps()} />,
    );

    expect(html).toMatch(/Tuition fee<\/td><td[^>]*>₹38,000<\/td>/);
    expect(html).toContain("Conventional Discount (3rd Child Policy)");
    expect(html).toContain("-₹32,000");
    expect(html).toContain("Resolved annual total");
    expect(html).toContain("₹6,500");
  });
});

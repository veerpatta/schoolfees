import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MobileStudentProfile } from "@/components/students/mobile-student-profile";
import { MobileStudentList } from "@/components/students/student-list-table";
import type { StudentListItem } from "@/lib/students/types";

/**
 * The phone Students list and the phone student profile (mobile app v2).
 *
 * The list and action-availability assertions render the real components.
 * The remaining profile assertions stay source-level because their
 * load-bearing CSS details only matter against the live shell.
 */

const messages = JSON.parse(
  readFileSync(join(process.cwd(), "messages", "en.json"), "utf-8"),
);

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/**
 * Source with comments stripped, for the negative assertions. The profile
 * explains in a comment why it does NOT use the bottom-nav offset, and that
 * explanation must not itself trip the check.
 */
function readCode(path: string) {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function renderWithIntl(children: React.ReactElement) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>,
  );
}

function student(overrides: Partial<StudentListItem> = {}): StudentListItem {
  return {
    id: "student-1",
    workbookStudentKey: "Class 6-A|TEST-245",
    admissionNo: "TEST-245",
    fullName: "TEST Rahul Sharma",
    dateOfBirth: null,
    status: "active",
    studentStatusLabel: "Old",
    classLabel: "Class 6-A",
    transportRouteLabel: "No Transport",
    tuitionFee: 42000,
    transportFee: 0,
    academicFee: 0,
    grossBaseBeforeDiscount: 42000,
    discountAmount: 0,
    baseTotalDue: 42000,
    installment1Base: 10500,
    installment2Base: 10500,
    installment3Base: 10500,
    installment4Base: 10500,
    totalPaid: 27500,
    discountClosedAmount: 0,
    lateFeeTotal: 0,
    totalDue: 42000,
    overdueAmount: 0,
    pendingLateFeeAmount: 0,
    hasLateFeeWaiver: false,
    hasFeeProfile: true,
    feeProfileStatusLabel: "Standard profile",
    fatherPhone: "8123456789",
    motherPhone: null,
    nextDueLabel: null,
    nextDueDate: null,
    nextDueAmount: null,
    statusLabel: "PARTLY PAID",
    duesStatus: "generated",
    duesStatusLabel: "Generated",
    lastPaymentDate: null,
    lastPaymentAmount: 0,
    duplicateSrFlag: false,
    missingDobFlag: false,
    missingClassFlag: false,
    missingStatusFlag: false,
    outstandingAmount: 14500,
    conventionalDiscountLabels: [],
    siblingPill: null,
    updatedAt: "2026-07-28T00:00:00.000Z",
    ...overrides,
  };
}

function renderList(students: StudentListItem[]) {
  return renderWithIntl(
    <MobileStudentList
      students={students}
      hasFilters={false}
      canWrite
      canCollectPayments
      returnTo="/protected/students"
      session="TEST-2026-27"
    />,
  );
}

function renderProfile({
  canPostPayments = false,
  canShare = false,
  isActive = false,
}: {
  canPostPayments?: boolean;
  canShare?: boolean;
  isActive?: boolean;
} = {}) {
  return renderWithIntl(
    <MobileStudentProfile
      studentId="student-1"
      studentName="TEST Rahul Sharma"
      classLabel="Class 6-A"
      admissionNo="TEST-245"
      fatherPhone={canShare ? "8123456789" : null}
      motherPhone={null}
      canPostPayments={canPostPayments}
      canShare={canShare}
      isActive={isActive}
      returnTo="/protected/students"
      initialTab="fees"
      familyGroupId={null}
      pendingAmount={14500}
      feesContent={<p>Fees</p>}
      familyContent={<p>Family</p>}
      aboutContent={<p>About</p>}
      familyCount={0}
    />,
  );
}

describe("phone students list", () => {
  it("puts identity, the class · SR line and the amount on one card", () => {
    const html = renderList([student()]);

    expect(html).toContain("TEST Rahul Sharma");
    expect(html).toContain("Class 6-A · SR TEST-245");
    expect(html).toContain("₹14,500");
  });

  it("tones the amount by the real overdue signal, not by size", () => {
    const pending = renderList([student()]);
    const overdue = renderList([student({ overdueAmount: 2000 })]);

    expect(pending).toContain("text-warning");
    expect(overdue).toContain("text-destructive");
  });

  it("says the year is clear instead of showing a zero", () => {
    const html = renderList([student({ outstandingAmount: 0, totalPaid: 42000 })]);

    expect(html).toContain(messages.Students.yearClear);
    // No Collect chip once nothing is owed.
    expect(html).not.toContain("studentId=student-1");
  });

  it("sends Collect to the Payment Desk for that one student", () => {
    const html = renderList([student()]);

    expect(html).toContain("/protected/payments?studentId=student-1");
    // Never a family/pay-together route — one receipt, one student.
    expect(html).not.toContain("/protected/payments/family");
  });

  it("keeps the sibling pill, which is the only family affordance on the list", () => {
    const html = renderList([
      student({
        siblingPill: { siblingCount: 2, href: "/protected/students/student-1" },
      }),
    ]);

    expect(html).toContain("+2 sibling");
  });

  it("collapses the data-quality flags into one dot rather than dropping them", () => {
    const clean = renderList([student()]);
    const flagged = renderList([student({ duplicateSrFlag: true })]);

    expect(clean).not.toContain("bg-warning");
    expect(flagged).toContain("bg-warning");
  });

  it("offers the design's two-line empty state", () => {
    const html = renderList([]);

    expect(html).toContain(messages.Students.emptyTitle);
    expect(html).toContain(messages.Students.emptyFresh);
  });
});

describe("phone student profile", () => {
  const profile = read("components/students/mobile-student-profile.tsx");

  it("clears only the safe area, because the tab bar is gone on a takeover route", () => {
    // /protected/students/ is in mobileTakeoverRoutes, so MobileBottomNav
    // returns null. Padding with --mobile-bottom-nav-offset here would float
    // the action bar 68px above the home indicator.
    expect(profile).toContain('"calc(var(--mobile-safe-area-bottom, 0px) + 0.75rem)"');
    expect(readCode("components/students/mobile-student-profile.tsx")).not.toContain(
      "--mobile-bottom-nav-offset",
    );
  });

  it("pins the action bar to the viewport, not to the end of the content", () => {
    // The About tab on a sibling-less student is shorter than the viewport;
    // `sticky bottom-0` would leave the bar mid-screen.
    expect(profile).toContain("fixed inset-x-0 bottom-0");
    expect(profile).toContain("md:hidden");
  });

  it("reserves room below the scroll body so the last card stays reachable", () => {
    expect(profile).toContain('paddingBottom: "calc(var(--mobile-safe-area-bottom, 0px) + 6rem)"');
  });

  it("does not render an empty fixed bar or reserve space when no action is available", () => {
    const html = renderProfile();

    expect(html).not.toContain('data-mobile-student-actions="true"');
    expect(html).not.toContain("mobile-safe-area-bottom, 0px) + 6rem");
  });

  it("keeps the fixed bar and scroll clearance when collection is available", () => {
    const html = renderProfile({ canPostPayments: true, isActive: true });

    expect(html).toContain('data-mobile-student-actions="true"');
    expect(html).toContain("mobile-safe-area-bottom, 0px) + 6rem");
    expect(html).toContain("/protected/payments?studentId=student-1");
  });

  it("asks which parent to call instead of hardcoding one number", () => {
    expect(profile).toContain("PhoneActionMenu");
    expect(profile).toContain("buildStudentPhoneEntries");
  });

  it("routes Collect through the shared Payment Desk button", () => {
    expect(profile).toContain("StudentRowCollectButton");
    expect(profile).not.toContain("post_student_payment");
  });
});

describe("phone family tab", () => {
  const family = read("components/students/mobile-student-family-tab.tsx");

  it("drives the same sibling server actions as the desktop panel", () => {
    expect(family).toContain("LinkSiblingTrigger");
    expect(family).toContain("UnlinkSiblingTrigger");
    // Phone-match detection is gone: there is no one-tap "link the suspected
    // group" path, only the explicit picker.
    expect(family).not.toContain("LinkSuspectedSiblingsButton");
  });

  it("collects per sibling and never posts one receipt for the family", () => {
    expect(family).toContain("StudentRowCollectButton");
    expect(family).not.toContain("/protected/payments/family");
  });

  it("keeps no suspected-sibling wording in any dictionary", () => {
    for (const locale of ["en", "hi", "hi-en"]) {
      expect(read(`messages/${locale}.json`)).not.toContain("familySuspected");
      expect(read(`messages/${locale}.json`)).not.toContain("linkSuspected");
    }
  });
});

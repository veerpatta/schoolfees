import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { PayeeSummaryStrip } from "@/components/payments/payee-summary-strip";

const messages = JSON.parse(
  readFileSync(join(process.cwd(), "messages", "en.json"), "utf-8"),
);

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

const STUDENT = {
  fullName: "Arjun Singh",
  admissionNo: "TEST-001",
  classLabel: "Class 10-A",
  fatherName: "Rajendra Singh",
  fatherPhone: "9876543210",
  studentStatusLabel: "Active",
  totalPending: 12000,
  overdueAmount: 0,
  creditBalance: 0,
  oldBalanceAmount: 0,
  nextDueDate: "2026-07-20",
  nextDueAmount: 6000,
};

describe("PayeeSummaryStrip — TrustBadge", () => {
  it("renders a TrustBadge with source 'Workbook v1' next to the Pending label", () => {
    const html = render(
      <PayeeSummaryStrip student={STUDENT} latestReceiptToday={null} />,
    );
    expect(html).toContain("Workbook v1");
  });

  it("TrustBadge title attribute references the source", () => {
    const html = render(
      <PayeeSummaryStrip student={STUDENT} latestReceiptToday={null} />,
    );
    expect(html).toContain("Source: Workbook v1");
  });

  it("renders the pending amount alongside the badge", () => {
    const html = render(
      <PayeeSummaryStrip student={STUDENT} latestReceiptToday={null} />,
    );
    expect(html).toContain("Workbook v1");
    expect(html).toContain("12,000");
  });

  it("badge is present even when student has no pending amount", () => {
    const html = render(
      <PayeeSummaryStrip
        student={{ ...STUDENT, totalPending: 0 }}
        latestReceiptToday={null}
      />,
    );
    expect(html).toContain("Workbook v1");
  });
});

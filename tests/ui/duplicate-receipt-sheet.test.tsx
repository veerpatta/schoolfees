import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { DuplicateReceiptSheet } from "@/components/payments/duplicate-receipt-sheet";

const messages = JSON.parse(
  readFileSync(join(process.cwd(), "messages", "en.json"), "utf-8"),
);

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Kolkata">
      {node}
    </NextIntlClientProvider>,
  );
}

const BASE_PROPS = {
  open: true,
  message: "A similar payment was just recorded for this student.",
  receiptId: "11111111-1111-4111-8111-111111111111",
  receiptNumber: "SVP20260701-0004",
  existingCreatedAt: "2026-07-18T16:35:25.000Z",
  existingAmount: 6300,
  existingMode: "cash",
  onCollectAnother: () => {},
};

describe("DuplicateReceiptSheet", () => {
  it("shows the existing receipt's number, amount, mode, and saved time", () => {
    const html = render(
      <DuplicateReceiptSheet {...BASE_PROPS} kind="daily-amount" onContinueAnyway={() => {}} />,
    );
    expect(html).toContain("SVP20260701-0004");
    expect(html).toContain("6,300");
    expect(html).toContain("cash");
    // 16:35 UTC = 22:05 IST — asserting the minutes is timezone-safe enough.
    expect(html).toContain("was saved at");
  });

  it("daily-amount: Continue anyway is disabled until the confirmation checkbox is ticked", () => {
    const html = render(
      <DuplicateReceiptSheet {...BASE_PROPS} kind="daily-amount" onContinueAnyway={() => {}} />,
    );
    expect(html).toContain("Continue anyway");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*Continue anyway/);
    expect(html).toContain("I confirm this is a second, different payment");
  });

  it("near-duplicate without admin: hard stop — no continue button, explains the 10-minute block", () => {
    const html = render(<DuplicateReceiptSheet {...BASE_PROPS} kind="near-duplicate" />);
    expect(html).not.toContain("Continue anyway");
    expect(html).not.toContain("admin override");
    expect(html).toContain("blocked");
  });

  it("near-duplicate with admin: shows a checkbox-gated override button", () => {
    const html = render(
      <DuplicateReceiptSheet
        {...BASE_PROPS}
        kind="near-duplicate"
        canOverrideNearDuplicate
        onOverrideNearDuplicate={() => {}}
      />,
    );
    expect(html).toContain("admin override");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*Post anyway/);
    expect(html).toContain("I confirm this is a second, different payment");
  });

  it("always offers opening the matched receipt", () => {
    const html = render(<DuplicateReceiptSheet {...BASE_PROPS} kind="near-duplicate" />);
    expect(html).toContain(`/protected/receipts/${BASE_PROPS.receiptId}`);
  });
});

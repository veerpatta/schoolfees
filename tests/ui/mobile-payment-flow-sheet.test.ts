import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("mobile payment bottom sheet flow", () => {
  it("renders a custom numpad that preserves focus and uses an icon for backspace", () => {
    const source = readRepoFile("components/payments/mobile-numpad.tsx");

    expect(source).toContain('["7","8","9"]');
    expect(source).toContain('["4","5","6"]');
    expect(source).toContain('["1","2","3"]');
    expect(source).toContain('[".","0","⌫"]');
    expect(source).toContain("onPointerDown");
    expect(source).toContain("e.preventDefault()");
    expect(source).toContain('key === "⌫" ? (');
    expect(source).toContain("<svg");
    expect(source).toContain("flex flex-1 min-h-[48px]");
  });

  it("keeps payment entry on a keyboard-free mobile bottom sheet", () => {
    const source = readRepoFile("components/payments/mobile-payment-flow-sheet.tsx");

    expect(source).toContain('fixed inset-0 z-40 md:hidden');
    expect(source).toContain('"class-picker" | "student-picker" | "payment-entry" | null');
    expect(source).toContain('view === "payment-entry"');
    expect(source).toContain("<MobileNumPad");
    expect(source).toContain("onKey={onNumpadKey}");
    expect(source).toContain("Review Receipt");
    expect(source).toContain("Enter amount");
    expect(source).not.toContain('aria-label="Mobile amount received"');
    expect(source).not.toContain('type="number"');
  });

  it("replaces the old mobile-only in-flow sections in Payment Desk", () => {
    const source = readRepoFile("components/payments/payment-desk-mobile.tsx");

    expect(source).toContain("<MobilePaymentFlowSheet");
    expect(source).toContain("mobileSheetView");
    expect(source).toContain("handleNumpadKey");
    expect(source).not.toContain("mobileClassPickerOpen");
    expect(source).not.toContain("Mobile amount received");
    expect(source).not.toContain("mobile-payment-cta-clearance");
    expect(source).not.toContain("data-mobile-class-picker-sheet");
  });
});

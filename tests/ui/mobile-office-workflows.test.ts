import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("mobile office workflow source markers", () => {
  it("keeps Find students search and class filtering visible on mobile", () => {
    const quickLoad = readRepoFile("components/students/student-quick-load.tsx");

    expect(quickLoad).toContain("data-mobile-student-search");
    expect(quickLoad).toContain("data-mobile-class-filter");
    expect(quickLoad).toContain("defaultStatusIsActive");
    expect(quickLoad).toContain('status: "active"');
    expect(quickLoad).toContain("Route and status");
  });

  it("keeps Payment Desk mobile class-first collection and late fee waiver visible", () => {
    const paymentDesk = readRepoFile("components/payments/payment-desk-mobile.tsx");
    const mobileSheet = readRepoFile("components/payments/mobile-payment-flow-sheet.tsx");

    expect(paymentDesk).toContain("<MobilePaymentFlowSheet");
    expect(paymentDesk).toContain("mobileSheetView");
    expect(paymentDesk).toContain("mobileClassPickerAutoOpenedRef");
    expect(mobileSheet).toContain('"class-picker"');
    expect(mobileSheet).toContain('"student-picker"');
    expect(mobileSheet).toContain('"payment-entry"');
    expect(mobileSheet).toContain("Waive late fee");
    expect(mobileSheet).toContain('type="number"');
    expect(mobileSheet).toContain("onAmountChange(sanitizeDecimalInput(e.target.value))");
    expect(mobileSheet).not.toContain("<MobileNumPad");
    expect(paymentDesk).not.toContain("amountInputRef.current?.focus");
  });
});

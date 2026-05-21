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

    expect(paymentDesk).toContain("data-mobile-class-picker-sheet");
    expect(paymentDesk).toContain("mobileClassPickerOpen");
    expect(paymentDesk).toContain("mobileClassPickerAutoOpenedRef");
    expect(paymentDesk).toContain("data-mobile-late-fee-waiver");
    expect(paymentDesk).toContain("No late fee pending");
    expect(paymentDesk).toContain("amountInputRef.current?.focus");
  });
});

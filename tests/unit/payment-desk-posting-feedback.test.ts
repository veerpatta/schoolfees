import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { derivePaymentDeskControllerView } from "@/lib/payments/payment-desk-controller";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * Pressing Save on a mobile cash collection showed nothing at all until the
 * receipt animation arrived. Three separate defects stacked up:
 *
 *  1. The only "Processing payment…" overlay was `md:hidden` inside a
 *     `hidden md:block` SectionCard, so it rendered on NO viewport.
 *  2. The cash fast-post path (≤ ₹15,000, no discount) skips ConfirmReceiptSheet,
 *     which was the only component wired to the pending flag.
 *  3. The controller derived `isPosting` and nothing consumed it.
 *
 * These tests exist so a refactor cannot quietly restore the dead interval.
 */
describe("payment desk shows that a post is in flight", () => {
  const desk = read("components/payments/payment-desk-mobile.tsx");
  const flowSheet = read("components/payments/mobile-payment-flow-sheet.tsx");

  it("derives a posting phase distinct from review and receipt", () => {
    const posting = derivePaymentDeskControllerView({ phase: "posting" } as never);

    expect(posting.isPosting).toBe(true);
    expect(posting.isConfirmOpen).toBe(false);
    expect(posting.isSuccessOpen).toBe(false);
  });

  it("consumes isPosting instead of deriving it and dropping it", () => {
    expect(desk).toMatch(/isPosting,\s*\n\s*}\s*=\s*derivePaymentDeskControllerView/);
    expect(desk).toContain("const isPostInFlight =");
  });

  it("renders the posting screen through a portal, not inside the desktop-only card", () => {
    // The old overlay lived inside `<SectionCard className="hidden md:block">`,
    // which is why it never appeared. A portal escapes that subtree.
    expect(desk).toContain("<PostingReceiptSheet");
    expect(desk).toMatch(/showPostingSheet[\s\S]{0,200}createPortal\(\s*\n?\s*<PostingReceiptSheet/);
    expect(desk).not.toContain("Processing payment...");
  });

  it("imports the posting screen statically so it is on screen within a frame", () => {
    // A dynamic import would reintroduce the very wait this removes.
    expect(desk).toContain('import { PostingReceiptSheet } from "@/components/payments/posting-receipt-sheet"');
    expect(desk).not.toMatch(/dynamic\(\s*\(\)\s*=>\s*import\("@\/components\/payments\/posting-receipt-sheet"/);
  });

  it("delays the sheet so a fast post does not strobe, and escalates when slow", () => {
    // Same anti-flash constant RouteProgress uses.
    expect(desk).toContain("setShowPostingSheet(true), 120");
    expect(desk).toContain("setIsSlowPost(true), 8000");
  });

  it("disables and spins the mobile Collect button while posting", () => {
    expect(flowSheet).toContain("loading={isPosting}");
    expect(flowSheet).toContain('loadingText="Saving payment…"');
    expect(desk).toContain("isPosting={isPostInFlight}");
  });

  it("prefetches the receipt chunk on student select, not on confirm", () => {
    // The fast-post path never opens the confirm sheet, so prefetching there
    // raced the post instead of preceding it.
    const selectStudentBody = desk.slice(
      desk.indexOf("function selectStudent("),
      desk.indexOf("function selectStudent(") + 900,
    );
    expect(selectStudentBody).toContain('import("@/components/payments/success-receipt-sheet")');
  });

  it("never claims a receipt exists before the server says so", () => {
    // Optimistic UI stays banned for financial mutations
    // (docs/design/design-system.md §5.7). The posting screen may show the
    // amount and the student — both already true — but no receipt number.
    const posting = read("components/payments/posting-receipt-sheet.tsx");

    expect(posting).not.toContain("receiptNumber");
    expect(posting).not.toMatch(/Payment Successful|Receipt saved/);
    expect(posting).toContain('aria-live="polite"');
  });
});

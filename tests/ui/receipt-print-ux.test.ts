import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("receipt print and loading UX", () => {
  it("keeps the receipt print document constrained for thermal reprints", () => {
    const receiptDocument = readRepoFile("components/receipts/receipt-document.tsx");

    expect(receiptDocument).toContain("receipt-print-page");
    expect(receiptDocument).toContain("receipt-body");
    expect(receiptDocument).toContain("@page");
    expect(receiptDocument).toContain("max-width: 80mm");
    expect(receiptDocument).toContain("font-size: 11px");
    expect(receiptDocument).toContain("nav, aside, .no-print");
    expect(receiptDocument).toContain("print-color-adjust: exact");
  });

  it("keeps the printable receipt simple and bilingual for parents", () => {
    const receiptDocument = readRepoFile("components/receipts/receipt-document.tsx");
    // Receipt copy now lives in the Receipts namespace. English in en.json,
    // real Hindi in hi.json — assert against the catalogs so the labels can
    // render as a single locale when the user picks Hindi or Hinglish.
    const englishMessages = JSON.parse(readRepoFile("messages/en.json")) as {
      Receipts: Record<string, string>;
    };
    const hindiMessages = JSON.parse(readRepoFile("messages/hi.json")) as {
      Receipts: Record<string, string>;
    };

    expect(englishMessages.Receipts.totalFeeDue).toBe("Total Fee Due");
    expect(hindiMessages.Receipts.totalFeeDue).toBe("कुल देय शुल्क");
    expect(englishMessages.Receipts.paidTillDate).toBe("Paid Till Date");
    expect(hindiMessages.Receipts.paidTillDate).toBe("अब तक जमा");
    expect(englishMessages.Receipts.paidToday).toBe("Paid Today");
    expect(hindiMessages.Receipts.paidToday).toBe("आज जमा");
    expect(englishMessages.Receipts.balanceDue).toBe("Balance Due");
    expect(hindiMessages.Receipts.balanceDue).toBe("शेष राशि");
    expect(englishMessages.Receipts.studentDetails).toBe("Student Details");
    expect(hindiMessages.Receipts.studentDetails).toBe("विद्यार्थी विवरण");
    expect(englishMessages.Receipts.paymentDetails).toBe("Payment Details");
    expect(hindiMessages.Receipts.paymentDetails).toBe("भुगतान विवरण");
    expect(englishMessages.Receipts.installmentDetailsHeading).toBe("Installment Details");
    expect(hindiMessages.Receipts.installmentDetailsHeading).toBe("किस्त विवरण");
    expect(receiptDocument).not.toContain("Installment allocation");
    expect(receiptDocument).not.toContain("Saved receipt breakup");
    expect(receiptDocument).not.toContain("Allocation total");
    expect(receiptDocument).not.toContain("bg-slate-950");
  });

  it("uses a stacked mobile receipt layout while keeping the print table", () => {
    const receiptDocument = readRepoFile("components/receipts/receipt-document.tsx");
    const successSheet = readRepoFile("components/payments/success-receipt-sheet.tsx");

    // The earlier separate `data-mobile-receipt-summary` block was folded into
    // the 4-card totals strip (now responsive 2-up on phones, 4-up on
    // desktop). The mobile installment stack and the print table are still
    // separate so thermal reprints get the table and phones get cards.
    expect(receiptDocument).toContain("data-mobile-installment-stack");
    expect(receiptDocument).toContain("data-print-installment-table");
    expect(receiptDocument).toContain("hidden sm:block print:block");
    expect(receiptDocument).toContain("sm:hidden print:hidden");
    expect(successSheet).toContain("data-mobile-success-receipt-summary");
    expect(successSheet).toContain("Late fee waived");
    expect(successSheet).toContain("Remaining");
  });

  it("receipt-document renders draft watermark text in draft mode", () => {
    // Draft / saved labels live in the Receipts namespace; component still owns the mode branches.
    const receiptDocument = readRepoFile("components/receipts/receipt-document.tsx");
    const englishMessages = JSON.parse(readRepoFile("messages/en.json")) as {
      Receipts: Record<string, string>;
    };
    const hindiMessages = JSON.parse(readRepoFile("messages/hi.json")) as {
      Receipts: Record<string, string>;
    };

    expect(englishMessages.Receipts.draftWatermark).toBe("DRAFT — NOT YET SAVED");
    expect(hindiMessages.Receipts.draftLabel).toBe("प्रारूप");
    expect(englishMessages.Receipts.savedLabel).toContain("SAVED");
    expect(hindiMessages.Receipts.savedLabel).toContain("सहेजा गया");
    expect(receiptDocument).toContain('mode === "draft"');
    expect(receiptDocument).toContain('mode === "saved"');
    expect(englishMessages.Receipts.draftReceiptNumberPlaceholder).toContain("not yet saved");
  });

  it("supports print-ready receipt links from Payment Desk success", () => {
    const receiptPage = readRepoFile("app/protected/receipts/[receiptId]/page.tsx");
    const printActions = readRepoFile("components/receipts/receipt-print-actions.tsx");
    const paymentDesk = readRepoFile("components/payments/payment-desk-mobile.tsx");

    expect(receiptPage).toContain("print?: string");
    expect(receiptPage).toContain('resolvedSearchParams?.print === "1"');
    expect(printActions).toContain("autoPrint");
    expect(printActions).toContain("requestAnimationFrame");
    expect(paymentDesk).toContain("printReceiptHref");
    expect(paymentDesk).toContain("?print=1");
  });

  it("uses shared restrained loading primitives with reduced-motion support", () => {
    const loading = readRepoFile("components/ui/loading-skeleton.tsx");
    const routeLoading = readRepoFile("components/admin/route-loading.tsx");
    const globals = readRepoFile("app/globals.css");
    const paymentDesk = readRepoFile("components/payments/payment-desk-mobile.tsx");

    expect(loading).toContain("export function LoadingProgress");
    expect(loading).toContain("export function LoadingBlock");
    expect(loading).toContain("export function LoadingTableRows");
    expect(routeLoading).toContain("LoadingProgress");
    expect(routeLoading).toContain("LoadingBlock");
    expect(paymentDesk).toContain("LoadingBlock");
    expect(paymentDesk).toContain('aria-busy={studentSummaryLoading}');
    expect(globals).toContain(".animate-loading-bar");
    expect(globals).toContain(".animate-soft-shimmer");
    expect(globals).toContain("prefers-reduced-motion: reduce");
  });
});

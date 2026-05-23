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
    expect(receiptDocument).toContain("receipt-watermark");
    expect(receiptDocument).toContain("security-strip");
  });

  it("keeps the printable receipt simple and bilingual for parents", () => {
    const receiptDocument = readRepoFile("components/receipts/receipt-document.tsx");

    expect(receiptDocument).toContain("Total Fee Due");
    expect(receiptDocument).toContain("कुल देय शुल्क");
    expect(receiptDocument).toContain("Paid Till Date");
    expect(receiptDocument).toContain("अब तक जमा");
    expect(receiptDocument).toContain("Paid Today");
    expect(receiptDocument).toContain("आज जमा");
    expect(receiptDocument).toContain("Balance Due");
    expect(receiptDocument).toContain("शेष राशि");
    expect(receiptDocument).toContain("Student Details");
    expect(receiptDocument).toContain("विद्यार्थी विवरण");
    expect(receiptDocument).toContain("Payment Details");
    expect(receiptDocument).toContain("भुगतान विवरण");
    expect(receiptDocument).toContain("Installment Details");
    expect(receiptDocument).toContain("किस्त विवरण");
    expect(receiptDocument).not.toContain("Installment allocation");
    expect(receiptDocument).not.toContain("Saved receipt breakup");
    expect(receiptDocument).not.toContain("Allocation total");
    expect(receiptDocument).not.toContain("bg-slate-950");
  });

  it("uses a stacked mobile receipt layout while keeping the print table", () => {
    const receiptDocument = readRepoFile("components/receipts/receipt-document.tsx");
    const successSheet = readRepoFile("components/payments/success-receipt-sheet.tsx");

    expect(receiptDocument).toContain("data-mobile-receipt-summary");
    expect(receiptDocument).toContain("data-mobile-installment-stack");
    expect(receiptDocument).toContain("data-print-installment-table");
    expect(receiptDocument).toContain("hidden sm:block print:block");
    expect(receiptDocument).toContain("sm:hidden print:hidden");
    expect(successSheet).toContain("data-mobile-success-receipt-summary");
    expect(successSheet).toContain("Late fee waived");
    expect(successSheet).toContain("Remaining");
  });

  it("receipt-document renders draft watermark text in draft mode", () => {
    // This is a string-presence test on the component source.
    // Verify that the component contains the strings required for all three modes.
    const receiptDocument = readRepoFile("components/receipts/receipt-document.tsx");

    expect(receiptDocument).toContain("DRAFT — NOT YET SAVED");
    expect(receiptDocument).toContain("प्रारूप");
    expect(receiptDocument).toContain("SAVED");
    expect(receiptDocument).toContain("सहेजा गया");
    expect(receiptDocument).toContain('mode === "draft"');
    expect(receiptDocument).toContain('mode === "saved"');
    expect(receiptDocument).toContain("not yet saved");
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

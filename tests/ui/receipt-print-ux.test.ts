import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("receipt print and loading UX", () => {
  it("keeps the receipt print document constrained for thermal reprints", () => {
    // The actual print CSS now lives in the V2 layout body; the legacy
    // receipt-document.tsx is a thin shim that always renders V2.
    const receiptDocument = readRepoFile("components/receipts/receipt-document-v2.tsx");

    expect(receiptDocument).toContain("receipt-print-page");
    expect(receiptDocument).toContain("receipt-body");
    expect(receiptDocument).toContain("@page");
    expect(receiptDocument).toContain("max-width: 80mm");
    expect(receiptDocument).toContain("font-size: 11px");
    expect(receiptDocument).toContain("nav, aside, .no-print");
    expect(receiptDocument).toContain("print-color-adjust: exact");
  });

  it("ships a localized receipt vocabulary that stays time-neutral", () => {
    const englishMessages = JSON.parse(readRepoFile("messages/en.json")) as {
      Receipts: Record<string, string>;
    };
    const hindiMessages = JSON.parse(readRepoFile("messages/hi.json")) as {
      Receipts: Record<string, string>;
    };

    // The V2 receipt body uses these time-neutral labels — never the older
    // "Paid Today" / "Total Paid Today" / "Balance Due After" wording, which
    // turned every reprint into a lie about when the payment happened.
    expect(englishMessages.Receipts.paymentDateLabel).toBe("Payment date");
    expect(englishMessages.Receipts.v2TotalPaid).toBe("Total paid");
    expect(englishMessages.Receipts.v2BalanceDue).toBe("Balance due");
    expect(englishMessages.Receipts.v2DueDateColumn).toBe("Due date");
    expect(englishMessages.Receipts.v2PaidColumn).toBe("Paid");
    expect(hindiMessages.Receipts.paymentDateLabel).toBe("भुगतान तिथि");
    expect(hindiMessages.Receipts.v2TotalPaid).toBe("कुल जमा");
    expect(hindiMessages.Receipts.v2BalanceDue).toBe("शेष राशि");
  });

  it("uses a stacked mobile receipt layout while keeping the print table", () => {
    const successSheet = readRepoFile("components/payments/success-receipt-sheet.tsx");
    // The success receipt confirmation sheet on the Payment Desk still keeps
    // its own mobile-friendly summary card and waive-fee detail row — that
    // contract is independent of the printed receipt layout.
    expect(successSheet).toContain("data-mobile-success-receipt-summary");
    expect(successSheet).toContain("Late fee waived");
    expect(successSheet).toContain("Remaining");
  });

  it("receipt-document-v2 renders draft and saved variants explicitly", () => {
    const receiptDocument = readRepoFile("components/receipts/receipt-document-v2.tsx");
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

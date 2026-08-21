import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

/**
 * Where the one-tap send sits on a phone, asserted on source.
 *
 * Two of these rules have bitten this codebase before and neither shows up in a
 * unit test of behaviour: a sheet mounted inside a `hidden md:block` subtree
 * opens into `display: none` and does nothing, and a fixed bar without matching
 * body padding covers the last thing on the page.
 */

describe("receipt detail on a phone", () => {
  const page = read("src/app/protected/receipts/[receiptId]/page.tsx");
  const bar = read("src/modules/receipts/ui/mobile-receipt-action-bar.tsx");

  it("moves the desk action row off the phone", () => {
    expect(page).toContain('className="hidden flex-wrap items-center gap-2 md:flex"');
  });

  it("carries the established fixed bottom bar, phone-only and never printed", () => {
    expect(bar).toContain(
      "fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-border bg-background/95 px-4 pt-2.5 backdrop-blur md:hidden print:hidden",
    );
    // Takeover route: safe area only, no --mobile-bottom-nav-offset, or the bar
    // floats a tab-bar's height above the home indicator.
    expect(bar).toContain('calc(var(--mobile-safe-area-bottom, 0px) + 0.75rem)');
    // `var(...)`, not the bare token name — the comment above the bar explains
    // why the offset is absent and would otherwise match here.
    expect(bar).not.toContain("var(--mobile-bottom-nav-offset");
  });

  it("pads the slip so the bar never covers its last line", () => {
    expect(page).toContain('calc(var(--mobile-safe-area-bottom, 0px) + 6rem)');
  });

  it("mounts the share sheet outside the desk-only document", () => {
    const deskStart = page.indexOf('<div className="hidden md:block print:block">');
    const deskEnd = page.indexOf("</div>", deskStart);
    expect(deskStart).toBeGreaterThan(-1);

    const insideDesk = page.slice(deskStart, deskEnd);
    expect(insideDesk).not.toContain("MobileReceiptActionBar");
    expect(page).toContain("<MobileReceiptActionBar");
  });

  it("gates the PDF attachment and the print link on receipts:print together", () => {
    expect(bar).toContain("canSendReceiptPdf={canPrintReceipts}");
    expect(bar).toContain("{canPrintReceipts ? (");
  });
});

describe("receipt preview sheet on a phone", () => {
  const sheet = read("src/modules/receipts/ui/receipt-preview-sheet.tsx");

  it("shows the one-tap send on phones and the template sheet on desk", () => {
    expect(sheet).toContain('className="md:hidden"');
    expect(sheet).toContain('<span className="hidden md:inline-flex">');
    expect(sheet).toContain("<ReceiptShareActions");
  });

  it("mounts the share sheet outside the desk-only wrapper", () => {
    const deskStart = sheet.indexOf('<span className="hidden md:inline-flex">');
    const deskEnd = sheet.indexOf("</span>", deskStart);
    expect(sheet.slice(deskStart, deskEnd)).not.toContain("PreviewShareSheet");
    expect(sheet).toContain("<PreviewShareSheet");
  });
});

describe("payment success screen", () => {
  const sheet = read("src/modules/payments/ui/success-receipt-sheet.tsx");

  it("attaches the receipt on a phone instead of sending bare text", () => {
    expect(sheet).toContain("<ShareReceiptWhatsApp");
    expect(sheet).toContain("setShareOpen(true)");
  });

  it("no longer asks staff to fetch and attach the card by hand", () => {
    expect(sheet).not.toContain("Receipt Card (image for WhatsApp)");
  });

  it("keeps the plain wa.me anchor for desk, where there is no file share", () => {
    expect(sheet).toContain("whatsappHref");
    expect(sheet).toContain('receiptId && "max-md:hidden"');
  });
});

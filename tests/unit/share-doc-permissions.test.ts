import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { rolePermissions, type StaffRole } from "@/lib/auth/roles";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf-8");
}

/**
 * Two documents, two different permissions.
 *
 * `/protected/receipts/[id]/card` gates on `receipts:view`;
 * `/protected/receipts/[id]/pdf` gates on `receipts:print`. Whether the share
 * sheet may attach the PDF therefore depends on the role, and getting it wrong
 * does not fail loudly — it 403s midway through preparing a share, at the
 * counter, with a parent waiting.
 */
describe("who may attach a receipt PDF", () => {
  it("is a strict subset of who may view a receipt", () => {
    for (const [role, permissions] of Object.entries(rolePermissions)) {
      if (permissions.includes("receipts:print")) {
        expect(permissions, `${role} may print but not view`).toContain("receipts:view");
      }
    }
  });

  it("excludes the three read-oriented roles", () => {
    for (const role of ["teacher", "fee_collector", "view_only"] as StaffRole[]) {
      expect(rolePermissions[role]).toContain("receipts:view");
      expect(rolePermissions[role]).not.toContain("receipts:print");
    }
  });

  /**
   * The Payment Desk's success screen hardcodes `canSendReceiptPdf` rather than
   * threading a prop through `payment-desk-mobile.tsx`, which sits 5 lines under
   * a source budget it is told not to raise. That shortcut is only sound while
   * everyone who can post a payment can also print a receipt. If a future role
   * breaks that, this fails here rather than in production.
   */
  it("covers everyone who can reach the payment success screen", () => {
    for (const [role, permissions] of Object.entries(rolePermissions)) {
      if (permissions.includes("payments:write")) {
        expect(
          permissions,
          `${role} can post a payment but cannot print the receipt — the success ` +
            `sheet's hardcoded canSendReceiptPdf is no longer safe`,
        ).toContain("receipts:print");
      }
    }
  });
});

/**
 * The preview sheet's `canPrint` used to default to `true`, and the transactions
 * shell passed nothing — so a read-only role was offered Print A4 and hit a 403
 * on the click. The fix is that the prop is required; this keeps it that way.
 */
describe("receipt preview print gating fails closed", () => {
  const sheet = readRepoFile("components/receipts/receipt-preview-sheet.tsx");

  it("declares canPrint as required, with no fail-open default", () => {
    expect(sheet).toContain("canPrint: boolean;");
    expect(sheet).not.toContain("canPrint?: boolean");
    expect(sheet).not.toContain("canPrint = true");
  });

  it("is told the answer by both of its call sites", () => {
    for (const path of [
      "components/receipts/receipts-quick-load.tsx",
      "components/transactions/transactions-client-shell.tsx",
    ]) {
      expect(readRepoFile(path), `${path} must pass canPrint`).toMatch(/canPrint=\{/);
    }
  });

  /**
   * The same receipt opened from the list and from its own page must compose
   * the same message, which means both paths need the office's templates.
   */
  it("hands the office's templates to every preview", () => {
    expect(readRepoFile("app/protected/receipts/page.tsx")).toContain(
      "listWhatsappTemplates",
    );
    for (const path of [
      "components/receipts/receipts-quick-load.tsx",
      "components/transactions/transactions-client-shell.tsx",
    ]) {
      expect(readRepoFile(path)).toMatch(/whatsappTemplates=\{/);
    }
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildOfficeWorkbookExportHref,
  buildOfficeWorkbookHref,
  normalizeOfficeWorkbookView,
  officeWorkbookMeta,
} from "@/lib/transactions/workbook";

describe("office workbook helpers", () => {
  it("falls back to receipt register for unknown workbook views", () => {
    expect(normalizeOfficeWorkbookView("not-a-view")).toBe("transactions");
  });

  it("reports whether workbook view params were recognized", async () => {
    const { resolveOfficeWorkbookView } = await import("@/lib/transactions/workbook");

    expect(resolveOfficeWorkbookView("imports")).toEqual({
      view: "transactions",
      wasRecognized: false,
      rawValue: "imports",
    });
    expect(resolveOfficeWorkbookView("dues")).toEqual({
      view: "student_dues",
      wasRecognized: true,
      rawValue: "dues",
    });
  });

  it("builds workbook links while preserving class and session filters", () => {
    expect(
      buildOfficeWorkbookHref({
        view: "collection_today",
        classId: "class-123",
        sessionLabel: "2026-27",
      }),
    ).toBe("/protected/transactions?view=collection_today&classId=class-123&session=2026-27");
  });

  it("normalizes legacy dues and receipt view names", () => {
    expect(normalizeOfficeWorkbookView("receipts_today")).toBe("receipts");
    expect(normalizeOfficeWorkbookView("statements")).toBe("student_dues");
    expect(normalizeOfficeWorkbookView("dues")).toBe("student_dues");
  });

  it("keeps the simplified office-facing workbook labels", () => {
    expect(officeWorkbookMeta.transactions.title).toBe("All Transactions");
    expect(officeWorkbookMeta.receipts.title).toBe("Receipts");
    expect(officeWorkbookMeta.student_dues.title).toBe("Student Dues");
    expect(officeWorkbookMeta.installments.title).toBe("Installment Tracker");
    expect(officeWorkbookMeta.class_register.title).toBe("Class Register");
    expect(officeWorkbookMeta.collection_today.title).toBe("Today's Collection");
  });

  it("builds Transactions export links with practical filters", () => {
    expect(
      buildOfficeWorkbookExportHref({
        view: "receipts",
        classId: "class-123",
        routeId: "route-123",
        paymentMode: "upi",
        query: "SVP-1",
      }),
    ).toBe(
      "/protected/transactions/export?view=receipts&classId=class-123&query=SVP-1&routeId=route-123&paymentMode=upi",
    );
  });

  it("transactions UI exposes payment-mode chips and one-click receipt reprint links", () => {
    const source = readFileSync(
      join(process.cwd(), "components/transactions/transactions-client-shell.tsx"),
      "utf8",
    );
    const workbookData = readFileSync(join(process.cwd(), "lib/workbook/data.ts"), "utf8");

    expect(source).toContain("handlePaymentModeToggle");
    expect(source).toContain("getPaymentModeChipClassName");
    expect(source).toContain('target="_blank"');
    expect(source).toContain("receiptPrintHref(row.receiptId, sessionLabel)");
    expect(workbookData).toContain('.eq("payment_mode", filters.paymentMode)');
  });
});

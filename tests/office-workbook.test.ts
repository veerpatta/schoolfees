import { describe, expect, it } from "vitest";

import {
  buildOfficeWorkbookExportHref,
  buildOfficeWorkbookHref,
  normalizeOfficeWorkbookView,
  officeWorkbookMeta,
} from "@/lib/office/workbook";

describe("office workbook helpers", () => {
  it("falls back to receipt register for unknown workbook views", () => {
    expect(normalizeOfficeWorkbookView("not-a-view")).toBe("transactions");
  });

  it("builds workbook links while preserving class and session filters", () => {
    expect(
      buildOfficeWorkbookHref({
        view: "collection_today",
        classId: "class-123",
        sessionLabel: "2026-27",
      }),
    ).toBe("/protected/transactions?view=collection_today&classId=class-123&sessionLabel=2026-27");
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
});

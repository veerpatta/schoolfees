import { describe, expect, it } from "vitest";

import {
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
    ).toBe("/protected/dues?view=collection_today&classId=class-123&sessionLabel=2026-27");
  });

  it("keeps the simplified office-facing workbook labels", () => {
    expect(officeWorkbookMeta.transactions.title).toBe("Receipt Register");
    expect(officeWorkbookMeta.installments.title).toBe("Installment Tracker");
    expect(officeWorkbookMeta.statements.title).toBe("Master Fee Statement");
    expect(officeWorkbookMeta.class_register.title).toBe("Class Register");
    expect(officeWorkbookMeta.receipts_today.title).toBe("Today's Receipts");
  });
});

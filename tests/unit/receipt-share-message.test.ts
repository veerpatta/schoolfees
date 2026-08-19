import { describe, expect, it } from "vitest";

import {
  activeReceiptTemplateBody,
  buildReceiptShareMessage,
} from "@/lib/receipts/share-message";
import { buildReceiptShareDocs } from "@/lib/receipts/share-docs";
import { receiptCardFilename, receiptPdfFilename } from "@/lib/receipts/document-names";

const receipt = {
  receiptNumber: "SVP20260819-0012",
  totalAmount: 12000,
  studentFullName: "Aarav Sharma",
  fatherName: "Rakesh Sharma",
  classLabel: "Class 8 A",
};

describe("buildReceiptShareMessage", () => {
  it("renders the office's template when one is active", () => {
    const message = buildReceiptShareMessage({
      receipt,
      templateBody: "Paid {{amount}} for {{studentName}} — {{receiptNumber}}",
    });

    expect(message).toBe("Paid ₹12,000 for Aarav Sharma — SVP20260819-0012");
  });

  it("falls back to the bilingual default with no template", () => {
    const message = buildReceiptShareMessage({ receipt });

    expect(message).toContain("We have received your payment for Aarav Sharma");
    expect(message).toContain("प्राप्त हो गई है");
    expect(message).toContain("₹12,000");
  });

  it("substitutes Parent when no father's name is on file", () => {
    const message = buildReceiptShareMessage({
      receipt: { ...receipt, fatherName: null },
    });

    expect(message).toContain("Namaste Parent ji");
  });

  /**
   * The guard that matters. A reversed receipt is not proof of payment, and the
   * one-tap send has nothing between the warning and the message — so no
   * template, however it is worded, may produce a confirmation for one.
   */
  describe("a reversed receipt", () => {
    const reversed = { ...receipt, isVoided: true };

    it("never says a payment was received, in either language", () => {
      const message = buildReceiptShareMessage({ receipt: reversed });

      expect(message).not.toMatch(/received/i);
      expect(message).not.toContain("प्राप्त");
      expect(message).toContain("REVERSED");
      expect(message).toContain("रद्द कर दी गई है");
    });

    it("ignores an active template rather than rendering it", () => {
      const message = buildReceiptShareMessage({
        receipt: reversed,
        templateBody: "We have received your payment of {{amount}}. Thank you!",
      });

      expect(message).not.toMatch(/received/i);
      expect(message).not.toMatch(/thank you/i);
      expect(message).toContain("REVERSED");
    });
  });
});

describe("activeReceiptTemplateBody", () => {
  it("picks the active receipt template and ignores other categories", () => {
    expect(
      activeReceiptTemplateBody([
        { category: "reminder", isActive: true, body: "reminder" },
        { category: "receipt", isActive: false, body: "retired" },
        { category: "receipt", isActive: true, body: "the one" },
      ]),
    ).toBe("the one");
  });

  it("returns null when there is nothing active", () => {
    expect(activeReceiptTemplateBody([])).toBeNull();
    expect(activeReceiptTemplateBody(undefined)).toBeNull();
  });
});

describe("buildReceiptShareDocs", () => {
  const target = { id: "receipt-uuid", receiptNumber: "SVP20260819-0012" };
  const labels = { card: "Receipt card (image)", pdf: "PDF document" };

  it("puts the image card FIRST, because that is the degradation target", () => {
    const docs = buildReceiptShareDocs({
      receipt: target,
      canSendReceiptPdf: true,
      labels,
    });

    expect(docs.map((doc) => doc.id)).toEqual(["card", "pdf"]);
    expect(docs[0].mimeType).toBe("image/png");
  });

  it("omits the PDF without receipts:print, rather than 403-ing on it", () => {
    const docs = buildReceiptShareDocs({
      receipt: target,
      canSendReceiptPdf: false,
      labels,
    });

    expect(docs.map((doc) => doc.id)).toEqual(["card"]);
    expect(docs[0].url).toBe("/protected/receipts/receipt-uuid/card");
  });

  it("marks a reversed receipt in both filenames", () => {
    const voided = { ...target, isVoided: true };

    expect(receiptCardFilename(voided)).toBe("REVERSED-receipt-SVP20260819-0012.png");
    expect(receiptPdfFilename(voided)).toBe("REVERSED-receipt-SVP20260819-0012.pdf");
    expect(receiptPdfFilename(target)).toBe("receipt-SVP20260819-0012.pdf");
  });
});

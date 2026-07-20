import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SuccessReceiptSheet } from "@/components/payments/success-receipt-sheet";

const BASE_PROPS = {
  open: true,
  receiptNumber: "SVP20260719-0007",
  receiptId: "11111111-1111-4111-8111-111111111111",
  studentFullName: "TEST Student",
  admissionNo: "TEST-001",
  classLabel: "Class 9",
  amountReceived: 6300,
  quickDiscountApplied: 0,
  lateFeeWaivedApplied: 0,
  paymentDate: "2026-07-19",
  paymentModeLabel: "Cash",
  referenceNumber: "",
  receivedBy: "raj@vpps.co.in",
  remainingBalance: 24500,
  creditBalance: 0,
  refundableAmount: 0,
  whatsappMessage: "",
  whatsappPhone: null,
  printReceiptHref: null,
  visibleReceiptHref: "/protected/receipts/x",
  autoPrint: false,
  onCollectAnother: () => {},
};

describe("payment-collected choreography", () => {
  it("renders the drawn check mark, not a static glyph", () => {
    render(<SuccessReceiptSheet {...BASE_PROPS} />);

    const check = document.querySelector("[data-success-check]");
    expect(check).toBeInTheDocument();
    // The stroke must carry the draw class — that is the whole point of the
    // moment; a plain ✓ character would silently regress it.
    expect(check?.querySelector("path.anim-check-draw")).toBeInTheDocument();
  });

  it("shows the receipt number and settles the amount to its true value", async () => {
    render(<SuccessReceiptSheet {...BASE_PROPS} />);

    expect(screen.getAllByText(/SVP20260719-0007/).length).toBeGreaterThan(0);

    // CountUp animates toward the real figure — the final rendered value must
    // be exact, never a rounding artifact of the animation.
    await waitFor(
      () => {
        expect(screen.getByText(/6,300/)).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });

  it("keeps the primary next action available immediately", () => {
    render(<SuccessReceiptSheet {...BASE_PROPS} />);
    // The choreography must never gate the next collection.
    expect(
      screen.getByRole("button", { name: /Collect Another Payment/i }),
    ).toBeEnabled();
  });
});

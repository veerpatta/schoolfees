import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SuccessReceiptSheet } from "@/components/payments/success-receipt-sheet";

/**
 * The saved receipt is step 4 of the collect flow, not a panel over step 3.
 *
 * The report this closes: "after saving, the page still doesn't move — the
 * receipt animation and undo timer start, but it stays on the same screen
 * where the amount is typed." The surface mounted; it just never read as
 * somewhere the clerk had arrived. It was `items-end`, content-height, behind
 * a 30% scrim, with the whole panel as one scrollport — so the actions could
 * be scrolled past — and it never subtracted the keyboard offset.
 */

const BASE_PROPS = {
  open: true,
  receiptNumber: "SVP20260727-0001",
  receiptId: "11111111-1111-4111-8111-111111111111",
  studentFullName: "TEST Student",
  admissionNo: "TEST-001",
  classLabel: "Nursery",
  amountReceived: 5000,
  quickDiscountApplied: 0,
  lateFeeWaivedApplied: 0,
  paymentDate: "2026-07-27",
  paymentModeLabel: "Cash",
  referenceNumber: "",
  receivedBy: "raj@vpps.co.in",
  remainingBalance: 8000,
  creditBalance: 0,
  refundableAmount: 0,
  whatsappMessage: "",
  whatsappPhone: null,
  printReceiptHref: "/protected/receipts/x?print=1",
  visibleReceiptHref: "/protected/receipts/x",
  autoPrint: false,
  onCollectAnother: () => {},
};

describe("saved receipt is the fourth collect step", () => {
  it("carries the step 4 of 4 rail the other three screens promise", () => {
    render(<SuccessReceiptSheet {...BASE_PROPS} />);

    // Steps 1-3 have said "of 4" since the redesign while no fourth screen
    // existed anywhere in the repo.
    const rail = screen.getByRole("progressbar");
    expect(rail).toHaveAttribute("aria-valuenow", "4");
    expect(rail).toHaveAttribute("aria-valuemax", "4");
  });

  it("keeps the actions out of the scrolling region", () => {
    render(<SuccessReceiptSheet {...BASE_PROPS} />);

    const nextStudent = screen.getByRole("button", { name: /Next student/i });
    // Walk up from the button: nothing between it and the dialog may scroll,
    // or the clerk can scroll the primary action off screen.
    let node: HTMLElement | null = nextStudent.parentElement;
    while (node && node.getAttribute("role") !== "dialog") {
      expect(node.className).not.toMatch(/(^|\s|:)overflow-y-auto/);
      node = node.parentElement;
    }
    expect(node).not.toBeNull();
  });

  it("sizes itself against the keyboard on a phone", () => {
    render(<SuccessReceiptSheet {...BASE_PROPS} />);

    const dialog = screen.getByRole("dialog");
    // A clerk can reach this screen with the keyboard still up. Without the
    // subtraction the panel is taller than the visible viewport and its footer
    // sits underneath the keyboard — the same bug the entry panel had.
    expect(dialog.className).toContain("max-md:h-[calc(100dvh-var(--keyboard-offset,0px))]");
    expect(dialog.className).toContain("max-md:flex-col");
  });

  describe("undo countdown", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("ticks without disturbing the figure on the slip", async () => {
      const onUndoPayment = vi.fn().mockResolvedValue({ ok: true, message: "Reversed." });
      render(
        <SuccessReceiptSheet {...BASE_PROPS} canUndo onUndoPayment={onUndoPayment} />,
      );

      // Matched on the countdown specifically: the desktop "More" drawer has
      // its own undo button, and both are in the DOM because the split is CSS.
      const countdown = () =>
        screen.getByRole("button", { name: /Undo this payment · \d+:\d\d/ });
      const before = countdown().textContent;

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      const after = countdown().textContent;
      expect(after).not.toBe(before);

      // The countdown owns its own state so the tick re-renders one button,
      // not the printed slip — which recomputes amount-in-words every render.
      const counters = [...document.querySelectorAll("[data-countup]")];
      expect(counters.length).toBeGreaterThanOrEqual(2);
      for (const counter of counters) {
        expect(counter.getAttribute("aria-label")).toMatch(/5,000/);
      }
    });
  });
});

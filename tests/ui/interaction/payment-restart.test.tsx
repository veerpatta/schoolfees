import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SuccessReceiptSheet } from "@/components/payments/success-receipt-sheet";

/**
 * Finishing a collection must put the clerk back at the START of the flow.
 *
 * Two defects sat behind the one report ("after saving it goes to the enter
 * amount screen of the same student"):
 *
 * 1. `handleCollectAnotherPayment` reset every piece of React state but left
 *    `?studentId=` in the URL. The restart therefore only *looked* clean — the
 *    next mount read the URL, auto-opened the payment-entry sheet and landed on
 *    the amount screen of the student who had just paid.
 * 2. The success sheet had exactly one exit ("Next student →"): no close
 *    button, no backdrop tap, no Escape. Any other habit left the clerk stuck
 *    on a sheet with the paid student still loaded behind it.
 */

const BASE_PROPS = {
  open: true,
  receiptNumber: "SVP20260726-0005",
  receiptId: "11111111-1111-4111-8111-111111111111",
  studentFullName: "TEST Student",
  admissionNo: "TEST-001",
  classLabel: "Nursery",
  amountReceived: 150,
  quickDiscountApplied: 0,
  lateFeeWaivedApplied: 0,
  paymentDate: "2026-07-26",
  paymentModeLabel: "Cash",
  referenceNumber: "",
  receivedBy: "raj@vpps.co.in",
  remainingBalance: 12850,
  creditBalance: 0,
  refundableAmount: 0,
  whatsappMessage: "",
  whatsappPhone: null,
  printReceiptHref: null,
  visibleReceiptHref: "/protected/receipts/x",
  autoPrint: false,
};

describe("payment flow restarts after a successful post", () => {
  it("drops ?studentId= when the desk restarts the flow", () => {
    const source = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const start = source.indexOf("function handleCollectAnotherPayment(");
    expect(start).toBeGreaterThan(-1);
    // The function body ends at the first closing brace in column 2.
    const end = source.indexOf("\n  }\n", start);
    const body = source.slice(start, end);

    expect(body).toContain('searchParams.delete("studentId")');
    expect(body).toContain("history.replaceState");
    // classId and session must survive — dropping them would restart the
    // clerk at the class picker of the wrong academic session.
    expect(body).toContain('searchParams.set("session"');
  });

  it("does NOT touch the URL while the receipt is being shown", () => {
    // This assertion is the inverse of what it used to be, and the reversal is
    // the fix for the reported bug.
    //
    // Stripping ?studentId= inside the success effect looked like belt and
    // braces against a remount. It CAUSED one. A Server Action that
    // revalidates re-renders its own route; that refresh reads the URL the
    // effect just rewrote, the page falls to its no-student branch, and — see
    // tests/ui/payment-desk-remount.test.ts — the desk is torn down and
    // rebuilt. The receipt screen went with it, so a successful save flashed
    // and dropped the clerk back on the student picker.
    //
    // Told apart from every other theory by the duplicate path: it renders the
    // same way through the same guard and the same portal, and it works —
    // because it is the one branch that does not rewrite the URL.
    const source = readFileSync(
      join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
      "utf8",
    );
    const start = source.indexOf('if (state.status === "success") {');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('if (state.status === "duplicate") {', start);
    const body = source
      .slice(start, end)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    expect(body).not.toContain("history.replaceState");
    expect(body).not.toContain('searchParams.delete("studentId")');
    // React state is untouched either, so `selectedStudent` survives and the
    // success sheet — which requires it — renders.
    expect(body).not.toMatch(/setSelectedStudentId\(|setSelectedStudent\(null\)/);
  });

  it.each([
    ["the close button", () =>
      fireEvent.click(
        screen.getByRole("button", { name: /Close receipt and start a new collection/i }),
      )],
    ["Escape", () => fireEvent.keyDown(window, { key: "Escape" })],
    ["Next student", () =>
      fireEvent.click(screen.getByRole("button", { name: /Next student/i }))],
  ])("restarts the flow via %s", async (_label, act) => {
    const onCollectAnother = vi.fn();
    render(<SuccessReceiptSheet {...BASE_PROPS} onCollectAnother={onCollectAnother} />);

    act();

    // Every route goes through onCollectAnother, never a bare local close:
    // that call is what marks the action state dismissed. Without it the
    // success effect re-opens this sheet on the next dependency change.
    await waitFor(() => expect(onCollectAnother).toHaveBeenCalledTimes(1));
  });

  it("ignores a backdrop tap while an undo is being decided", async () => {
    const onCollectAnother = vi.fn();
    const onUndoPayment = vi.fn().mockResolvedValue({ ok: true, message: "Reversed." });
    render(
      <SuccessReceiptSheet
        {...BASE_PROPS}
        canUndo
        onUndoPayment={onUndoPayment}
        onCollectAnother={onCollectAnother}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Undo this payment/i })[0]);
    fireEvent.keyDown(window, { key: "Escape" });

    // The clerk is mid-decision about whether the money moved. Dismissing here
    // would drop the undo affordance without answering the question.
    await waitFor(() => expect(screen.getAllByText(/Yes, undo/i).length).toBeGreaterThan(0));
    expect(onCollectAnother).not.toHaveBeenCalled();
  });

  it("counts the phone slip's total up rather than printing it static", () => {
    render(<SuccessReceiptSheet {...BASE_PROPS} onCollectAnother={() => {}} />);
    // The desktop summary block is `hidden md:block`, so before this the phone
    // — the only surface staff use — got no count-up at all.
    const counters = [...document.querySelectorAll("[data-countup]")];
    expect(counters.length).toBeGreaterThanOrEqual(2);
  });
});

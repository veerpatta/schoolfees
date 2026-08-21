import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("mobile payment bottom sheet flow", () => {
  it("removes the custom numpad file from the mobile payment flow", () => {
    expect(existsSync(join(process.cwd(), "src/components/payments/mobile-numpad.tsx"))).toBe(false);
  });

  it("leaves the phone keyboard as the only way to type an amount", () => {
    // A second on-screen money keypad sat under the amount field: it
    // duplicated a control every phone already has, took roughly a third of
    // the step's vertical space, and gave one live payment field two write
    // paths that had to be kept in agreement. `inputMode="decimal"` above
    // gets the same digit-first layout from the OS.
    expect(existsSync(join(process.cwd(), "src/ui/mobile/money-keypad.tsx"))).toBe(false);

    const source = readRepoFile("src/modules/payments/ui/mobile-payment-flow-sheet.tsx");
    expect(source).not.toContain("MoneyKeypad");
    expect(source).not.toContain("applyKeypadPress");

    // The empty-state hint used to read "Use the keypad below" and would have
    // pointed at nothing.
    for (const locale of ["en", "hi", "hi-en"]) {
      const messages = JSON.parse(readRepoFile(`src/messages/${locale}.json`));
      expect(messages.MobileApp.keypadLabel, locale).toBeUndefined();
      expect(messages.MobileApp.keypadDelete, locale).toBeUndefined();
      expect(messages.MobileApp.amountEmpty, locale).not.toMatch(/keypad/i);
    }
  });

  it("keeps payment entry on a compact sheet with native numeric amount entry", () => {
    const source = readRepoFile("src/modules/payments/ui/mobile-payment-flow-sheet.tsx");

    expect(source).toContain('fixed inset-0 z-[45] md:hidden');
    expect(source).toContain('"class-picker" | "student-picker" | "payment-entry" | null');
    expect(source).toContain('view === "payment-entry"');
    expect(source).toContain('type="text"');
    expect(source).toContain('inputMode="decimal"');
    expect(source).toContain('if (studentSummaryLoading) return;');
    expect(source).toContain("amountInputRef.current?.focus({ preventScroll: true })");
    expect(source).toContain("[view, studentSummaryLoading]");
    expect(source).toContain("onAmountChange(sanitizeDecimalInput(e.target.value))");
    // The entry panel ends AT the keyboard edge, not below it. This used to
    // assert the bare `calc(100svh - 3.5rem)`, which is correct only where the
    // layout viewport shrinks with the keyboard — on iOS it does not, so the
    // panel kept full height and the Collect button sat underneath. Both
    // halves are asserted because applying one without the other is worse
    // than applying neither: the height alone leaves a gap, the bottom alone
    // overflows the viewport.
    expect(source).toContain('bottom: "var(--keyboard-offset, 0px)"');
    expect(source).toContain('height: "calc(100svh - 3.5rem - var(--keyboard-offset, 0px))"');
    expect(source).toContain("Collect ${formatInr(Number(paymentAmountInput))}");
    expect(source).toContain("Enter amount");
    expect(source).not.toContain("<MobileNumPad");
    expect(source).not.toContain("onNumpadKey");
    expect(source).not.toContain('aria-label="Mobile amount received"');
  });

  it("surfaces mobile cashier shortcuts on the Ledger Calm 2.0 composer", () => {
    const source = readRepoFile("src/modules/payments/ui/mobile-payment-flow-sheet.tsx");

    expect(source).toContain("getStudentPendingAmount");
    expect(source).toContain("getClassStats");
    expect(source).toContain("${stats.pendingCount} pending");
    expect(source).toContain("Use {formatInr(lastPostedAmount)} again");
    // Amount composer: three quick cards replace the old Full Due / Next pair
    // and the secondary chip row.
    expect(source).toContain("Clear overdue");
    expect(source).toContain("Next installment");
    expect(source).toContain("Full year");
    // Dues ledger replaces both the installment pill row and the old
    // expandable Details table.
    expect(source).toContain("data-dues-ledger");
    expect(source).toContain("data-late-fee-decision");
    expect(source).toContain("data-allocation-strip");
    expect(source).not.toContain("breakdownExpanded");
    expect(source).not.toContain('flex-[2] min-h-0 overflow-y-auto border-b border-border px-3 py-2');
  });

  it("keeps swipe-down navigation on the handles only", () => {
    const source = readRepoFile("src/modules/payments/ui/mobile-payment-flow-sheet.tsx");

    expect(source).toContain("function useSwipeDown");
    expect(source).toContain("const classPickerSwipe = useSwipeDown(onClose)");
    expect(source).toContain("const studentPickerSwipe = useSwipeDown(onBackToClassPicker)");
    expect(source).toContain("const paymentEntrySwipe = useSwipeDown(onBackToStudentPicker)");
    expect(source).toContain("<SheetHandle swipeHandlers={studentPickerSwipe} />");
    expect(source).toContain("ref={studentListRef}");
  });

  it("does not autofocus the mobile student search input when the list opens", () => {
    const source = readRepoFile("src/modules/payments/ui/mobile-payment-flow-sheet.tsx");

    expect(source).toContain("studentSearchInputRef");
    expect(source).not.toContain("autoFocus");
    expect(source).not.toContain(".focus()");
  });

  it("replaces the old mobile-only in-flow sections in Payment Desk", () => {
    const source = readRepoFile("src/modules/payments/ui/payment-desk-mobile.tsx");

    expect(source).toContain("<MobilePaymentFlowSheet");
    expect(source).toContain("mobileSheetView");
    expect(source).toContain("onAmountChange={(value) =>");
    expect(source).not.toContain("handleNumpadKey");
    expect(source).not.toContain("onNumpadKey");
    expect(source).not.toContain("mobileClassPickerOpen");
    expect(source).not.toContain("Mobile amount received");
    expect(source).not.toContain("mobile-payment-cta-clearance");
    expect(source).not.toContain("data-mobile-class-picker-sheet");
  });

  it("keeps the desktop payment form hidden on mobile while preserving hidden submission fields", () => {
    const source = readRepoFile("src/modules/payments/ui/payment-desk-mobile.tsx");

    expect(source).toContain('title="3. Fast Payment"');
    expect(source).toContain('className="hidden md:block"');
    expect(source).toContain('<input type="hidden" name="referenceNumber" value="" />');
    expect(source).not.toContain("setReferenceNumber");
    expect(source).not.toContain("showReferenceField");
    expect(source).not.toContain("referenceInputMode");
  });
});

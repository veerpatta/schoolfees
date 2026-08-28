import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/**
 * The waiver has three entry points, and each one has already been wrong once.
 *
 * These are source assertions in the house style: they guard placement and the
 * gates around it, which a browser pass confirms but does not keep confirmed.
 */
describe("late-fee waiver — the three surfaces", () => {
  const page = read("src/app/protected/students/[studentId]/page.tsx");
  const edit = read("src/app/protected/students/[studentId]/edit/page.tsx");
  const form = read("src/modules/students/ui/student-form.tsx");
  const sheet = read("src/modules/payments/ui/waive-late-fee-sheet.tsx");
  const trigger = read("src/modules/payments/ui/waive-late-fee-trigger.tsx");

  it("derives what is waivable from lateFeePending, never min(finalLateFee, pendingAmount)", () => {
    // The old expression reads 0 once pending_amount became fees-only, which hid
    // the button from 18 of the 22 TEST students carrying a late fee.
    expect(page).toContain("remainingLateFee: item.lateFeePending");
    expect(page).not.toMatch(/Math\.min\(item\.finalLateFee, item\.pendingAmount\)/);
    expect(edit).toContain("remainingLateFee: item.lateFeePending");
    expect(edit).not.toMatch(/Math\.min\(item\.finalLateFee, item\.pendingAmount\)/);
  });

  it("offers an already-collected late fee only to fees:write", () => {
    for (const src of [page, edit]) {
      expect(src).toContain('hasStaffPermission(staff, "fees:write")');
      expect(src).toMatch(/collectedLateFee: canWaiveCollectedLateFee/);
    }
  });

  it("the trigger decides visibility from what is waivable, not from pending alone", () => {
    // `pendingLateFeeAmount <= 0` hid it for exactly the student it exists for:
    // an admin correcting a late fee that has already been paid.
    expect(trigger).toContain("waivableTotal");
    expect(trigger).not.toMatch(/if \(pendingLateFeeAmount <= 0\) \{\s*return null;/);
  });

  it("the phone profile mounts it in the installment row that carries the fee", () => {
    const mobileBlock = page.slice(
      page.indexOf("const mobileFeesContent"),
      page.indexOf("const mobileAboutContent") > 0
        ? page.indexOf("const mobileAboutContent")
        : page.length,
    );
    expect(mobileBlock).toContain("waivableByInstallment.has(item.installmentId)");
    expect(mobileBlock).toContain("<WaiveLateFeeTrigger");
    // The bottom bar owns Collect: one saffron CTA per screen.
    expect(mobileBlock).toMatch(/variant="ghost"/);
  });

  it("the edit page puts it inside the form's Fees group, not below the form", () => {
    // As its own SectionCard under the form it sat ~3 screens past the save bar
    // on a phone, where the edit form is a Student/Parents/Info/Fees/Status tab
    // strip. It is passed in as a slot instead.
    expect(edit).toContain("lateFeeSlot={lateFeeSlot}");
    expect(form).toContain("lateFeeSlot?: ReactNode");
    const feesGroup = form.slice(
      form.indexOf('groupPanel("fees")'),
      form.indexOf('groupPanel("status")'),
    );
    expect(feesGroup).toContain("{lateFeeSlot}");
    // First in the group: a correction should not sit behind the discount editor.
    expect(feesGroup.indexOf("{lateFeeSlot}")).toBeLessThan(
      feesGroup.indexOf("Conventional discounts"),
    );
  });

  it("the waiver is never a field of the student form", () => {
    // src/modules/students/README.md: a student edit must not rewrite posted
    // money. The trigger is a type="button"; the sheet's own form renders
    // through the Sheet portal, so no form is nested inside the student form.
    expect(trigger).toContain('type="button"');
    expect(read("src/ui/primitives/sheet.tsx")).toContain("createPortal");
  });

  it("never calls money the family has already paid 'pending'", () => {
    // The server distinguishes these in its refusal messages; the sheet has to
    // as well, or an admin correcting a wrongly-charged fee is told it is
    // outstanding while the parent holds the receipt for it.
    expect(sheet).toContain("scopeIsAllCollected");
    expect(sheet).toContain("waiveSheetDescriptionCollected");
    expect(sheet).toContain("waiveAmountHintCharged");
  });

  it("carries every waiver string in all three catalogues", () => {
    const keys = [
      "waiveSheetDescriptionCollected",
      "waiveAmountHintCharged",
      "waiveCollectedNotice",
      "waiveInstallmentOwed",
      "waiveInstallmentCollected",
      "waiveInstallmentMixed",
    ];
    for (const locale of ["en", "hi", "hi-en"]) {
      const messages = JSON.parse(read(`src/messages/${locale}.json`));
      for (const key of keys) {
        expect(messages.Payments[key], `${locale}.Payments.${key}`).toBeTruthy();
      }
    }
  });
});

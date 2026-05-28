import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("DuplicatePaymentWarning shape (audit 1.4)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("carries a kind field, defaulting to 'near-duplicate'", async () => {
    const { DuplicatePaymentWarning } = await import("@/lib/payments/data");
    const error = new DuplicatePaymentWarning({ id: "rec-1", receiptNumber: "TST/26-27/0001" });
    expect(error.kind).toBe("near-duplicate");
    expect(error.message).toContain("Open the latest receipt");
  });

  it("renders a daily-amount message with the amount and date when kind is 'daily-amount'", async () => {
    const { DuplicatePaymentWarning } = await import("@/lib/payments/data");
    const error = new DuplicatePaymentWarning(
      { id: "rec-1", receiptNumber: "TST/26-27/0001" },
      { kind: "daily-amount", amount: 3000, paymentDate: "2026-05-28" },
    );
    expect(error.kind).toBe("daily-amount");
    expect(error.message).toContain("3,000");
    expect(error.message).toContain("2026-05-28");
    expect(error.message.toLowerCase()).toContain("continue anyway");
  });
});

describe("postStudentPayment wires the soft daily-amount check (audit 1.4)", () => {
  // Static-code assertions — the full data-layer is too dependency-heavy to
  // simulate in a unit test. These guard the code path that the cashier walks
  // through when they fat-finger an amount or paste the wrong UPI reference.
  const source = readFileSync(
    join(process.cwd(), "lib/payments/data.ts"),
    "utf8",
  );

  it("defines findLikelyDailyDuplicateReceipt with no mode/reference predicate", () => {
    expect(source).toContain("async function findLikelyDailyDuplicateReceipt");
    // The whole point — no mode/reference clause, just student + date + amount.
    const fn = source.slice(source.indexOf("async function findLikelyDailyDuplicateReceipt"));
    const body = fn.slice(0, fn.indexOf("\nasync function"));
    expect(body).toMatch(/\.eq\("student_id"/);
    expect(body).toMatch(/\.eq\("payment_date"/);
    expect(body).toMatch(/\.eq\("total_amount"/);
    expect(body).not.toMatch(/\.eq\("payment_mode"/);
    expect(body).not.toMatch(/\.eq\("reference_number"/);
    expect(body).not.toMatch(/recentCutoff|gte\("created_at"/);
  });

  it("threads acknowledgeDailyDuplicate through postStudentPayment", () => {
    const fn = source.slice(source.indexOf("export async function postStudentPayment"));
    expect(fn).toContain("acknowledgeDailyDuplicate");
    expect(fn).toContain("findLikelyDailyDuplicateReceipt");
    expect(fn).toMatch(/if \(!payload\.acknowledgeDailyDuplicate\)/);
    expect(fn).toMatch(/kind: "daily-amount"/);
  });
});

describe("submitPaymentEntryAction passes acknowledgeDailyDuplicate (audit 1.4)", () => {
  const source = readFileSync(
    join(process.cwd(), "app/protected/payments/actions.ts"),
    "utf8",
  );

  it("reads acknowledgeDailyDuplicate from formData and forwards it to postStudentPayment", () => {
    expect(source).toContain('formData.get("acknowledgeDailyDuplicate")');
    expect(source).toMatch(/acknowledgeDailyDuplicate,/);
  });

  it("returns the warning kind in the action state so the UI can render the right CTA", () => {
    expect(source).toContain("duplicateKind: error.kind");
  });
});

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
    // The soft check is gated on the acknowledged flag: when acknowledged the
    // parallel read is short-circuited to null instead of querying receipts.
    expect(fn).toMatch(/payload\.acknowledgeDailyDuplicate\s*\?\s*Promise\.resolve\(null\)/);
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

describe("DuplicateReceiptSheet Continue-anyway path (audit 1.4 hotfix)", () => {
  // React state updates do NOT flush to the DOM before a synchronous
  // form.requestSubmit(). The Continue-anyway handler must imperatively
  // set the hidden input's DOM value to "true" before submitting so
  // FormData snapshots the acknowledged flag.
  const source = readFileSync(
    join(process.cwd(), "components/payments/payment-desk-mobile.tsx"),
    "utf8",
  );

  it("imperatively writes acknowledgeDailyDuplicate=true into the hidden input before form.requestSubmit()", () => {
    const handlerStart = source.indexOf("onContinueAnyway={()");
    expect(handlerStart).toBeGreaterThan(0);
    // Slice forward generously — the handler ends inside the JSX, but any
    // window large enough captures both the DOM write and the submit call.
    const handler = source.slice(handlerStart, handlerStart + 3000);
    expect(handler).toContain('input[name="acknowledgeDailyDuplicate"]');
    expect(handler).toMatch(/ackInput\.value\s*=\s*"true"/);
    const writeIdx = handler.indexOf('ackInput.value = "true"');
    // The hidden-input write must come before the form.requestSubmit() call.
    // Search for the call site after the imperative write so we skip the
    // comment mention earlier in the block.
    const submitIdx = handler.indexOf("form.requestSubmit()", writeIdx);
    expect(writeIdx).toBeGreaterThan(0);
    expect(submitIdx).toBeGreaterThan(writeIdx);
  });
});

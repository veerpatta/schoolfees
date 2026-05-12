import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPaymentDraftKey,
  clearDraft,
  loadDraft,
  saveDraft,
  type PaymentDraftValue,
} from "@/lib/payments/draft-store";

function installLocalStorageMock() {
  const store = new Map<string, string>();

  vi.stubGlobal("indexedDB", undefined);
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  });

  return store;
}

describe("payment draft store", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scopes keys by academic session, student, and payment date", () => {
    expect(
      buildPaymentDraftKey({
        sessionLabel: "TEST-2026-27",
        studentId: "student-1",
        paymentDate: "2026-05-12",
      }),
    ).toBe("paymentDraft:TEST-2026-27:student-1:2026-05-12");
  });

  it("does not restore TEST drafts for the live session fallback store", async () => {
    installLocalStorageMock();
    const draft: PaymentDraftValue = {
      amountInput: "1500",
      paymentMode: "upi",
      referenceNumber: "UPI-42",
    };

    await saveDraft({
      sessionLabel: "TEST-2026-27",
      studentId: "student-1",
      paymentDate: "2026-05-12",
      draft,
    });

    await expect(
      loadDraft({
        sessionLabel: "2026-27",
        studentId: "student-1",
        paymentDate: "2026-05-12",
      }),
    ).resolves.toBeNull();

    await expect(
      loadDraft({
        sessionLabel: "TEST-2026-27",
        studentId: "student-1",
        paymentDate: "2026-05-12",
      }),
    ).resolves.toEqual(draft);
  });

  it("clears a saved fallback draft after successful posting", async () => {
    installLocalStorageMock();

    const key = {
      sessionLabel: "TEST-2026-27",
      studentId: "student-1",
      paymentDate: "2026-05-12",
    };

    await saveDraft({
      ...key,
      draft: {
        amountInput: "500",
        paymentMode: "cash",
        referenceNumber: "",
      },
    });
    await clearDraft(key);

    await expect(loadDraft(key)).resolves.toBeNull();
  });
});

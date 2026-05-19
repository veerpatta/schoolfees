import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPaymentDeskStudentSummaryCacheKey,
  clearCachedPaymentDeskStudentSummary,
  loadCachedPaymentDeskStudentSummary,
  saveCachedPaymentDeskStudentSummary,
} from "@/lib/payments/payment-desk-summary-cache";
import type { PaymentDeskStudentSummary } from "@/lib/payments/types";

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

const summary: PaymentDeskStudentSummary = {
  student: {
    id: "student-1",
    fullName: "TEST Student",
    admissionNo: "TEST-1",
    classLabel: "Class 1",
    fatherName: null,
    fatherPhone: null,
    motherPhone: null,
    studentStatusLabel: "Active",
    transportRouteLabel: "No Transport",
    breakdown: [],
    totalDue: 1000,
    totalPaid: 200,
    totalPending: 800,
    creditBalance: 0,
    overpaidAmount: 0,
    refundableAmount: 0,
    rowsKeptForReview: 0,
    overdueAmount: 0,
    nextDueInstallmentLabel: "Installment 1",
    nextDueDate: "2026-04-20",
    nextDueAmount: 800,
  },
  issue: null,
  latestReceipt: null,
  suggestedDefaultAmount: 800,
  paymentDate: "2026-05-19",
};

describe("payment desk selected-student summary cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scopes cached summaries by session, student, and payment date", async () => {
    installLocalStorageMock();

    await saveCachedPaymentDeskStudentSummary({
      sessionLabel: "TEST-2026-27",
      studentId: "student-1",
      paymentDate: "2026-05-19",
      summary,
      now: 1000,
    });

    await expect(
      loadCachedPaymentDeskStudentSummary({
        sessionLabel: "2026-27",
        studentId: "student-1",
        paymentDate: "2026-05-19",
        now: 2000,
      }),
    ).resolves.toBeNull();

    await expect(
      loadCachedPaymentDeskStudentSummary({
        sessionLabel: "TEST-2026-27",
        studentId: "student-1",
        paymentDate: "2026-05-19",
        now: 2000,
      }),
    ).resolves.toEqual({ summary, stale: false });
  });

  it("marks old selected-student summaries stale for background refresh", async () => {
    installLocalStorageMock();

    await saveCachedPaymentDeskStudentSummary({
      sessionLabel: "TEST-2026-27",
      studentId: "student-1",
      paymentDate: "2026-05-19",
      summary,
      now: 1000,
    });

    await expect(
      loadCachedPaymentDeskStudentSummary({
        sessionLabel: "TEST-2026-27",
        studentId: "student-1",
        paymentDate: "2026-05-19",
        now: 1000 + 2 * 60 * 1000 + 1,
      }),
    ).resolves.toEqual({ summary, stale: true });
  });

  it("clears the selected summary after a payment posts", async () => {
    installLocalStorageMock();
    const key = buildPaymentDeskStudentSummaryCacheKey({
      sessionLabel: "TEST-2026-27",
      studentId: "student-1",
      paymentDate: "2026-05-19",
    });

    await saveCachedPaymentDeskStudentSummary({
      sessionLabel: "TEST-2026-27",
      studentId: "student-1",
      paymentDate: "2026-05-19",
      summary,
    });
    expect(localStorage.getItem(key)).not.toBeNull();

    await clearCachedPaymentDeskStudentSummary({
      sessionLabel: "TEST-2026-27",
      studentId: "student-1",
      paymentDate: "2026-05-19",
    });

    await expect(
      loadCachedPaymentDeskStudentSummary({
        sessionLabel: "TEST-2026-27",
        studentId: "student-1",
        paymentDate: "2026-05-19",
      }),
    ).resolves.toBeNull();
  });
});

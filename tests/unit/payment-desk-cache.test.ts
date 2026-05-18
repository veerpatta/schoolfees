import { describe, expect, it } from "vitest";

import {
  clearPaymentDeskStudentIndexCache,
  getPaymentDeskStudentIndexCacheKey,
  readPaymentDeskStudentIndexCache,
  writePaymentDeskStudentIndexCache,
} from "@/lib/payments/payment-desk-cache";
import type { PaymentStudentIndexItem } from "@/lib/payments/types";

function createStorage() {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  } satisfies Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

const students: PaymentStudentIndexItem[] = [
  {
    id: "student-1",
    fullName: "Asha Sharma",
    admissionNo: "SR-1",
    classId: "class-1",
    classLabel: "Class 1",
    studentStatus: "active",
  },
];

describe("payment desk student index cache", () => {
  it("stores and reads a fresh private student index by session", () => {
    const storage = createStorage();

    writePaymentDeskStudentIndexCache({
      storage,
      sessionLabel: "TEST-2026-27",
      students,
      now: 1000,
    });

    expect(
      readPaymentDeskStudentIndexCache({
        storage,
        sessionLabel: "TEST-2026-27",
        now: 2000,
      }),
    ).toEqual({ students, stale: false });
  });

  it("marks old cache entries stale so the UI can refresh in the background", () => {
    const storage = createStorage();

    writePaymentDeskStudentIndexCache({
      storage,
      sessionLabel: "TEST-2026-27",
      students,
      now: 1000,
    });

    expect(
      readPaymentDeskStudentIndexCache({
        storage,
        sessionLabel: "TEST-2026-27",
        now: 1000 + 5 * 60 * 1000 + 1,
      }),
    ).toEqual({ students, stale: true });
  });

  it("clears only the selected session cache key after payment posting", () => {
    const storage = createStorage();
    const targetKey = getPaymentDeskStudentIndexCacheKey("TEST-2026-27");
    const otherKey = getPaymentDeskStudentIndexCacheKey("2026-27");

    storage.setItem(targetKey, "target");
    storage.setItem(otherKey, "other");

    clearPaymentDeskStudentIndexCache({ storage, sessionLabel: "TEST-2026-27" });

    expect(storage.getItem(targetKey)).toBeNull();
    expect(storage.getItem(otherKey)).toBe("other");
  });
});

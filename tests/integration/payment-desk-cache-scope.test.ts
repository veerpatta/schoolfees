import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let insideCacheScope = false;

const getFeePolicyForSession = vi.fn(async (sessionLabel: string) => {
  if (insideCacheScope) {
    throw new Error("cookies inside unstable_cache scope");
  }

  return {
    id: null,
    academicSessionLabel: sessionLabel,
  };
});

const getFeePolicySummary = vi.fn(async () => {
  if (insideCacheScope) {
    throw new Error("cookies inside unstable_cache scope");
  }

  return {
    academicSessionLabel: "TEST-2026-27",
    receiptPrefix: "SVP",
    lateFeeLabel: "Flat Rs 1000",
    acceptedPaymentModes: [{ value: "cash", label: "Cash" }],
  };
});

const cacheSafeUnstableCache = vi.fn(
  <Args extends unknown[], Return>(
    callback: (...args: Args) => Promise<Return>,
  ) =>
    async (...args: Args) => {
      insideCacheScope = true;
      try {
        return await callback(...args);
      } finally {
        insideCacheScope = false;
      }
    },
);

const classQuery = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [{ id: "class-1" }], error: null }),
  then: vi.fn((resolve) =>
    resolve({
      data: [
        {
          id: "class-1",
          class_name: "Class 1",
          section: null,
          stream_name: null,
        },
      ],
      error: null,
    }),
  ),
};

const studentIndexQuery = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({
    data: [
      {
        id: "student-1",
        full_name: "Test Student",
        admission_no: "TEST-001",
        class_ref: {
          id: "class-1",
          session_label: "TEST-2026-27",
          class_name: "Class 1",
          section: null,
          stream_name: null,
          status: "active",
        },
      },
    ],
    error: null,
  }),
};

const getCacheSafeClient = vi.fn(async () => ({
  from: vi.fn((table: string) => (table === "students" ? studentIndexQuery : classQuery)),
}));

vi.mock("@/lib/fees/data", () => ({
  getFeePolicyForSession,
  getFeePolicySummary,
}));

vi.mock("@/lib/supabase/cache-safe", () => ({
  cacheSafeUnstableCache,
  getCacheSafeClient,
}));

describe("payment desk cached data scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insideCacheScope = false;
  });

  it("loads fee policy outside the cached readiness check", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getPaymentDeskReadiness } = await import("@/lib/payments/data");

    const readiness = await getPaymentDeskReadiness({
      sessionLabel: "TEST-2026-27",
      staffAppRole: "accountant",
      canWritePayments: true,
    });

    expect(readiness.canPostPayments).toBe(false);
    expect(readiness.blockingReason?.actionHref).toBe("/protected/fee-setup");
    expect(cacheSafeUnstableCache).toHaveBeenCalled();
    expect(getFeePolicyForSession).toHaveBeenCalledWith("TEST-2026-27");
    expect(warn).not.toHaveBeenCalled();
  });

  it("uses the provided session for cached Payment Desk class and student options", async () => {
    const { getPaymentDeskClassOptions, getPaymentDeskStudentIndex } = await import(
      "@/lib/payments/data"
    );

    const [classes, students] = await Promise.all([
      getPaymentDeskClassOptions("TEST-2026-27"),
      getPaymentDeskStudentIndex({ sessionLabel: "TEST-2026-27" }),
    ]);

    expect(classes).toEqual([{ id: "class-1", label: "Class 1" }]);
    expect(students).toEqual([
      {
        id: "student-1",
        fullName: "Test Student",
        admissionNo: "TEST-001",
        classId: "class-1",
        classLabel: "Class 1",
        studentStatus: "active",
      },
    ]);
    expect(getFeePolicySummary).not.toHaveBeenCalled();
  });
});

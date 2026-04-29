import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getFeeSetupPageData = vi.fn();
const createClient = vi.fn();

vi.mock("@/lib/fees/data", () => ({
  getFeeSetupPageData,
}));

vi.mock("@/lib/fees/policy", () => ({
  resolveStudentPolicyBreakdown: vi.fn(() => ({
    lateFeeFlatAmount: 1000,
    breakdown: {
      annualTotal: 12000,
      academicFeeAmount: 500,
      otherAdjustmentAmount: 0,
      discountApplied: 0,
      calculationModel: "workbook_v1",
      coreHeads: [
        { id: "tuition_fee", amount: 11500 },
        { id: "transport_fee", amount: 0 },
      ],
    },
  })),
}));

vi.mock("@/lib/fees/workbook", () => ({
  buildWorkbookInstallmentCharges: vi.fn(() => ({
    installmentCharges: [3000, 3000, 3000, 3000],
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

function queryResult<T>(data: T) {
  return {
    in() {
      return this;
    },
    select() {
      return this;
    },
    then(resolve: (value: { data: T; error: null }) => void) {
      return Promise.resolve({ data, error: null }).then(resolve);
    },
  };
}

const setupData = {
  globalPolicy: {
    academicSessionLabel: "2026-27",
    installmentCount: 4,
    installmentSchedule: [
      { label: "Installment 1", dueDate: "2026-04-20", dueDateLabel: "20 April" },
      { label: "Installment 2", dueDate: "2026-07-20", dueDateLabel: "20 July" },
      { label: "Installment 3", dueDate: "2026-10-20", dueDateLabel: "20 October" },
      { label: "Installment 4", dueDate: "2027-01-20", dueDateLabel: "20 January" },
    ],
  },
  schoolDefault: {},
  classDefaults: [],
  transportDefaults: [],
  studentOverrides: [],
};

describe("ledger generator skip reasons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFeeSetupPageData.mockResolvedValue(setupData);
  });

  it("reports missing class fee instead of silently skipping an active student", async () => {
    createClient.mockResolvedValue({
      from(table: string) {
        if (table === "students") {
          return {
            select: () =>
              queryResult([
                {
                  id: "student-1",
                  admission_no: "PENDING-SR-0001",
                  full_name: "Test Student",
                  class_id: "class-1",
                  transport_route_id: null,
                  status: "active",
                  class_ref: {
                    class_name: "Class 1",
                    section: null,
                    stream_name: null,
                    session_label: "2026-27",
                    status: "active",
                  },
                },
              ]),
          };
        }

        if (table === "installments") {
          return {
            select: () => queryResult([]),
            insert: vi.fn(),
            update: vi.fn(),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    });

    const { generateSessionLedgersAction } = await import("@/lib/fees/generator");
    const result = await generateSessionLedgersAction({ scopedStudentIds: ["student-1"] });

    expect(result.installmentsToInsert).toBe(0);
    expect(result.skippedStudents[0]).toMatchObject({
      studentId: "student-1",
      reasonCode: "CLASS_FEE_MISSING",
      reasonMessage: "Class 1 does not have a fee amount in Fee Setup for 2026-27.",
    });
  });

  it("reports active Fee Setup session mismatch", async () => {
    createClient.mockResolvedValue({
      from(table: string) {
        if (table === "students") {
          return {
            select: () =>
              queryResult([
                {
                  id: "student-2",
                  admission_no: "PENDING-SR-0002",
                  full_name: "Wrong Year Student",
                  class_id: "class-test",
                  transport_route_id: null,
                  status: "active",
                  class_ref: {
                    class_name: "Class 1",
                    section: null,
                    stream_name: null,
                    session_label: "TEST-2026-27",
                    status: "active",
                  },
                },
              ]),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    });

    const { generateSessionLedgersAction } = await import("@/lib/fees/generator");
    const result = await generateSessionLedgersAction({ scopedStudentIds: ["student-2"] });

    expect(result.scopedStudents).toBe(0);
    expect(result.skippedStudents[0]).toMatchObject({
      studentId: "student-2",
      reasonCode: "SESSION_MISMATCH",
      reasonMessage:
        "This student is in TEST-2026-27, but Fee Setup is active for 2026-27.",
    });
  });

  it("missing_route_fee_shows_reason", async () => {
    getFeeSetupPageData.mockResolvedValue({
      ...setupData,
      classDefaults: [
        {
          id: "fee-1",
          classId: "class-1",
          sessionLabel: "2026-27",
          annualTuitionFee: 12000,
        },
      ],
      transportDefaults: [
        {
          id: "route-1",
          routeName: "Route X",
          routeCode: "RX",
          defaultInstallmentAmount: 0,
          annualFeeAmount: null,
          isActive: true,
        },
      ],
    });
    createClient.mockResolvedValue({
      from(table: string) {
        if (table === "students") {
          return {
            select: () =>
              queryResult([
                {
                  id: "student-route",
                  admission_no: "PENDING-SR-0003",
                  full_name: "Route Student",
                  class_id: "class-1",
                  transport_route_id: "route-1",
                  status: "active",
                  class_ref: {
                    class_name: "Class 1",
                    section: null,
                    stream_name: null,
                    session_label: "2026-27",
                    status: "active",
                  },
                },
              ]),
          };
        }

        if (table === "installments") {
          return {
            select: () => queryResult([]),
            insert: vi.fn(),
            update: vi.fn(),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    });

    const { generateSessionLedgersAction } = await import("@/lib/fees/generator");
    const result = await generateSessionLedgersAction({ scopedStudentIds: ["student-route"] });

    expect(result.installmentsToInsert).toBe(0);
    expect(result.skippedStudents[0]).toMatchObject({
      studentId: "student-route",
      reasonCode: "ROUTE_FEE_MISSING",
      reasonMessage: "Route fee is missing for Route X.",
    });
  });
});

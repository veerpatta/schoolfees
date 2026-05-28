import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getFeePolicySummary = vi.fn();
const createClient = vi.fn();
const getStudentDetail = vi.fn();
const getStudentFinancialSnapshot = vi.fn();
const getLedgerPageData = vi.fn();
const getWorkbookInstallmentBalances = vi.fn();

vi.mock("@/lib/fees/data", () => ({
  getFeePolicySummary,
  getStudentFinancialSnapshot: (...args: unknown[]) => getStudentFinancialSnapshot(...args),
}));

vi.mock("@/lib/ledger/data", () => ({
  getLedgerPageData: (...args: unknown[]) => getLedgerPageData(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("@/lib/students/data", () => ({
  getStudentDetail: (...args: unknown[]) => getStudentDetail(...args),
}));

vi.mock("@/lib/workbook/data", () => ({
  getWorkbookInstallmentBalances: (...args: unknown[]) => getWorkbookInstallmentBalances(...args),
}));

type FamilyGroupRow = { id: string; name: string; academic_session_label: string } | null;

function buildSupabaseClient({
  members,
  familyGroup,
}: {
  members: Array<{ student_id: string; academic_session_label: string | null }>;
  familyGroup: FamilyGroupRow;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "student_family_members") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: members, error: null }),
          }),
        };
      }
      if (table === "student_family_groups") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: familyGroup, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getStudentDetail.mockResolvedValue({ id: "s1" });
  getStudentFinancialSnapshot.mockResolvedValue({});
  getLedgerPageData.mockResolvedValue({ selectedStudent: null });
  getWorkbookInstallmentBalances.mockResolvedValue([]);
});

describe("getFamilyWorkspaceData session fallback", () => {
  it("uses the active fee policy session label when the family group row is missing and members have no label", async () => {
    getFeePolicySummary.mockResolvedValue({ academicSessionLabel: "2028-29" });
    createClient.mockResolvedValue(
      buildSupabaseClient({
        members: [{ student_id: "s1", academic_session_label: null }],
        familyGroup: null,
      }),
    );

    const { getFamilyWorkspaceData } = await import("@/lib/students/workspace");
    const result = await getFamilyWorkspaceData("fg-1");

    expect(result.familyGroup.academic_session_label).toBe("2028-29");
    expect(getFeePolicySummary).toHaveBeenCalled();
  });

  it("prefers the member's session label over the active policy label", async () => {
    getFeePolicySummary.mockResolvedValue({ academicSessionLabel: "2028-29" });
    createClient.mockResolvedValue(
      buildSupabaseClient({
        members: [{ student_id: "s1", academic_session_label: "2027-28" }],
        familyGroup: null,
      }),
    );

    const { getFamilyWorkspaceData } = await import("@/lib/students/workspace");
    const result = await getFamilyWorkspaceData("fg-1");

    expect(result.familyGroup.academic_session_label).toBe("2027-28");
    expect(getFeePolicySummary).not.toHaveBeenCalled();
  });

  it("throws WorkspaceContextError when no member label and no active policy label", async () => {
    getFeePolicySummary.mockResolvedValue({ academicSessionLabel: "" });
    createClient.mockResolvedValue(
      buildSupabaseClient({
        members: [{ student_id: "s1", academic_session_label: null }],
        familyGroup: null,
      }),
    );

    const { getFamilyWorkspaceData, WorkspaceContextError } = await import(
      "@/lib/students/workspace"
    );

    await expect(getFamilyWorkspaceData("fg-1")).rejects.toBeInstanceOf(WorkspaceContextError);
  });

  it("does not hardcode 2026-27 anywhere in the resolved fallback", async () => {
    getFeePolicySummary.mockResolvedValue({ academicSessionLabel: "2030-31" });
    createClient.mockResolvedValue(
      buildSupabaseClient({
        members: [{ student_id: "s1", academic_session_label: null }],
        familyGroup: null,
      }),
    );

    const { getFamilyWorkspaceData } = await import("@/lib/students/workspace");
    const result = await getFamilyWorkspaceData("fg-1");

    expect(result.familyGroup.academic_session_label).not.toBe("2026-27");
    expect(result.familyGroup.academic_session_label).toBe("2030-31");
  });
});

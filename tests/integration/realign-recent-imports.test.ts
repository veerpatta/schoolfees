import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const requireStaffPermission = vi.fn();
const prepareDuesForStudentsAutomatically = vi.fn();
const revalidateFinanceSurfaces = vi.fn();

vi.mock("@/lib/supabase/session", () => ({
  requireStaffPermission,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc,
  })),
}));

vi.mock("@/lib/system-sync/finance-sync", () => ({
  prepareDuesForStudentsAutomatically,
  revalidateFinanceSurfaces,
}));

vi.mock("@/lib/students/data", () => ({
  archiveStudent: vi.fn(),
  createStudent: vi.fn(),
  getStudentDeletionSafety: vi.fn(),
  getStudentDetail: vi.fn(),
  getStudentFormOptions: vi.fn(),
  hardDeleteStudent: vi.fn(),
  updateStudent: vi.fn(),
}));

describe("realignRecentImportsToActiveSessionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStaffPermission.mockResolvedValue({ id: "staff-1", appRole: "admin" });
    prepareDuesForStudentsAutomatically.mockResolvedValue({
      readyForPaymentCount: 2,
      duesNeedAttentionCount: 0,
      reasonSummary: null,
    });
  });

  it("moves recent import students and prepares dues", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          moved_count: 2,
          attention_count: 0,
          moved_student_ids: ["student-1", "student-2"],
        },
      ],
      error: null,
    });

    const { realignRecentImportsToActiveSessionAction } = await import(
      "@/app/protected/students/actions"
    );

    const result = await realignRecentImportsToActiveSessionAction();

    expect(requireStaffPermission).toHaveBeenCalledWith("fees:write");
    expect(rpc).toHaveBeenCalledWith("realign_recent_import_students_to_active_session", {
      p_run_by: "staff-1",
    });
    expect(prepareDuesForStudentsAutomatically).toHaveBeenCalledWith({
      studentIds: ["student-1", "student-2"],
      reason: "Recent import session realign",
    });
    expect(revalidateFinanceSurfaces).toHaveBeenCalledWith({
      studentIds: ["student-1", "student-2"],
    });
    expect(result).toEqual({
      movedCount: 2,
      preparedCount: 2,
      attentionCount: 0,
    });
  });

  it("returns a no-op summary when there are no batches to realign", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          moved_count: 0,
          attention_count: 0,
          moved_student_ids: [],
        },
      ],
      error: null,
    });

    const { realignRecentImportsToActiveSessionAction } = await import(
      "@/app/protected/students/actions"
    );

    const result = await realignRecentImportsToActiveSessionAction();

    expect(prepareDuesForStudentsAutomatically).not.toHaveBeenCalled();
    expect(revalidateFinanceSurfaces).not.toHaveBeenCalled();
    expect(result).toEqual({
      movedCount: 0,
      preparedCount: 0,
      attentionCount: 0,
    });
  });
});

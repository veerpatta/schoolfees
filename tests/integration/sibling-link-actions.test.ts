import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type FakeSupabase } from "../helpers/fake-supabase";

vi.mock("server-only", () => ({}));

// These actions now drain the workbook matview refresh queue after the
// response. `after` throws outside a request scope, so run the callback
// inline — the assertions care that the action succeeded, not when the
// drain ran.
vi.mock("next/server", () => ({
  after: (callback: () => unknown) => {
    void callback();
  },
}));

let supabase: FakeSupabase;

const applyThirdChildPolicyForFamilyGroup = vi.fn();
const deactivateAutomaticThirdChildAssignments = vi.fn();
const prepareDuesForStudentsAutomatically = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/platform/supabase/server", () => ({
  createClient: vi.fn(async () => supabase),
}));

vi.mock("@/platform/supabase/session", () => ({
  requireStaffPermission: vi.fn(async () => undefined),
}));

vi.mock("@/modules/fees/data/conventional-discounts", () => ({
  applyThirdChildPolicyForFamilyGroup,
  deactivateAutomaticThirdChildAssignments,
}));

vi.mock("@/modules/system-sync/domain/finance-sync", () => ({
  prepareDuesForStudentsAutomatically,
}));

const { linkSiblingsAction, unlinkSiblingAction } = await import(
  "@/app/protected/students/sibling-actions"
);

const SESSION = "TEST-2026-27";
const INITIAL = { status: "idle", message: null, familyGroupId: null } as const;

function student(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    admission_no: `TEST-${id}`,
    full_name: `TEST ${id}`,
    father_name: "TEST Father",
    primary_phone: "9000000001",
    secondary_phone: null,
    ...overrides,
  };
}

function member(familyGroupId: string, studentId: string, sessionLabel = SESSION, order = 1) {
  return {
    family_group_id: familyGroupId,
    student_id: studentId,
    academic_session_label: sessionLabel,
    sibling_order: order,
    is_policy_candidate: false,
    manual_order_override: false,
    notes: null,
  };
}

function linkForm(studentId: string, siblingIds: string[], sessionLabel = SESSION) {
  const formData = new FormData();
  formData.set("studentId", studentId);
  formData.set("sessionLabel", sessionLabel);
  for (const id of siblingIds) formData.append("siblingStudentIds", id);
  return formData;
}

function membersOf(familyGroupId: string) {
  return (supabase.tables.student_family_members ?? [])
    .filter((row) => row.family_group_id === familyGroupId)
    .map((row) => row.student_id as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  applyThirdChildPolicyForFamilyGroup.mockResolvedValue({
    familyGroupId: "family-1",
    academicSessionLabel: SESSION,
    recipientStudentId: null,
    affectedStudentIds: [],
    memberCount: 0,
    eligibleCount: 0,
    policyConfigured: true,
  });
  deactivateAutomaticThirdChildAssignments.mockResolvedValue([]);
  prepareDuesForStudentsAutomatically.mockResolvedValue({});
});

describe("linkSiblingsAction", () => {
  it("creates a family and links every selected student in one submission", async () => {
    supabase = createFakeSupabase({
      students: [student("a"), student("b"), student("c")],
      student_family_members: [],
      student_family_groups: [],
    });

    const result = await linkSiblingsAction(INITIAL, linkForm("a", ["b", "c"]));

    expect(result.status).toBe("success");
    const familyGroupId = result.familyGroupId as string;
    expect(membersOf(familyGroupId).sort()).toEqual(["a", "b", "c"]);
  });

  it("adds a third sibling to an existing family instead of refusing", async () => {
    supabase = createFakeSupabase({
      students: [student("a"), student("b"), student("c")],
      student_family_groups: [{ id: "family-1", created_at: "2026-04-01T00:00:00Z" }],
      student_family_members: [member("family-1", "a", SESSION, 1), member("family-1", "b", SESSION, 2)],
    });

    const result = await linkSiblingsAction(INITIAL, linkForm("a", ["c"]));

    expect(result.status).toBe("success");
    expect(result.familyGroupId).toBe("family-1");
    expect(membersOf("family-1").sort()).toEqual(["a", "b", "c"]);
  });

  it("merges two families rather than erroring when both students are already linked", async () => {
    // The reported failure: staff had linked a+b from one profile and c+d from
    // another, then could not join the two halves of the same family.
    supabase = createFakeSupabase({
      students: [student("a"), student("b"), student("c"), student("d")],
      student_family_groups: [
        { id: "family-big", created_at: "2026-04-01T00:00:00Z" },
        { id: "family-small", created_at: "2026-05-01T00:00:00Z" },
      ],
      student_family_members: [
        member("family-big", "a", SESSION, 1),
        member("family-big", "b", SESSION, 2),
        member("family-big", "c", SESSION, 3),
        member("family-small", "d", SESSION, 1),
      ],
    });

    const result = await linkSiblingsAction(INITIAL, linkForm("d", ["a"]));

    expect(result.status).toBe("success");
    // The bigger, older group survives; the smaller one is gone entirely.
    expect(result.familyGroupId).toBe("family-big");
    expect(membersOf("family-big").sort()).toEqual(["a", "b", "c", "d"]);
    expect(supabase.tables.student_family_groups.map((row) => row.id)).toEqual(["family-big"]);
    expect(result.message).toContain("merged in");
  });

  it("never repeats a sibling_order inside one family", async () => {
    supabase = createFakeSupabase({
      students: [student("a"), student("b"), student("c"), student("d")],
      student_family_groups: [{ id: "family-1", created_at: "2026-04-01T00:00:00Z" }],
      student_family_members: [member("family-1", "a", SESSION, 1), member("family-1", "b", SESSION, 2)],
    });

    await linkSiblingsAction(INITIAL, linkForm("a", ["c", "d"]));

    const orders = supabase.tables.student_family_members.map((row) => row.sibling_order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("writes a current-session row for members whose only row is from an earlier year", async () => {
    // Without this the 3rd Child Policy counted one child instead of three.
    supabase = createFakeSupabase({
      students: [student("a"), student("b"), student("c")],
      student_family_groups: [{ id: "family-1", created_at: "2025-04-01T00:00:00Z" }],
      student_family_members: [
        member("family-1", "a", "TEST-2025-26", 1),
        member("family-1", "b", "TEST-2025-26", 2),
      ],
    });

    await linkSiblingsAction(INITIAL, linkForm("a", ["c"]));

    const currentSessionMembers = supabase.tables.student_family_members
      .filter((row) => row.academic_session_label === SESSION)
      .map((row) => row.student_id)
      .sort();
    expect(currentSessionMembers).toEqual(["a", "b", "c"]);
  });

  it("recomputes the 3rd Child Policy and reports who received it", async () => {
    supabase = createFakeSupabase({
      students: [student("a"), student("b"), student("c")],
      student_family_members: [],
      student_family_groups: [],
    });
    applyThirdChildPolicyForFamilyGroup.mockImplementation(async (familyGroupId: string) => ({
      familyGroupId,
      academicSessionLabel: SESSION,
      recipientStudentId: "c",
      affectedStudentIds: ["a", "b", "c"],
      memberCount: 3,
      eligibleCount: 3,
      policyConfigured: true,
    }));

    const result = await linkSiblingsAction(INITIAL, linkForm("a", ["b", "c"]));

    expect(applyThirdChildPolicyForFamilyGroup).toHaveBeenCalledWith(result.familyGroupId, {
      academicSessionLabel: SESSION,
    });
    expect(prepareDuesForStudentsAutomatically).toHaveBeenCalledWith(
      expect.objectContaining({ sessionLabel: SESSION }),
    );
    expect(result.message).toContain("3rd Child Policy applied to TEST c");
  });

  it("says why the discount did not apply when the family is still too small", async () => {
    supabase = createFakeSupabase({
      students: [student("a"), student("b")],
      student_family_members: [],
      student_family_groups: [],
    });
    applyThirdChildPolicyForFamilyGroup.mockImplementation(async (familyGroupId: string) => ({
      familyGroupId,
      academicSessionLabel: SESSION,
      recipientStudentId: null,
      affectedStudentIds: ["a", "b"],
      memberCount: 2,
      eligibleCount: 2,
      policyConfigured: true,
    }));

    const result = await linkSiblingsAction(INITIAL, linkForm("a", ["b"]));

    expect(result.message).toContain("needs three siblings");
  });

  it("still accepts the single-select field name", async () => {
    supabase = createFakeSupabase({
      students: [student("a"), student("b")],
      student_family_members: [],
      student_family_groups: [],
    });

    const formData = new FormData();
    formData.set("studentId", "a");
    formData.set("sessionLabel", SESSION);
    formData.set("siblingStudentId", "b");

    const result = await linkSiblingsAction(INITIAL, formData);
    expect(result.status).toBe("success");
  });

  it("rejects a submission with no sibling selected", async () => {
    supabase = createFakeSupabase({ students: [student("a")] });

    const result = await linkSiblingsAction(INITIAL, linkForm("a", []));
    expect(result.status).toBe("error");
    expect(result.message).toContain("at least one");
  });

  it("ignores the student linking to themselves", async () => {
    supabase = createFakeSupabase({ students: [student("a")] });

    const result = await linkSiblingsAction(INITIAL, linkForm("a", ["a"]));
    expect(result.status).toBe("error");
  });
});

describe("unlinkSiblingAction", () => {
  function unlinkForm(studentId: string, familyGroupId: string) {
    const formData = new FormData();
    formData.set("studentId", studentId);
    formData.set("familyGroupId", familyGroupId);
    formData.set("sessionLabel", SESSION);
    return formData;
  }

  it("withdraws the automatic 3rd Child Policy from the student who left", async () => {
    supabase = createFakeSupabase({
      student_family_groups: [{ id: "family-1", created_at: "2026-04-01T00:00:00Z" }],
      student_family_members: [
        member("family-1", "a", SESSION, 1),
        member("family-1", "b", SESSION, 2),
        member("family-1", "c", SESSION, 3),
      ],
    });

    const result = await unlinkSiblingAction({ status: "idle", message: null }, unlinkForm("c", "family-1"));

    expect(result.status).toBe("success");
    expect(deactivateAutomaticThirdChildAssignments).toHaveBeenCalledWith({
      studentIds: ["c"],
      academicSessionLabel: SESSION,
    });
    // Two siblings remain, so the family is recomputed rather than deleted.
    expect(applyThirdChildPolicyForFamilyGroup).toHaveBeenCalledWith("family-1", {
      academicSessionLabel: SESSION,
    });
    expect(supabase.tables.student_family_groups).toHaveLength(1);
  });

  it("withdraws the discount from the last child standing and deletes the group", async () => {
    supabase = createFakeSupabase({
      student_family_groups: [{ id: "family-1", created_at: "2026-04-01T00:00:00Z" }],
      student_family_members: [member("family-1", "a", SESSION, 1), member("family-1", "b", SESSION, 2)],
    });

    await unlinkSiblingAction({ status: "idle", message: null }, unlinkForm("b", "family-1"));

    expect(deactivateAutomaticThirdChildAssignments).toHaveBeenCalledWith({
      studentIds: ["b", "a"],
      academicSessionLabel: SESSION,
    });
    expect(supabase.tables.student_family_groups).toHaveLength(0);
  });

  it("removes the student from every session, not just the current one", async () => {
    supabase = createFakeSupabase({
      student_family_groups: [{ id: "family-1", created_at: "2025-04-01T00:00:00Z" }],
      student_family_members: [
        member("family-1", "a", SESSION, 1),
        member("family-1", "b", SESSION, 2),
        member("family-1", "c", SESSION, 3),
        member("family-1", "c", "TEST-2025-26", 3),
      ],
    });

    await unlinkSiblingAction({ status: "idle", message: null }, unlinkForm("c", "family-1"));

    expect(membersOf("family-1").sort()).toEqual(["a", "b"]);
  });
});

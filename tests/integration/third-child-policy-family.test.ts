import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type FakeSupabase } from "../helpers/fake-supabase";

vi.mock("server-only", () => ({}));

let supabase: FakeSupabase;

vi.mock("@/platform/supabase/admin", () => ({
  createAdminClient: vi.fn(() => supabase),
}));

vi.mock("@/platform/supabase/server", () => ({
  createClient: vi.fn(async () => supabase),
}));

const {
  applyThirdChildPolicyForFamilyGroup,
  deactivateAutomaticThirdChildAssignments,
} = await import("@/lib/fees/conventional-discounts");

const SESSION = "TEST-2026-27";
const THIRD_CHILD_POLICY = {
  id: "policy-third-child",
  academic_session_label: SESSION,
  code: "third_child",
  display_name: "3rd Child Policy",
  calculation_type: "tuition_fixed_amount",
  fixed_tuition_amount: 6000,
  percentage: null,
  is_active: true,
  is_builtin: true,
  sort_order: 3,
  updated_at: null,
};

function classRow(id: string, sortOrder: number, sessionLabel = SESSION) {
  return {
    id,
    session_label: sessionLabel,
    class_name: `Class ${sortOrder}`,
    section: null,
    stream_name: null,
    sort_order: sortOrder,
  };
}

function studentRow(id: string, classId: string, klass: ReturnType<typeof classRow>) {
  return {
    id,
    admission_no: `TEST-${id}`,
    full_name: `TEST ${id}`,
    status: "active",
    class_id: classId,
    class_ref: klass,
  };
}

function memberRow(studentId: string, sessionLabel: string, order: number) {
  return {
    family_group_id: "family-1",
    student_id: studentId,
    academic_session_label: sessionLabel,
    sibling_order: order,
    is_policy_candidate: false,
    manual_order_override: false,
  };
}

const classes = {
  nursery: classRow("class-nursery", 1),
  five: classRow("class-5", 5),
  ten: classRow("class-10", 10),
};

function baseTables(memberRows: Array<ReturnType<typeof memberRow>>) {
  return {
    conventional_discount_policies: [THIRD_CHILD_POLICY],
    student_family_groups: [{ id: "family-1", academic_session_label: SESSION }],
    student_family_members: memberRows,
    students: [
      studentRow("a", "class-10", classes.ten),
      studentRow("b", "class-5", classes.five),
      studentRow("c", "class-nursery", classes.nursery),
    ],
    fee_settings: [
      { class_id: "class-nursery", tuition_fee_amount: 20000, is_active: true },
      { class_id: "class-5", tuition_fee_amount: 30000, is_active: true },
      { class_id: "class-10", tuition_fee_amount: 38000, is_active: true },
    ],
    student_conventional_discount_assignments: [],
  };
}

function activeThirdChildStudentIds() {
  return (supabase.tables.student_conventional_discount_assignments ?? [])
    .filter((row) => row.policy_id === THIRD_CHILD_POLICY.id && row.is_active === true)
    .map((row) => row.student_id as string);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("applyThirdChildPolicyForFamilyGroup", () => {
  it("gives the discount to the sibling in the lowest class once three are linked", async () => {
    supabase = createFakeSupabase(
      baseTables([memberRow("a", SESSION, 1), memberRow("b", SESSION, 2), memberRow("c", SESSION, 3)]),
    );

    const result = await applyThirdChildPolicyForFamilyGroup("family-1", {
      academicSessionLabel: SESSION,
    });

    expect(result?.recipientStudentId).toBe("c");
    expect(result?.eligibleCount).toBe(3);
    expect(activeThirdChildStudentIds()).toEqual(["c"]);
    const assignment = supabase.tables.student_conventional_discount_assignments[0];
    expect(assignment.before_tuition_amount).toBe(20000);
    expect(assignment.resulting_tuition_amount).toBe(6000);
    expect(assignment.family_group_id).toBe("family-1");
  });

  it("counts siblings whose membership row was written in an earlier session", async () => {
    // The regression: session-filtering the membership read made a family of
    // three look like a family of one, so the discount silently never applied.
    supabase = createFakeSupabase(
      baseTables([
        memberRow("a", "TEST-2025-26", 1),
        memberRow("b", "TEST-2025-26", 2),
        memberRow("c", SESSION, 3),
      ]),
    );

    const result = await applyThirdChildPolicyForFamilyGroup("family-1", {
      academicSessionLabel: SESSION,
    });

    expect(result?.memberCount).toBe(3);
    expect(result?.recipientStudentId).toBe("c");
    expect(activeThirdChildStudentIds()).toEqual(["c"]);
  });

  it("leaves a two-child family alone and says how many are eligible", async () => {
    supabase = createFakeSupabase(
      baseTables([memberRow("a", SESSION, 1), memberRow("b", SESSION, 2)]),
    );

    const result = await applyThirdChildPolicyForFamilyGroup("family-1", {
      academicSessionLabel: SESSION,
    });

    expect(result?.recipientStudentId).toBeNull();
    expect(result?.eligibleCount).toBe(2);
    expect(activeThirdChildStudentIds()).toEqual([]);
  });

  it("does not count a sibling enrolled in a different session's class", async () => {
    const tables = baseTables([
      memberRow("a", SESSION, 1),
      memberRow("b", SESSION, 2),
      memberRow("c", SESSION, 3),
    ]);
    tables.students = [
      studentRow("a", "class-10", classes.ten),
      studentRow("b", "class-5", classes.five),
      studentRow("c", "class-nursery", classRow("class-nursery", 1, "TEST-2025-26")),
    ];
    supabase = createFakeSupabase(tables);

    const result = await applyThirdChildPolicyForFamilyGroup("family-1", {
      academicSessionLabel: SESSION,
    });

    expect(result?.eligibleCount).toBe(2);
    expect(result?.recipientStudentId).toBeNull();
  });

  it("moves the discount when a younger sibling joins the family", async () => {
    supabase = createFakeSupabase(
      baseTables([memberRow("a", SESSION, 1), memberRow("b", SESSION, 2), memberRow("c", SESSION, 3)]),
    );
    supabase.tables.student_conventional_discount_assignments.push({
      id: "assignment-b",
      student_id: "b",
      policy_id: THIRD_CHILD_POLICY.id,
      academic_session_label: SESSION,
      is_active: true,
      is_manual_override: false,
      family_group_id: "family-1",
      before_tuition_amount: 30000,
      resulting_tuition_amount: 6000,
    });

    await applyThirdChildPolicyForFamilyGroup("family-1", { academicSessionLabel: SESSION });

    expect(activeThirdChildStudentIds()).toEqual(["c"]);
  });

  it("reports a session with no third_child policy instead of failing silently", async () => {
    const tables = baseTables([memberRow("a", SESSION, 1), memberRow("b", SESSION, 2)]);
    tables.conventional_discount_policies = [];
    supabase = createFakeSupabase(tables);

    const result = await applyThirdChildPolicyForFamilyGroup("family-1", {
      academicSessionLabel: SESSION,
    });

    expect(result?.policyConfigured).toBe(false);
    expect(result?.recipientStudentId).toBeNull();
  });
});

describe("deactivateAutomaticThirdChildAssignments", () => {
  it("turns off the automatic discount but leaves a manual override alone", async () => {
    supabase = createFakeSupabase({
      conventional_discount_policies: [THIRD_CHILD_POLICY],
      student_conventional_discount_assignments: [
        {
          id: "auto",
          student_id: "c",
          policy_id: THIRD_CHILD_POLICY.id,
          academic_session_label: SESSION,
          is_active: true,
          is_manual_override: false,
        },
        {
          id: "manual",
          student_id: "d",
          policy_id: THIRD_CHILD_POLICY.id,
          academic_session_label: SESSION,
          is_active: true,
          is_manual_override: true,
        },
      ],
    });

    const affected = await deactivateAutomaticThirdChildAssignments({
      studentIds: ["c", "d"],
      academicSessionLabel: SESSION,
    });

    expect(affected).toEqual(["c"]);
    expect(activeThirdChildStudentIds()).toEqual(["d"]);
  });

  it("is a no-op when the session has no third_child policy", async () => {
    supabase = createFakeSupabase({
      conventional_discount_policies: [],
      student_conventional_discount_assignments: [],
    });

    await expect(
      deactivateAutomaticThirdChildAssignments({ studentIds: ["c"], academicSessionLabel: SESSION }),
    ).resolves.toEqual([]);
  });
});

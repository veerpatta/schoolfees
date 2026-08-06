import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Recorded = { table: string; op: string; payload: unknown; match?: unknown };

const recorded: Recorded[] = [];
/** Students that already have an active fee-override row. */
let existingOverrideFor = new Set<string>();
/** Classes that have an active fee setting. */
let activeFeeSettingClasses = new Set<string>(["class-1"]);

const studentClass = new Map([
  ["s-1", "class-1"],
  ["s-2", "class-1"],
  ["s-3", "class-no-fees"],
]);

function builder(table: string) {
  const state: { op: string; payload: unknown; filters: Record<string, unknown> } = {
    op: "select",
    payload: null,
    filters: {},
  };

  const api: Record<string, unknown> = {
    select() {
      state.op = "select";
      return api;
    },
    update(payload: unknown) {
      state.op = "update";
      state.payload = payload;
      return api;
    },
    async insert(payload: unknown) {
      recorded.push({ table, op: "insert", payload });
      return { error: null };
    },
    eq(column: string, value: unknown) {
      state.filters[column] = value;
      return api;
    },
    in(column: string, values: unknown) {
      state.filters[column] = values;
      return api;
    },
    limit() {
      return api;
    },
  };

  // Terminal await support for select/update chains.
  (api as { then: unknown }).then = (resolve: (value: unknown) => void) => {
    if (state.op === "update") {
      recorded.push({ table, op: "update", payload: state.payload, match: state.filters });
      return resolve({ error: null });
    }

    if (table === "students") {
      const ids = (state.filters.id as string[]) ?? [];
      return resolve({
        data: ids.map((id) => ({ id, class_id: studentClass.get(id) ?? "class-1" })),
        error: null,
      });
    }

    if (table === "fee_settings") {
      const classIds = (state.filters.class_id as string[]) ?? [];
      return resolve({
        data: classIds
          .filter((classId) => activeFeeSettingClasses.has(classId))
          .map((classId) => ({ id: `fee-${classId}`, class_id: classId })),
        error: null,
      });
    }

    if (table === "student_fee_overrides") {
      const studentId = state.filters.student_id as string;
      return resolve({
        data: existingOverrideFor.has(studentId) ? [{ id: `ovr-${studentId}` }] : [],
        error: null,
      });
    }

    return resolve({ data: [], error: null });
  };

  return api;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: (table: string) => builder(table) })),
}));

function row(studentId: string, changes: unknown[], admissionNo = `SVP-${studentId}`) {
  return {
    sheetRow: 2,
    studentId,
    admissionNo,
    fullName: "Student",
    changes,
    errors: [],
  } as never;
}

const typeChange = (value: string) => ({
  fieldKey: "studentType",
  header: "New/Old",
  fromLabel: "Existing",
  toLabel: "New",
  toValue: value,
  column: "student_type_override",
  target: "feeOverride" as const,
  affectsFees: true,
});

const phoneChange = {
  fieldKey: "fatherPhone",
  header: "Father phone",
  fromLabel: "—",
  toLabel: "9829000001",
  toValue: "9829000001",
  column: "primary_phone",
  target: "students" as const,
  affectsFees: false,
};

describe("bulk update of the New/Old flag", () => {
  beforeEach(() => {
    recorded.length = 0;
    existingOverrideFor = new Set();
    activeFeeSettingClasses = new Set(["class-1"]);
    vi.clearAllMocks();
  });

  it("updates the existing fee-override row rather than inserting a second one", async () => {
    const { applyBulkUpdate } = await import("@/lib/students/bulk-update/data");
    existingOverrideFor = new Set(["s-1"]);

    const outcome = await applyBulkUpdate([row("s-1", [typeChange("new")])]);

    const writes = recorded.filter((entry) => entry.table === "student_fee_overrides");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.op).toBe("update");
    expect(writes[0]!.payload).toMatchObject({ student_type_override: "new" });
    expect(outcome.updatedStudentCount).toBe(1);
  });

  it("creates a fee-override row, with a reason, when the student has none", async () => {
    const { applyBulkUpdate } = await import("@/lib/students/bulk-update/data");

    const outcome = await applyBulkUpdate([row("s-1", [typeChange("new")])]);

    const insert = recorded.find(
      (entry) => entry.table === "student_fee_overrides" && entry.op === "insert",
    );
    expect(insert).toBeDefined();
    expect(insert!.payload).toMatchObject({
      student_id: "s-1",
      fee_setting_id: "fee-class-1",
      student_type_override: "new",
      is_active: true,
    });
    // reason is NOT NULL on the table; an insert without it would throw.
    expect((insert!.payload as { reason?: string }).reason).toBeTruthy();
    expect(outcome.updatedStudentCount).toBe(1);
  });

  it("reports a clear failure when the class has no active fee setting", async () => {
    const { applyBulkUpdate } = await import("@/lib/students/bulk-update/data");

    const outcome = await applyBulkUpdate([row("s-3", [typeChange("new")], "SVP-003")]);

    expect(outcome.updatedStudentCount).toBe(0);
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0]!.message).toMatch(/Fee Setup/i);
    expect(
      recorded.some((entry) => entry.table === "student_fee_overrides" && entry.op === "insert"),
    ).toBe(false);
  });

  it("splits a mixed row across both tables", async () => {
    const { applyBulkUpdate } = await import("@/lib/students/bulk-update/data");
    existingOverrideFor = new Set(["s-2"]);

    const outcome = await applyBulkUpdate([row("s-2", [phoneChange, typeChange("new")])]);

    expect(
      recorded.find((entry) => entry.table === "students" && entry.op === "update")?.payload,
    ).toEqual({ primary_phone: "9829000001" });
    expect(
      recorded.find((entry) => entry.table === "student_fee_overrides" && entry.op === "update")
        ?.payload,
    ).toMatchObject({ student_type_override: "new" });
    // One student, two fields.
    expect(outcome.updatedStudentCount).toBe(1);
    expect(outcome.updatedFieldCount).toBe(2);
  });

  it("does not touch fee_settings when no fee-profile field is in play", async () => {
    const { applyBulkUpdate } = await import("@/lib/students/bulk-update/data");

    await applyBulkUpdate([row("s-1", [phoneChange])]);

    expect(recorded.some((entry) => entry.table === "student_fee_overrides")).toBe(false);
  });
});

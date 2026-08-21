import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type UpdateCall = { patch: Record<string, unknown>; id: string };

const updateCalls: UpdateCall[] = [];
let failFor = new Set<string>();
let inFlight = 0;
let peakInFlight = 0;

const supabaseStub = {
  from() {
    return {
      update(patch: Record<string, unknown>) {
        return {
          async eq(_column: string, id: string) {
            inFlight += 1;
            peakInFlight = Math.max(peakInFlight, inFlight);
            // Yield so overlapping calls are actually observable.
            await new Promise((resolve) => setTimeout(resolve, 1));
            inFlight -= 1;

            updateCalls.push({ patch, id });

            return failFor.has(id) ? { error: { message: "row locked" } } : { error: null };
          },
        };
      },
    };
  },
};

vi.mock("@/platform/supabase/server", () => ({
  createClient: vi.fn(async () => supabaseStub),
}));

function row(overrides: Partial<import("@/modules/students/domain/bulk-update/diff").BulkUpdateRowResult>) {
  return {
    sheetRow: 2,
    studentId: "s-1",
    admissionNo: "SVP-001",
    fullName: "Aarav",
    changes: [],
    errors: [],
    ...overrides,
  } as import("@/modules/students/domain/bulk-update/diff").BulkUpdateRowResult;
}

function change(
  column: string,
  toValue: string | null,
  affectsFees = false,
  target: "students" | "feeOverride" = "students",
) {
  return {
    fieldKey: column,
    header: column,
    fromLabel: "—",
    toLabel: toValue ?? "—",
    toValue,
    column,
    target,
    affectsFees,
  };
}

describe("applyBulkUpdate", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    failFor = new Set();
    inFlight = 0;
    peakInFlight = 0;
    vi.clearAllMocks();
  });

  it("writes every changed column for a student in one statement", async () => {
    const { applyBulkUpdate } = await import("@/modules/students/data/bulk-update/data");

    const outcome = await applyBulkUpdate([
      row({
        studentId: "s-1",
        changes: [change("primary_phone", "9829000001"), change("transport_route_id", null, true)],
      }),
    ]);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toEqual({
      id: "s-1",
      patch: { primary_phone: "9829000001", transport_route_id: null },
    });
    expect(outcome.updatedStudentCount).toBe(1);
    expect(outcome.updatedFieldCount).toBe(2);
  });

  it("never writes a row that carries an error", async () => {
    const { applyBulkUpdate } = await import("@/modules/students/data/bulk-update/data");

    const outcome = await applyBulkUpdate([
      row({
        studentId: "s-1",
        changes: [change("primary_phone", "9829000001")],
        errors: ["Transport route: Route \"X\" was not found."],
      }),
      row({ studentId: null, admissionNo: "SVP-999", errors: ["no match"] }),
      row({ studentId: "s-2", changes: [] }),
    ]);

    expect(updateCalls).toHaveLength(0);
    expect(outcome.updatedStudentCount).toBe(0);
  });

  it("collects per-student failures instead of aborting the whole run", async () => {
    const { applyBulkUpdate } = await import("@/modules/students/data/bulk-update/data");
    failFor = new Set(["s-2"]);

    const outcome = await applyBulkUpdate([
      row({ studentId: "s-1", admissionNo: "SVP-001", changes: [change("notes", "a")] }),
      row({ studentId: "s-2", admissionNo: "SVP-002", changes: [change("notes", "b")] }),
      row({ studentId: "s-3", admissionNo: "SVP-003", changes: [change("notes", "c")] }),
    ]);

    expect(outcome.updatedStudentCount).toBe(2);
    expect(outcome.failures).toEqual([{ admissionNo: "SVP-002", message: "row locked" }]);
  });

  // The staged import commits strictly one row at a time, which is what pushed a
  // 531-row file past the 300s function ceiling. This path must overlap.
  it("applies rows concurrently rather than one at a time", async () => {
    const { applyBulkUpdate } = await import("@/modules/students/data/bulk-update/data");

    const rows = Array.from({ length: 60 }, (_, index) =>
      row({
        sheetRow: index + 2,
        studentId: `s-${index}`,
        admissionNo: `SVP-${index}`,
        changes: [change("notes", `note-${index}`)],
      }),
    );

    const outcome = await applyBulkUpdate(rows);

    expect(outcome.updatedStudentCount).toBe(60);
    expect(updateCalls).toHaveLength(60);
    expect(peakInFlight).toBeGreaterThan(1);
    // ...but stays bounded, so a big class never floods the connection pool.
    expect(peakInFlight).toBeLessThanOrEqual(20);
  });

  it("does nothing when there is nothing to apply", async () => {
    const { applyBulkUpdate } = await import("@/modules/students/data/bulk-update/data");

    const outcome = await applyBulkUpdate([]);

    expect(outcome).toEqual({ updatedStudentCount: 0, updatedFieldCount: 0, failures: [] });
    expect(updateCalls).toHaveLength(0);
  });
});

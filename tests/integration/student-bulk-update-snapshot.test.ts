import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Query = { table: string; filters: Record<string, unknown> };

const queries: Query[] = [];

/** Every student on the books, including ones who have left. */
const ALL_STUDENTS = [
  { id: "s-1", admission_no: "2682", full_name: "AISHWARYA RAO", status: "active" },
  { id: "s-2", admission_no: "2590", full_name: "KRISHANPAL TELI", status: "left" },
  { id: "s-3", admission_no: "2660", full_name: "BHANUPRATAP", status: "active" },
  { id: "s-4", admission_no: "2406", full_name: "PRIYANKA TAILOR", status: "left" },
];

function fill(row: (typeof ALL_STUDENTS)[number]) {
  return {
    ...row,
    primary_phone: null,
    secondary_phone: null,
    father_name: null,
    mother_name: null,
    email: null,
    date_of_birth: null,
    address: null,
    class_id: "class-1",
    transport_route_id: null,
    notes: null,
  };
}

function builder(table: string) {
  const filters: Record<string, unknown> = {};

  const api: Record<string, unknown> = {
    select: () => api,
    eq(column: string, value: unknown) {
      filters[column] = value;
      return api;
    },
    in(column: string, value: unknown) {
      filters[column] = value;
      return api;
    },
    order: () => api,
  };

  (api as { then: unknown }).then = (resolve: (value: unknown) => void) => {
    queries.push({ table, filters });

    if (table === "students") {
      const rows = ALL_STUDENTS.filter(
        (row) => !("status" in filters) || row.status === filters.status,
      ).map(fill);
      return resolve({ data: rows, error: null });
    }

    return resolve({ data: [], error: null });
  };

  return api;
}

vi.mock("@/platform/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: (table: string) => builder(table) })),
}));

describe("bulk update snapshot", () => {
  beforeEach(() => {
    queries.length = 0;
    vi.clearAllMocks();
  });

  // A withdrawn student keeps their old class_id, so an unfiltered Nursery
  // download listed six children who had left the school.
  it("includes only active students", async () => {
    const { loadBulkUpdateSnapshot } = await import("@/modules/students/data/bulk-update/data");

    const snapshot = await loadBulkUpdateSnapshot(["class-1"]);

    expect(snapshot.map((student) => student.fullName)).toEqual([
      "AISHWARYA RAO",
      "BHANUPRATAP",
    ]);
    expect(snapshot.map((student) => student.admissionNo)).not.toContain("2590");
  });

  it("asks the database for active students rather than filtering after the fact", async () => {
    const { loadBulkUpdateSnapshot } = await import("@/modules/students/data/bulk-update/data");

    await loadBulkUpdateSnapshot(["class-1"]);

    const studentQuery = queries.find((query) => query.table === "students");
    expect(studentQuery?.filters.status).toBe("active");
    expect(studentQuery?.filters.class_id).toEqual(["class-1"]);
  });

  it("returns names A-Z, not in SR order", async () => {
    const { loadBulkUpdateSnapshot } = await import("@/modules/students/data/bulk-update/data");

    const snapshot = await loadBulkUpdateSnapshot(["class-1"]);

    expect(snapshot.map((student) => student.fullName)).toEqual(
      [...snapshot.map((student) => student.fullName)].sort((a, b) => a.localeCompare(b)),
    );
  });

  it("does no work at all when no class is selected", async () => {
    const { loadBulkUpdateSnapshot } = await import("@/modules/students/data/bulk-update/data");

    expect(await loadBulkUpdateSnapshot([])).toEqual([]);
    expect(queries).toHaveLength(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("server-only", () => ({}));

const selectedStudentId = "22222222-2222-4222-8222-222222222222";

function studentRow(id: string, fullName: string) {
  return {
    id,
    full_name: fullName,
    admission_no: `TEST-${id.slice(0, 4)}`,
    class_ref: {
      class_name: "Class 1",
      section: "A",
      stream_name: null,
    },
  };
}

function createLedgerClient() {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};

      const query = {
        select: vi.fn(() => query),
        in: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        or: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          filters[column] = value;
          return query;
        }),
        maybeSingle: vi.fn(async () => {
          if (table === "students" && filters.id === selectedStudentId) {
            return { data: studentRow(selectedStudentId, "TEST Selected Student"), error: null };
          }

          return { data: null, error: null };
        }),
        then: (
          resolve: (value: { data: unknown[]; error: null }) => void,
          reject: (reason?: unknown) => void,
        ) => {
          try {
            if (table === "students") {
              resolve({
                data: [
                  studentRow("11111111-1111-4111-8111-111111111111", "TEST First Student"),
                ],
                error: null,
              });
              return;
            }

            resolve({ data: [], error: null });
          } catch (error) {
            reject(error);
          }
        },
      };

      return query;
    },
  };
}

describe("ledger selected student scope", () => {
  beforeEach(() => {
    vi.resetModules();
    createClient.mockResolvedValue(createLedgerClient());
  });

  it("loads the requested student ledger even when the student is outside the selector page", async () => {
    const { getLedgerPageData } = await import("@/lib/ledger/data");

    const data = await getLedgerPageData({
      searchQuery: "",
      studentId: selectedStudentId,
      entryFilter: "all",
      entryQuery: "",
    });

    expect(data.selectedStudent).toMatchObject({
      id: selectedStudentId,
      fullName: "TEST Selected Student",
      payments: [],
      adjustments: [],
    });
    expect(data.studentOptions.map((student) => student.id)).toContain(selectedStudentId);
  });
});

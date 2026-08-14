import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Both student-list passes must apply the same scope.
 *
 * The Students workspace loads in two hops: `getStudentsIdentityPage` for names
 * and classes, then `getStudentsPage` for the money. The client renders the
 * first and then OVERWRITES the list *and the header count* with the second.
 *
 * Segments were wired into the identity pass only. So picking "Never paid"
 * filtered the list for about 60 milliseconds, and then the financial pass
 * answered with the unfiltered roll and put all 509 students back. From the
 * office it looked like the filters did nothing at all — which is exactly how
 * it was reported.
 *
 * A test that only exercised one pass would still have passed. This one asserts
 * on both, and on the fact that they scope identically.
 */

const getStudentDirectoryIds = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/segments/directory", () => ({
  getStudentDirectoryIds: (...args: unknown[]) => getStudentDirectoryIds(...args),
  getStudentSegmentCounts: vi.fn(),
  getStudentDirectorySummary: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

type Call = { method: string; args: unknown[] };

const calls: Call[] = [];

function builder(result: { data: unknown; error: unknown; count?: number }) {
  const chain: Record<string, unknown> = {};
  for (const method of [
    "select",
    "eq",
    "in",
    "gt",
    "ilike",
    "like",
    "or",
    "order",
    "range",
    "overlaps",
    "limit",
    "abortSignal",
  ]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve(result);
  chain.single = () => Promise.resolve(result);
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => builder({ data: [], error: null, count: 0 }),
  })),
}));

const SESSION = "TEST-2026-27";

const FILTERS = {
  query: "",
  sessionLabel: SESSION,
  classId: "",
  transportRouteId: "",
  status: "active" as const,
  segments: [],
  sort: "name" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  getStudentDirectoryIds.mockResolvedValue({
    studentIds: ["student-a", "student-b"],
    totalCount: 2,
  });
});

/** The `.in("id", [...])` the directory scope produces, if any. */
function idScope() {
  return calls.find((call) => call.method === "in" && call.args[0] === "id");
}

describe("student list segment scope", () => {
  it("the identity pass scopes by the directory", async () => {
    const { getStudentsIdentityPage } = await import("@/lib/students/data");
    await getStudentsIdentityPage(
      { ...FILTERS, segments: ["neverPaid"] },
      { page: 1, pageSize: 40 },
    );

    expect(getStudentDirectoryIds).toHaveBeenCalledTimes(1);
    expect(idScope()?.args[1]).toEqual(["student-a", "student-b"]);
  });

  it("the financial pass scopes by the directory too", async () => {
    // The regression. This pass answers second and wins, so a segment filter
    // that it ignores is a segment filter the user never sees applied.
    const { getStudentsPage } = await import("@/lib/students/data");
    await getStudentsPage({ ...FILTERS, segments: ["neverPaid"] }, { page: 1, pageSize: 40 });

    expect(getStudentDirectoryIds).toHaveBeenCalledTimes(1);
    expect(idScope()?.args[1]).toEqual(["student-a", "student-b"]);
  });

  it("both passes ask the directory for the same scope", async () => {
    const { getStudentsIdentityPage, getStudentsPage } = await import("@/lib/students/data");
    const filters = { ...FILTERS, segments: ["overdue" as const, "onTransport" as const] };

    await getStudentsIdentityPage(filters, { page: 1, pageSize: 40 });
    const identityArgs = getStudentDirectoryIds.mock.calls[0][0];

    getStudentDirectoryIds.mockClear();
    await getStudentsPage(filters, { page: 1, pageSize: 40 });
    const financialArgs = getStudentDirectoryIds.mock.calls[0][0];

    expect(financialArgs).toEqual(identityArgs);
  });

  it("search goes through the directory on both passes, not ilike(full_name)", async () => {
    // The server used to match full_name only while the placeholder promised
    // "name, SR no, or phone", so an SR number matched in the optimistic
    // client pass and then vanished when the server answered.
    const { getStudentsIdentityPage, getStudentsPage } = await import("@/lib/students/data");

    for (const load of [getStudentsIdentityPage, getStudentsPage]) {
      calls.length = 0;
      getStudentDirectoryIds.mockClear();
      await load({ ...FILTERS, query: "2261" }, { page: 1, pageSize: 40 });

      expect(getStudentDirectoryIds).toHaveBeenCalledTimes(1);
      expect(calls.some((call) => call.method === "ilike")).toBe(false);
      expect(idScope()).toBeTruthy();
    }
  });

  it("stays out of the way when nothing is filtered", async () => {
    const { getStudentsPage } = await import("@/lib/students/data");
    await getStudentsPage(FILTERS, { page: 1, pageSize: 40 });

    expect(getStudentDirectoryIds).not.toHaveBeenCalled();
    expect(idScope()).toBeUndefined();
  });
});

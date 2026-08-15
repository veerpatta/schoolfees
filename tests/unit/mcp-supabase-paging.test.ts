import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Paging tests for the MCP's only HTTP layer.
 *
 * These exist because the two bugs they pin were invisible to every other test:
 * the mocked tool tests assert on payload shape, and a read that silently
 * restarts at row 0 produces a perfectly well-shaped payload of the wrong rows.
 */

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://schoolfees.test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

async function loadSupabase() {
  const path = new URL("../../workers/schoolfees-mcp/src/supabase.mjs", import.meta.url).href;
  return import(path);
}

type Call = { limit: string | null; offset: string | null; prefer: string | null };

/**
 * Serves `total` synthetic rows, honouring limit/offset the way PostgREST does,
 * and records every request so a test can assert on round-trip count.
 */
function installRestMock(total: number, { withCount = true } = {}) {
  const calls: Call[] = [];

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");
    const prefer = (init?.headers as Record<string, string> | undefined)?.prefer ?? null;
    calls.push({ limit, offset, prefer });

    const from = Number(offset ?? 0);
    const size = Number(limit ?? total);
    const rows = [];
    for (let i = from; i < Math.min(from + size, total); i += 1) rows.push({ id: i });

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (withCount && prefer === "count=exact") {
      headers["content-range"] = `${from}-${from + rows.length - 1}/${total}`;
    }

    return new Response(JSON.stringify(rows), { status: 200, headers });
  });

  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("selectAll paging", () => {
  it("starts from a caller-supplied offset instead of restarting at zero", async () => {
    const calls = installRestMock(100);
    const { selectAll } = await loadSupabase();

    const { rows } = await selectAll(env, "v_student_directory", { limit: 10, offset: 40 });

    // The bug: `offset: rows.length` was spread after the caller's params and
    // won, so every cursor page re-served page one while pageInfo advertised a
    // next cursor that could never advance.
    expect(rows.map((row: { id: number }) => row.id)).toEqual([40, 41, 42, 43, 44, 45, 46, 47, 48, 49]);
    expect(calls[0].offset).toBe("40");
  });

  it("reports truncation from the exact count, in a single request", async () => {
    const calls = installRestMock(500);
    const { selectAll } = await loadSupabase();

    const { rows, truncated, totalCount } = await selectAll(env, "receipts", { limit: 1 });

    expect(rows).toHaveLength(1);
    expect(totalCount).toBe(500);
    expect(truncated).toBe(true);
    // Was two: one for the row, one to probe whether a second existed. Nine
    // single-row lookups paid that on every call.
    expect(calls).toHaveLength(1);
  });

  it("does not call a complete read truncated", async () => {
    installRestMock(7);
    const { selectAll } = await loadSupabase();

    const { rows, truncated } = await selectAll(env, "classes", {});

    expect(rows).toHaveLength(7);
    expect(truncated).toBe(false);
  });

  it("pages through a set larger than one page and stops exactly at the end", async () => {
    const calls = installRestMock(2300);
    const { selectAll } = await loadSupabase();

    const { rows, truncated, totalCount } = await selectAll(env, "v_workbook_installment_balances", {});

    expect(rows).toHaveLength(2300);
    expect(totalCount).toBe(2300);
    expect(truncated).toBe(false);
    expect(calls.map((call) => call.offset)).toEqual(["0", "1000", "2000"]);
    // Only the first page asks for the count.
    expect(calls.filter((call) => call.prefer === "count=exact")).toHaveLength(1);
  });

  it("still warns when the count header is missing and the cap was filled", async () => {
    installRestMock(50, { withCount: false });
    const { selectAll } = await loadSupabase();

    const { rows, truncated, totalCount } = await selectAll(env, "odd_view", { limit: 10 });

    // No count to reason from, so a full cap must err towards saying so rather
    // than towards a short answer that looks complete.
    expect(rows).toHaveLength(10);
    expect(totalCount).toBeNull();
    expect(truncated).toBe(true);
  });
});

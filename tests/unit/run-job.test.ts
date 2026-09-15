import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The contract under test: **a job that cannot record a `job_runs` row must not
 * run.** Everything else here follows from that — the row is written before the
 * work starts so a crash still leaves evidence, it is updated once at the end,
 * and an error is recorded before it is re-thrown so the row is right even if
 * the throw is swallowed upstream.
 */

const insertResult = { data: { id: "run-1" }, error: null as { message: string } | null };
const updates: Array<Record<string, unknown>> = [];

const from = vi.fn(() => ({
  insert: vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => insertResult),
    })),
  })),
  update: vi.fn((values: Record<string, unknown>) => {
    updates.push(values);
    return { eq: vi.fn(async () => ({ error: null })) };
  }),
}));

vi.mock("@/platform/supabase/admin", () => ({
  createAdminClient: () => ({ from }),
}));

vi.mock("@/platform/observability/log", () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { runJob } from "@/platform/jobs/run-job";

beforeEach(() => {
  updates.length = 0;
  insertResult.data = { id: "run-1" };
  insertResult.error = null;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runJob", () => {
  it("records a succeeded run and returns the job's value", async () => {
    const result = await runJob({ name: "nightly_backup" }, async () => "done");

    expect(result).toBe("done");
    expect(from).toHaveBeenCalledWith("job_runs");

    const final = updates.at(-1);
    expect(final).toMatchObject({ status: "succeeded", error: null });
    expect(final?.finished_at).toBeTruthy();
  });

  it("refuses to run at all when the row cannot be written", async () => {
    insertResult.error = { message: "relation job_runs does not exist" };
    insertResult.data = null as unknown as { id: string };

    const work = vi.fn();

    await expect(runJob({ name: "nightly_backup" }, work)).rejects.toThrow(
      /Refusing to run nightly_backup/,
    );

    // The point of the contract: the work did not happen.
    expect(work).not.toHaveBeenCalled();
  });

  it("records a failure, reports it to Sentry, and re-throws", async () => {
    const boom = new Error("dump failed");

    await expect(
      runJob({ name: "nightly_backup" }, async () => {
        throw boom;
      }),
    ).rejects.toThrow(boom);

    const final = updates.at(-1);
    expect(final).toMatchObject({ status: "failed", error: "dump failed" });

    expect(captureException).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({ tags: expect.objectContaining({ job: "nightly_backup" }) }),
    );
  });

  /**
   * The routes answer 207 or 500 with their own bodies for handled failures.
   * ctx.fail records that honestly without changing what the caller receives —
   * otherwise job_runs becomes a list of jobs that all went fine.
   */
  it("marks a run failed via ctx.fail without throwing", async () => {
    const response = await runJob({ name: "nightly_backup" }, async (ctx) => {
      ctx.fail("Dump incomplete: payments");
      return "partial";
    });

    expect(response).toBe("partial");

    const final = updates.at(-1);
    expect(final).toMatchObject({
      status: "failed",
      error: "Dump incomplete: payments",
    });
  });

  it("carries progress and details onto the row", async () => {
    await runJob({ name: "auto_day_close" }, async (ctx) => {
      await ctx.progress(27);
      ctx.detail({ targetDate: "2026-09-15" });
    });

    expect(updates.some((u) => u.items_processed === 27)).toBe(true);

    const final = updates.at(-1);
    expect(final).toMatchObject({
      status: "succeeded",
      items_processed: 27,
      details: { targetDate: "2026-09-15" },
    });
  });

  it("infers the trigger from the caller rather than guessing", async () => {
    const insertSpy = vi.fn(() => ({
      select: vi.fn(() => ({ single: vi.fn(async () => insertResult) })),
    }));
    from.mockImplementationOnce(
      () =>
        ({
          insert: insertSpy,
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        }) as never,
    );

    await runJob(
      {
        name: "nightly_backup",
        request: new Request("https://x.test/j", {
          headers: { "user-agent": "vercel-cron/1.0" },
        }),
      },
      async () => undefined,
    );

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "vercel_cron", status: "running" }),
    );
  });
});

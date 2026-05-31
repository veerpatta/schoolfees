import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The `ENABLED` gate in lib/observability/timing.ts is resolved at module load,
 * so we re-import the module under each env via vi.resetModules() + stubEnv.
 */
async function loadTimer(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      vi.stubEnv(key, "");
    } else {
      vi.stubEnv(key, value);
    }
  }
  return import("@/lib/observability/timing");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ServerTimer", () => {
  it("returns the wrapped result whether enabled or disabled", async () => {
    const disabled = await loadTimer({ PERF_TIMING: undefined, VERCEL_ENV: undefined });
    const t1 = new disabled.ServerTimer("test");
    await expect(t1.measure("step", async () => 42)).resolves.toBe(42);
    expect(disabled.perfEnabled()).toBe(false);

    const enabled = await loadTimer({ PERF_TIMING: "1" });
    const t2 = new enabled.ServerTimer("test");
    await expect(t2.measure("step", async () => "ok")).resolves.toBe("ok");
    expect(enabled.perfEnabled()).toBe(true);
  });

  it("enables automatically on Vercel preview deployments", async () => {
    const { perfEnabled } = await loadTimer({ PERF_TIMING: undefined, VERCEL_ENV: "preview" });
    expect(perfEnabled()).toBe(true);
  });

  it("stays disabled in production unless explicitly opted in", async () => {
    const { perfEnabled } = await loadTimer({ PERF_TIMING: undefined, VERCEL_ENV: "production" });
    expect(perfEnabled()).toBe(false);
  });

  it("records named per-call entries in the Server-Timing header when enabled", async () => {
    const { ServerTimer } = await loadTimer({ PERF_TIMING: "1" });
    const timer = new ServerTimer("dashboard");
    await timer.measure("auth", async () => undefined);
    await timer.measure("aboveFold", async () => undefined);
    const header = timer.header();
    expect(header).toContain("auth;dur=");
    expect(header).toContain("aboveFold;dur=");
    expect(header).toContain("total;dur=");
  });

  it("omits per-call entries from the header when disabled", async () => {
    const { ServerTimer } = await loadTimer({ PERF_TIMING: undefined, VERCEL_ENV: undefined });
    const timer = new ServerTimer("dashboard");
    await timer.measure("auth", async () => undefined);
    const header = timer.header();
    expect(header).not.toContain("auth;dur=");
    expect(header).toContain("total;dur=");
  });

  it("flushes one greppable [perf] line tagged with region when enabled", async () => {
    const { ServerTimer } = await loadTimer({ PERF_TIMING: "1", VERCEL_REGION: "bom1" });
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const timer = new ServerTimer("dashboard");
    await timer.measure("auth", async () => undefined);
    timer.flush();
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0]?.[0] as string;
    expect(line).toContain("[perf] scope=dashboard");
    expect(line).toContain("auth=");
    expect(line).toContain("total=");
    expect(line).toContain("region=bom1");
  });

  it("does not log when disabled", async () => {
    const { ServerTimer } = await loadTimer({ PERF_TIMING: undefined, VERCEL_ENV: undefined });
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const timer = new ServerTimer("dashboard");
    await timer.measure("auth", async () => undefined);
    timer.flush();
    expect(spy).not.toHaveBeenCalled();
  });
});

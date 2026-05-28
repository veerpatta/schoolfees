import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("observability logger (audit 1.21)", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("emits warn and error payloads verbatim in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { logWarn, logError } = await import("@/lib/observability/log");

    logWarn("test.warn", { studentId: "s-1", code: "42P01" });
    logError("test.error", { details: "constraint violated", hint: "fix it" });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[warn] test.warn",
      { studentId: "s-1", code: "42P01" },
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[error] test.error",
      { details: "constraint violated", hint: "fix it" },
    );
  });

  it("strips Postgres internals (code, details, hint, constraint) in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { logError } = await import("@/lib/observability/log");

    logError("test.prod", {
      studentId: "s-1",
      code: "42P01",
      details: "relation does not exist",
      hint: "create the table",
      constraint: "fk_student",
      retained: "this stays",
    });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [, payload] = consoleErrorSpy.mock.calls[0]!;
    expect(payload).toEqual({ studentId: "s-1", retained: "this stays" });
  });

  it("sanitises Error instances in production to name + message only", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { logError } = await import("@/lib/observability/log");
    const err = new Error("Could not connect to database server");
    (err as unknown as { stack?: string }).stack = "very long internal stack";

    logError("test.with.error", { cause: err });

    const [, payload] = consoleErrorSpy.mock.calls[0]!;
    expect(payload).toEqual({
      cause: { name: "Error", message: "Could not connect to database server" },
    });
  });

  it("logInfo is silent in production by default and verbose in dev", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const prod = await import("@/lib/observability/log");
    prod.logInfo("test.timing", { ms: 4321 });
    expect(consoleLogSpy).not.toHaveBeenCalled();

    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    const dev = await import("@/lib/observability/log");
    dev.logInfo("test.timing", { ms: 4321 });
    expect(consoleLogSpy).toHaveBeenCalledWith("[info] test.timing", { ms: 4321 });
  });

  it("opt-in VPPS_OBSERVABILITY_VERBOSE re-enables logInfo in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VPPS_OBSERVABILITY_VERBOSE", "1");
    const { logInfo } = await import("@/lib/observability/log");
    logInfo("opt.in", { foo: 1 });
    expect(consoleLogSpy).toHaveBeenCalledWith("[info] opt.in", { foo: 1 });
  });
});

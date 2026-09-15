import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jobSecretEnvName, requireJobSecret } from "@/platform/jobs/job-secret";

vi.mock("@/platform/observability/log", () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

import { logError, logWarn } from "@/platform/observability/log";

/**
 * The acceptance criterion this file exists for: every job route has to keep
 * working for a caller using the shared CRON_SECRET *and* for one using the new
 * per-job secret, because the live pg_cron and Vercel Cron callers have not
 * been switched over yet (decisions.md D-21). Getting this wrong 401s the
 * school's nightly jobs.
 */

const JOB = "nightly_backup";
const ENV = "JOB_SECRET_NIGHTLY_BACKUP";

function get(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = { [ENV]: process.env[ENV], CRON_SECRET: process.env.CRON_SECRET };
  delete process.env[ENV];
  delete process.env.CRON_SECRET;
  vi.clearAllMocks();
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("jobSecretEnvName", () => {
  it("maps a job name to its variable", () => {
    expect(jobSecretEnvName("nightly_backup")).toBe("JOB_SECRET_NIGHTLY_BACKUP");
    expect(jobSecretEnvName("auto_day_close")).toBe("JOB_SECRET_AUTO_DAY_CLOSE");
    expect(jobSecretEnvName("whatsapp_scheduled_runs")).toBe(
      "JOB_SECRET_WHATSAPP_SCHEDULED_RUNS",
    );
    expect(jobSecretEnvName("backup_report")).toBe("JOB_SECRET_BACKUP_REPORT");
  });
});

describe("requireJobSecret", () => {
  it("accepts the per-job secret as a bearer token", () => {
    process.env[ENV] = "job-secret-value";

    const result = requireJobSecret(
      get("https://x.test/api/cron/nightly-backup", {
        authorization: "Bearer job-secret-value",
      }),
      JOB,
    );

    expect(result.ok).toBe(true);
  });

  it("still accepts CRON_SECRET when the per-job secret is unset, and warns", () => {
    process.env.CRON_SECRET = "shared-secret";

    const result = requireJobSecret(
      get("https://x.test/api/cron/nightly-backup", {
        authorization: "Bearer shared-secret",
      }),
      JOB,
    );

    expect(result.ok).toBe(true);
    expect(logWarn).toHaveBeenCalledWith(
      "jobs.secret.deprecated-fallback",
      expect.objectContaining({ job: JOB }),
    );
  });

  /**
   * The fallback is a fallback, not an alternative. Once the per-job secret is
   * set, the old shared one must stop working for that job — otherwise
   * rotating CRON_SECRET later would be a no-op for the routes that matter.
   */
  it("stops accepting CRON_SECRET once the per-job secret is set", () => {
    process.env[ENV] = "job-secret-value";
    process.env.CRON_SECRET = "shared-secret";

    const result = requireJobSecret(
      get("https://x.test/api/cron/nightly-backup", {
        authorization: "Bearer shared-secret",
      }),
      JOB,
    );

    expect(result.ok).toBe(false);
  });

  it("accepts ?secret= only when the caller opts in", async () => {
    process.env[ENV] = "job-secret-value";
    const url = "https://x.test/api/cron/nightly-backup?secret=job-secret-value";

    expect(requireJobSecret(get(url), JOB, { allowQuery: true }).ok).toBe(true);

    const refused = requireJobSecret(get(url), JOB);
    expect(refused.ok).toBe(false);
  });

  it("rejects a wrong secret with 401 and no detail", async () => {
    process.env[ENV] = "job-secret-value";

    const result = requireJobSecret(
      get("https://x.test/api/cron/nightly-backup", { authorization: "Bearer nope" }),
      JOB,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.response.status).toBe(401);
    const body = await result.response.json();
    expect(body).toEqual({ ok: false, error: "Unauthorized" });
    // The variable name must never reach the caller.
    expect(JSON.stringify(body)).not.toContain("JOB_SECRET");
    expect(JSON.stringify(body)).not.toContain("CRON_SECRET");
  });

  it("rejects when no secret is supplied at all", async () => {
    process.env[ENV] = "job-secret-value";

    const result = requireJobSecret(get("https://x.test/api/cron/nightly-backup"), JOB);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
  });

  /**
   * A deployment with neither variable can never authenticate this job again.
   * Nobody watches a cron, so that is an error-level event, not a warning.
   */
  it("logs an error and refuses when neither variable is set", async () => {
    const result = requireJobSecret(
      get("https://x.test/api/cron/nightly-backup", { authorization: "Bearer anything" }),
      JOB,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    expect(logError).toHaveBeenCalledWith(
      "jobs.secret.unconfigured",
      expect.objectContaining({ job: JOB }),
    );
  });

  it("does not leak a prefix match through length", () => {
    process.env[ENV] = "0123456789abcdef";

    expect(
      requireJobSecret(
        get("https://x.test/j", { authorization: "Bearer 0123456789abcde" }),
        JOB,
      ).ok,
    ).toBe(false);

    expect(
      requireJobSecret(
        get("https://x.test/j", { authorization: "Bearer 0123456789abcdefg" }),
        JOB,
      ).ok,
    ).toBe(false);
  });
});

import { timingSafeEqual } from "node:crypto";

import { logError, logWarn } from "@/platform/observability/log";

/**
 * One secret per job family, instead of one `CRON_SECRET` for everything.
 *
 * The old arrangement gave every unattended route the same shared secret, so
 * rotating it meant coordinating every caller at once, and a secret leaked from
 * any one of them opened all of them. `JOB_SECRET_NIGHTLY_BACKUP` can be
 * rotated on its own and tells you, from the variable name alone, what an
 * exposure actually reached.
 *
 * `CRON_SECRET` stays as a fallback and is NOT retired in Phase 0 (decisions.md
 * D-21): two `/api/admin/*` maintenance routes and three scripts still read it,
 * and the live pg_cron and Vercel Cron callers have not been switched yet.
 * Removing the fallback before those move would silently 401 the school's
 * nightly jobs — which is exactly the failure mode job_runs exists to catch, so
 * it would at least be visible, but there is no reason to cause it.
 */

export type JobSecretResult = { ok: true } | { ok: false; response: Response };

/** `nightly_backup` → `JOB_SECRET_NIGHTLY_BACKUP`. */
export function jobSecretEnvName(jobName: string): string {
  return `JOB_SECRET_${jobName.toUpperCase()}`;
}

/**
 * Constant time for equal-length inputs, and length itself is not a secret
 * worth protecting here — an attacker who can measure it learns how many
 * characters to guess, which for a 32-byte hex token is not the weak link.
 * The point is to avoid leaking a prefix match one character at a time.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

function unauthorized(): Response {
  // One word back to the caller, always. Handing an unauthenticated prober the
  // name of a server-only environment variable is how the day-close route used
  // to answer, and the reason belongs in the log instead.
  return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

/**
 * Checks the caller's secret for one job.
 *
 * `Authorization: Bearer <token>` is the form every new caller should use.
 * `?secret=` is accepted only behind `allowQuery: true`, and only the three
 * routes that already had that behaviour pass it — a query string ends up in
 * server logs, proxy logs and browser history, so it is a transition
 * affordance, not a design.
 */
export function requireJobSecret(
  request: Request,
  jobName: string,
  { allowQuery = false }: { allowQuery?: boolean } = {},
): JobSecretResult {
  const envName = jobSecretEnvName(jobName);
  const jobSecret = process.env[envName]?.trim();
  const cronSecret = process.env.CRON_SECRET?.trim();

  const expected = jobSecret || cronSecret;

  if (!expected) {
    // Not a rejected caller: a deployment that can never authenticate this job
    // again. Nobody watches a cron, so this is an error, not a warning.
    logError("jobs.secret.unconfigured", {
      job: jobName,
      reason: `Neither ${envName} nor CRON_SECRET is set on this deployment.`,
    });
    return { ok: false, response: unauthorized() };
  }

  if (!jobSecret) {
    logWarn("jobs.secret.deprecated-fallback", {
      job: jobName,
      reason: `${envName} is not set; falling back to CRON_SECRET. Set ${envName} and move this caller onto it.`,
    });
  }

  const header = request.headers.get("authorization");
  const bearer = header?.replace(/^Bearer\s+/i, "").trim();
  const query = allowQuery
    ? (new URL(request.url).searchParams.get("secret")?.trim() ?? undefined)
    : undefined;

  // Header first: it is the form we want callers to converge on, and a caller
  // that sends both should be judged on the better one.
  const provided = bearer || query;

  if (!provided || !secretsMatch(provided, expected)) {
    logWarn("jobs.secret.rejected", {
      job: jobName,
      reason: provided ? "Secret does not match." : "No secret supplied.",
    });
    return { ok: false, response: unauthorized() };
  }

  return { ok: true };
}

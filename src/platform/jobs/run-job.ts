import * as Sentry from "@sentry/nextjs";

import { logError, logInfo } from "@/platform/observability/log";
import { createAdminClient } from "@/platform/supabase/admin";

/**
 * Wraps a job so that it leaves a row whatever happens to it.
 *
 * The contract, and the reason this exists:
 *
 *   **A job that cannot record a `job_runs` row must not run.**
 *
 * The row is written BEFORE the work starts, with `status = 'running'`. If the
 * process is killed mid-flight — a Vercel timeout, an OOM, a deploy landing on
 * top of it — the row stays at `running`, and a row stuck at `running` is a
 * finding. The alternative (write the row at the end) means a job that died
 * leaves nothing at all, which is indistinguishable from a job that never
 * started, which is indistinguishable from a cron that was quietly unscheduled
 * three weeks ago.
 *
 * Errors are recorded and then re-thrown. This never swallows: the caller's own
 * error handling still runs and the route still returns whatever it returned
 * before, so wrapping an existing route changes its observability and not its
 * behaviour.
 */

export type JobTrigger = "pg_cron" | "vercel_cron" | "github" | "manual";

export type JobContext = {
  /** Update `items_processed` so a long job shows movement, not just a start. */
  progress: (count: number) => Promise<void>;
  /** Merged into `details` when the run finishes. */
  detail: (fields: Record<string, unknown>) => void;
  /**
   * Record this run as failed without throwing.
   *
   * The routes being wrapped already handle their own errors and answer with a
   * specific JSON body and status — 207 when some table dumps failed, 500 with
   * the message when a query did. Throwing instead would change what those
   * callers receive, and P0.4's whole premise is that wrapping a route changes
   * its observability and not its behaviour. So the route returns what it
   * always returned, and says here that the run was not a success.
   */
  fail: (reason: string) => void;
};

export type RunJobOptions = {
  name: string;
  trigger?: JobTrigger;
  request?: Request;
};

/**
 * Vercel Cron announces itself; pg_cron and GitHub Actions do not, so anything
 * unrecognised is `manual` rather than a guess. Getting this wrong is cosmetic,
 * but "who started this" is the first question asked of a job that misbehaved.
 */
function inferTrigger(request?: Request): JobTrigger {
  if (!request) {
    return "manual";
  }

  const agent = request.headers.get("user-agent")?.toLowerCase() ?? "";

  if (agent.includes("vercel-cron")) return "vercel_cron";
  if (agent.includes("pg_net") || agent.includes("postgres")) return "pg_cron";
  if (agent.includes("github") || agent.includes("actions")) return "github";

  return "manual";
}

export async function runJob<T>(
  { name, trigger, request }: RunJobOptions,
  fn: (ctx: JobContext) => Promise<T>,
): Promise<T> {
  const supabase = createAdminClient();
  const resolvedTrigger = trigger ?? inferTrigger(request);
  const details: Record<string, unknown> = {};

  const { data: inserted, error: insertError } = await supabase
    .from("job_runs")
    .insert({ job_name: name, trigger: resolvedTrigger, status: "running" })
    .select("id")
    .single();

  if (insertError) {
    // The contract's hard edge. Running anyway would mean doing unattended work
    // that leaves no trace, which is the exact thing this platform exists to
    // stop — and if job_runs is unreachable, something is wrong that the job is
    // not going to fix by pressing on.
    logError("jobs.run.no-row", { job: name, reason: insertError.message });
    throw new Error(
      `Refusing to run ${name}: could not record a job_runs row (${insertError.message}).`,
    );
  }

  const runId = inserted.id as string;
  const startedAt = Date.now();
  let itemsProcessed = 0;
  let failureReason: string | null = null;

  const ctx: JobContext = {
    async progress(count: number) {
      itemsProcessed = count;
      await supabase.from("job_runs").update({ items_processed: count }).eq("id", runId);
    },
    detail(fields: Record<string, unknown>) {
      Object.assign(details, fields);
    },
    fail(reason: string) {
      failureReason = reason;
    },
  };

  try {
    const result = await fn(ctx);
    const reason: string | null = failureReason;

    await supabase
      .from("job_runs")
      .update({
        status: reason ? "failed" : "succeeded",
        finished_at: new Date().toISOString(),
        items_processed: itemsProcessed,
        details: Object.keys(details).length > 0 ? details : null,
        error: reason,
      })
      .eq("id", runId);

    if (reason) {
      logError("jobs.run.failed", { job: name, trigger: resolvedTrigger, error: reason });
    } else {
      logInfo("jobs.run.succeeded", {
        job: name,
        trigger: resolvedTrigger,
        ms: Date.now() - startedAt,
        items: itemsProcessed,
      });
    }

    return result;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Job failed.";

    // Update the row FIRST. If Sentry is unreachable or the re-throw is caught
    // somewhere upstream and turned into a 500, the row is still correct.
    await supabase
      .from("job_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        items_processed: itemsProcessed,
        details: Object.keys(details).length > 0 ? details : null,
        error: message,
      })
      .eq("id", runId);

    Sentry.captureException(caught, { tags: { job: name, trigger: resolvedTrigger } });
    logError("jobs.run.failed", { job: name, trigger: resolvedTrigger, error: message });

    throw caught;
  }
}

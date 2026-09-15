# `src/platform/jobs` — the job platform

Owns (writes): `job_runs`
Reads: `job_runs`, `backup_runs`
Server entry points: `runJob()`, `requireJobSecret()`, `jobSecretEnvName()`
Jobs: see the table below

## The rule

**A job that cannot record a `job_runs` row must not run.**

`runJob()` enforces it literally: if the insert fails, it throws before calling
your function. That is not defensive politeness. Every job here is unattended —
nobody watches a backup at 00:00 IST — so the only evidence any of them ran is
the row. A job that runs without leaving one is doing unsupervised work on a
school's financial data with no record, which is the thing this platform exists
to prevent.

## `runJob()`

```ts
export async function GET(request: Request) {
  const auth = requireJobSecret(request, "nightly_backup", { allowQuery: true });
  if (!auth.ok) return auth.response;

  return runJob({ name: "nightly_backup", request }, async (ctx) => {
    await ctx.progress(42);              // items_processed, for a long job
    ctx.detail({ prefix: "2026-09-16" }); // merged into details at the end
    return NextResponse.json({ ok: true });
  });
}
```

Authorise **before** `runJob`, always. An unauthenticated prober must not be
able to fill the table.

The row is written before the work starts, with `status = 'running'`, and
updated once when it ends. A row left at `running` is a job that died without
unwinding — a Vercel timeout, an OOM, a deploy landing on top of it. That is a
finding, not a gap: the alternative, writing the row at the end, means a job
that died leaves nothing, which looks exactly like a job that never started.

| `ctx` | |
|---|---|
| `progress(n)` | sets `items_processed`, so a long job shows movement |
| `detail({…})` | merged into `details` when the run finishes |
| `fail(reason)` | records the run as failed **without throwing** |

`fail()` exists because the routes here answer with their own bodies for
handled failures — 207 when some table dumps failed, 500 with the message when
a query did. Throwing instead would change what the caller receives, and the
point of wrapping an existing route is to change its observability and not its
behaviour. An *unhandled* throw is still recorded, reported to Sentry with the
job name as a tag, and re-thrown; `runJob` never swallows.

## Secrets

One per job family: `JOB_SECRET_<JOB_NAME_UPPER>`. `nightly_backup` →
`JOB_SECRET_NIGHTLY_BACKUP`.

`CRON_SECRET` is the fallback and **is not retired in Phase 0** (decisions.md
D-21). Two `/api/admin/*` maintenance routes and three scripts still read it,
and the live pg_cron and Vercel Cron callers have not been switched. A job whose
own variable is unset falls back to it and logs a deprecation warning; once the
job variable is set, the shared secret stops working for that job, which is what
makes rotating it later mean something.

`Authorization: Bearer <token>` is the form to use. `?secret=` works only behind
`allowQuery: true`, and only the three routes that already accepted it pass
that — a secret in a query string ends up in server logs, proxy logs and browser
history. Nothing new gets the affordance.

A rejected caller always receives exactly `{"ok":false,"error":"Unauthorized"}`
with status 401. The reason goes to the log. Handing an unauthenticated prober
the name of a server-only environment variable is how the day-close route used
to answer.

## The jobs

| Job name | Route | Scheduled by | Secret |
|---|---|---|---|
| `nightly_backup` | `/api/cron/nightly-backup` | Vercel Cron, `0 18 * * *` | `JOB_SECRET_NIGHTLY_BACKUP` |
| `auto_day_close` | `/api/cron/auto-day-close` | Vercel Cron, `30 18 * * *` | `JOB_SECRET_AUTO_DAY_CLOSE` |
| `whatsapp_scheduled_runs` | `/api/cron/whatsapp-scheduled-runs` | not scheduled — Hobby plan cron allowance is spent | `JOB_SECRET_WHATSAPP_SCHEDULED_RUNS` |
| `backup_report` | `/api/jobs/backup-report` | GitHub Actions | `JOB_SECRET_BACKUP_REPORT` |

`maxDuration` is 300 on `nightly-backup` and **deliberately absent** on
`auto-day-close`: its work is bounded and does not grow with the roll. Do not
add one while wrapping it.

## How pg_cron calls a route

The existing pattern, from
`supabase/migrations/20260612023000_notion_fee_sync.sql` (lines 310–320): the
secret is read out of Vault at call time rather than baked into the job
definition, so rotating it does not mean rewriting a cron entry.

```sql
select cron.schedule(
  'job-name', '30 19 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'VPPS_SUPABASE_PROJECT_URL')
           || '/api/cron/...',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'JOB_SECRET_...')
    )
  );
  $$
);
```

## Must never

- Run work when the `job_runs` insert failed.
- Swallow an error. Record it, then re-throw.
- Return anything but `{"ok":false,"error":"Unauthorized"}` on a failed secret check.
- Accept `?secret=` on a new route.
- Add `maxDuration` to `auto-day-close`.
- Write to `job_runs` or `backup_runs` from anywhere but `runJob()` and
  `/api/jobs/backup-report`. There are no INSERT or UPDATE policies for
  `authenticated`, so RLS backs this up rather than relying on convention.

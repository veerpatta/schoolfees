-- Every scheduled job leaves a row, including the ones that fail.
--
-- The two crons this school already runs are unattended by definition: nobody
-- watches a backup at 00:00 IST, and the only evidence either one ran is a
-- side effect somewhere else. A cron that silently stops is therefore invisible
-- until the day somebody needs the thing it was supposed to have been doing —
-- which, for `nightly-backup`, is the worst possible day to find out.
--
-- `job_runs` is the answer to "did it run, when, and did it work". One row per
-- invocation, written before the work starts so a crash still leaves evidence,
-- updated once when it ends. `src/platform/jobs/run-job.ts` is the only writer,
-- and its contract is the rule this table exists for: a job that cannot record
-- a row must not run.
--
-- `backup_runs` is narrower and separate on purpose. It is the off-platform
-- backup's own record — sizes, checksums, row counts, which destinations were
-- verified — written by GitHub Actions through /api/jobs/backup-report, not by
-- anything running inside the app. Keeping it apart from job_runs means the
-- question "is there a good backup of last Tuesday" is one small table, not a
-- filter over every job the system has ever run.
--
-- Additive only. No fee table, RPC, trigger, policy or view is touched. Writes
-- to both tables are service-role only: there is no INSERT or UPDATE policy for
-- `authenticated`, deliberately, so no signed-in user can forge a run record.

begin;

create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  trigger text not null
    check (trigger in ('pg_cron', 'vercel_cron', 'github', 'manual')),
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_processed integer not null default 0,
  details jsonb,
  error text
);

comment on table public.job_runs is
  'One row per invocation of a scheduled or triggered job, written before the work starts and updated once when it ends. A job that cannot record a row here must not run. Service-role writes only; admins read.';

comment on column public.job_runs.trigger is
  'What started this run: pg_cron, vercel_cron, github (Actions), or manual (a human pressed something).';

comment on column public.job_runs.status is
  'running until the job ends. A row left at running is a job that died without unwinding — that is a finding, not a gap.';

comment on column public.job_runs.items_processed is
  'Updated by ctx.progress(n) so a long job shows movement rather than only a start and an end.';

-- The question this table is asked is almost always "how did <job> do lately",
-- newest first.
create index if not exists idx_job_runs_name_started
  on public.job_runs (job_name, started_at desc);

create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  kind text not null check (kind in ('nightly', 'restore_drill')),
  dump_bytes bigint,
  sha256 text,
  row_counts jsonb,
  destinations jsonb,
  verified boolean not null default false,
  notes text
);

comment on table public.backup_runs is
  'The off-platform backup''s own record: sizes, checksums, row counts and which destinations were verified. Written only by /api/jobs/backup-report, which GitHub Actions calls with JOB_SECRET_BACKUP_REPORT. verified = true means every destination was checked after upload, not merely that the upload returned.';

comment on column public.backup_runs.verified is
  'false until every destination has been read back and compared. An unverified backup is a file, not a backup.';

create index if not exists idx_backup_runs_kind_ran
  on public.backup_runs (kind, ran_at desc);

alter table public.job_runs enable row level security;
alter table public.backup_runs enable row level security;

-- Admins read; nobody signed in writes. The runner and the report route both
-- use the service-role client, which bypasses RLS, so there is no INSERT or
-- UPDATE policy to write here and adding one would only create a way to forge
-- a run record.
drop policy if exists "admins can read job runs" on public.job_runs;
create policy "admins can read job runs"
on public.job_runs for select
to authenticated
using (public.has_permission('staff:manage'));

drop policy if exists "admins can read backup runs" on public.backup_runs;
create policy "admins can read backup runs"
on public.backup_runs for select
to authenticated
using (public.has_permission('staff:manage'));

revoke all on table public.job_runs from public, anon;
revoke all on table public.backup_runs from public, anon;
grant select on table public.job_runs to authenticated, service_role;
grant select on table public.backup_runs to authenticated, service_role;
grant insert, update on table public.job_runs to service_role;
grant insert on table public.backup_runs to service_role;

commit;

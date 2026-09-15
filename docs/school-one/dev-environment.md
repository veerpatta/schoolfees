# The development database

School One is built against a database that is not the school's. This file says
which one, how to fill it, and what stops you reaching the wrong one.

Production is `vgqyilgstjvgohrsiwkb`. It holds real children, real families and
real money, and **no development, preview, test or agent session ever points at
it**. Development is the `schoolfees-dev` project (`wtgxcptmucjerhufzjcf`).

---

## Which database, and how you know

| Context | `VERCEL_ENV` | Database | AiSensy |
|---|---|---|---|
| Production deploy | `production` | `vgqyilgstjvgohrsiwkb` | configured |
| Preview deploy | `preview` | `schoolfees-dev` | absent |
| Local dev | unset | `schoolfees-dev` | absent |
| Agent session | never production | `schoolfees-dev` | absent |

## Environment variables

In `.env.local`, from `.env.example`:

| Name | What it is |
|---|---|
| `PRODUCTION_SUPABASE_PROJECT_REF` | The ref that is production. Set it **everywhere**, including locally — it is the value everything is compared *against*, never a target. Not a secret. |
| `SUPABASE_DEV_PROJECT_REF` | The dev project's ref. Must differ from the production ref, or every `db:*:dev` command refuses. |
| `SUPABASE_DEV_DB_PASSWORD` | The dev database password, used only to link the CLI. Never production's. |
| `ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION` | The deliberate escape hatch for a scripted **read** against production. Set by hand, for one command, to the exact string `I understand`. Ignored on Vercel. |
| `TEST_STAFF_PASSWORD` | Optional. When set, `db:seed:dev` also creates the five role logins. |

`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be the **dev**
project's values locally. If they are production's, the app's own guard (P0.3)
refuses to boot and the seed step declines to create logins.

## Commands

```bash
npm run db:reset:dev    # the whole thing: rebuild the schema, apply, seed
npm run db:restore:dev  # rebuild the schema from supabase/schema.sql
npm run db:push:dev     # apply migrations written since the snapshot
npm run db:seed:dev     # run the seed files, then create the staff logins
```

`db:reset:dev` is restore + push + seed and is what you want on a fresh project.
All four go through `scripts/school-one/dev-db.mjs`. **None needs Docker** — they
target the remote dev project, and everything runs through `supabase db query`
and `supabase db push`.

Both destructive commands make you type the dev project ref back before they do
anything.

## What stops you reaching production

`dev-db.mjs` runs four checks before any command, and exits non-zero having
changed nothing if any fails:

1. `SUPABASE_DEV_PROJECT_REF` is set at all.
2. It does not equal `PRODUCTION_SUPABASE_PROJECT_REF`.
3. It is not the literal production ref. This duplicates check 2 **on purpose**:
   check 2 fails open if somebody's `.env.local` is missing the production
   variable, and a guard you can disable by deleting a line is not a guard.
4. The CLI's existing link (`supabase/.temp/project-ref`) already points at the
   dev ref. A link to anything else is a refusal, not something to silently
   re-point — if that ref were production, a push would have run against the
   live school database.

If check 4 fires and the link really is wrong, delete
`supabase/.temp/project-ref` and run the command again; it re-links from scratch.

Behind all four, `supabase/seeds/04_school_one_dev_seed.sql` opens with a
tripwire that aborts if the database holds any student whose admission number is
not `TEST-`. Configuration can be wrong; a roster of real children cannot be
mistaken for a development database. It has been tested by planting a non-`TEST-`
student and watching the seed refuse.

The application enforces the same rule at runtime (`src/platform/db-target.ts`,
P0.3). These two are independent on purpose: the CLI never sees the app's guard,
and the app never sees the CLI's link.

## How the schema is built: restore, not replay

**`supabase/migrations/` is the history of how production's schema got here. It
is not a recipe for a new database, and replaying it onto an empty one does not
work.** Two reasons, both found by trying (see `supabase/migrations/README.md`):

- Objects nothing creates. Two Notion views were made by hand in the SQL editor
  and never written down, while two migrations revoke and alter them. Fixed by
  `20260612023100` — that one was a real hole and is now closed.
- Repairs that guard on production's data, correctly. `20260727113603` runs only
  if it finds exactly 12 anomalies in 6 receipt pairs; `20260808140000` only if
  `late_fee_rule_change_snapshot` has rows. A data repair that runs against data
  nobody reviewed is how a repair becomes a corruption — so those guards are
  right, and they mean the file belongs to one database on one date.

So `restore` rebuilds the schema from `supabase/schema.sql` and records every
migration up to the snapshot's declared version as applied; `push` then carries
the handful written since. Two details matter:

- **The snapshot's sections are applied in a different order than they are
  written.** Its Indexes section comes before its Views section, and three
  indexes are on *materialized* views, so applying the file as written dies with
  `relation "public.v_workbook_student_financials" does not exist`. `dev-db.mjs`
  re-orders sections on the fly rather than hand-editing a generated file. The
  proper fix is in `public.generate_schema_snapshot()`, and then that reordering
  list can go.
- `check_function_bodies` is off for the apply, because functions are emitted
  before the views they read. `pg_dump` defers the same check for the same
  reason.

`dev-db.mjs` also carries the list of migrations recorded as applied rather than
run, with a reason each. Adding to that list to make an error go away is not
allowed: a migration that fails because the schema is wrong is a bug to fix.

## Seeds

`[db.seed].sql_paths` in `supabase/config.toml` lists `seed.sql`, `01`, `02` and
`04`, and is the single place that decides what is a seed.
**`03_cleanup_existing_students.sql` is not one** — it is a deletion script — so
it is never listed, never globbed, and never run by any script (D-22).

`db:seed:dev` applies those files itself, in order, every time.

**It deliberately does not use `supabase db push --include-seed`**, which looks
like the obvious tool and is a trap: it seeds only when there are migrations to
apply, and then only the files whose *hash has changed* since the last run.
Against an up-to-date database it prints `Remote database is up to date` and
seeds nothing — silently, with exit code 0. A seed step that quietly does nothing
is also a tripwire that quietly does not run.

The files are idempotent (`ON CONFLICT DO NOTHING`), so re-running is cheap and
changes nothing. Verified: two consecutive runs, all four files applied both
times, every count identical.

Staff logins are not seeded. A login lives in `auth.users` and is created through
the Auth Admin API, which SQL cannot do without hand-writing rows the auth
trigger expects to own. `db:seed:dev` therefore calls the repo's existing
`scripts/bootstrap-test-staff.mjs` afterwards, when `TEST_STAFF_PASSWORD` is set,
and prints a skip message when it is not.

### What a seeded dev database contains

| | |
|---|---|
| Session | `TEST-2026-27`, 19 classes, fee settings, 3 discount policies, 4 family groups |
| Students | **139** — 79 from seed 02 (every fee scenario), 60 from seed 04 (`Student A01`…`F10` across Class 1–6) |
| Non-`TEST-` students | **0**, and the tripwire keeps it that way |
| Discount assignments | 24 · family members 11 |
| pg_cron | 4 jobs, and **not** the two Notion ones |

## Two traps on this machine

**Docker is not installed.** Nothing above needs it. Note that `supabase db dump`
without Docker **truncates its target file to zero bytes** — it destroyed
`supabase/schema.sql` once. Do not point it at a tracked file here. `restore`
refuses to run if the snapshot is suspiciously small, for that reason.

**PowerShell writes a UTF-8 BOM.** `Set-Content` and `>` prepend `EF BB BF`, and
the Supabase CLI then refuses to parse the file at all:

```
failed to parse environment file: .env.local (unexpected character '»' in variable name)
```

It is not a missing variable and not a wrong password — it is three invisible
bytes at the top of the file. Strip them:

```bash
tail -c +4 .env.local > .env.local.tmp && mv .env.local.tmp .env.local
```

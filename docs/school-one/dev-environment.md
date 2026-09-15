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
| Local dev | unset | `schoolfees-dev` (or a local stack) | absent |
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
npm run db:push:dev    # apply all migrations to the dev project
npm run db:seed:dev    # apply migrations, then the seed files, then staff logins
npm run db:reset:dev   # DROP everything on dev and replay migrations + seeds
```

All three go through `scripts/school-one/dev-db.mjs`. None needs Docker: they
target the remote dev project, not a local stack.

`db:reset:dev` asks you to type the dev project ref back before it does
anything. That is the only interactive prompt.

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
`supabase/.temp/project-ref` and run `npm run db:push:dev` again; it re-links
from scratch.

Behind all four, `supabase/seeds/04_school_one_dev_seed.sql` opens with a
tripwire that aborts if the database holds any student whose admission number is
not `TEST-`. Configuration can be wrong; a roster of real children cannot be
mistaken for a development database.

The application enforces the same rule at runtime (`src/platform/db-target.ts`,
P0.3). These two are independent on purpose: the CLI never sees the app's guard,
and the app never sees the CLI's link.

## Seeds

`[db.seed].sql_paths` in `supabase/config.toml` lists `seed.sql`, `01`, `02` and
`04`. **`03_cleanup_existing_students.sql` is not a seed** — it is a deletion
script — and is never listed, never globbed, and never run by any script
(decisions.md D-22).

Seeds run only under `supabase db push --include-seed` or `supabase db reset`.
A plain `supabase db push` — which is the production release command in
`BUILD-PLAN.md` §8 — cannot seed anything by accident.

Staff logins are not seeded. A login lives in `auth.users` and is created
through the Auth Admin API, which SQL cannot do without hand-writing rows the
auth trigger expects to own. `db:seed:dev` therefore calls the repo's existing
`scripts/bootstrap-test-staff.mjs` afterwards, when `TEST_STAFF_PASSWORD` is
set, and prints a skip message when it is not.

## Two traps on this machine

**Docker is not installed.** `supabase start`, `supabase db reset --local` and
`supabase db dump` all need it. Nothing in this file needs it, because
everything targets the remote dev project. Note that `supabase db dump` without
Docker **truncates its target file to zero bytes** — it destroyed
`supabase/schema.sql` once. Do not point it at a tracked file here.

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

## Known gap: the migration history cannot rebuild the database

`npm run db:push:dev` currently stops at migration
`20260718090711_harden_notion_and_financial_permissions.sql` with:

```
ERROR: relation "public.v_notion_student_fee_sync" does not exist (SQLSTATE 42P01)
```

`public.v_notion_student_fee_sync` and `public.v_notion_daily_summary` are
referenced by that migration and by `20260819120000`, but **no migration in the
repository creates either of them**. They exist in production because somebody
created them by hand in the SQL editor, so replaying the history there never
noticed. On an empty database the replay dies.

Their definitions do exist, in `supabase/schema.sql` (the snapshot), so the gap
is closeable. It is not closeable by editing `20260718090711` — applied
migrations are never edited — so it needs a decision recorded in
`decisions.md`. Until then, `db:push:dev` applies 123 of 218 migrations.

This is worth more than the inconvenience: "rebuild the schema from
`supabase/migrations/`" is not currently a working recovery path, and the backup
work in P0.6/P0.7 should not assume it is. The dumps restore data and schema
together, which is why the restore drill is the thing that actually proves
recoverability.

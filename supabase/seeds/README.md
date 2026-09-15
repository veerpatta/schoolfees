# Database Seeds

## 01_test_session_setup.sql

Creates the TEST-2026-27 session, 19 classes, fee_settings, conventional
discount policies (RTE, Staff Child, 3rd Child), and 4 test family groups.
Safe to re-run. Run this first.

## 02_test_students_seed.sql

Inserts ~120 test students across all 19 classes covering all test scenarios:
standard, new student, transport, RTE, Staff Child, 3rd Child, family groups,
custom overrides, no phone, no DOB, combined discount policies.
All admission numbers are prefixed with TEST-.
Safe to re-run (ON CONFLICT DO NOTHING).
Run after 01.

## 03_cleanup_existing_students.sql

**Not a seed. Never run automatically.**

Safe deletion script for production session cleanup.
Contains preview queries (run these first), a safe-delete block (removes
students with no payment history), and a full-wipe block (staging only).
Read the file carefully before running any DELETE statements.

It is deliberately **absent** from `[db.seed].sql_paths` in
`supabase/config.toml`, and no script may list it or glob this directory —
`supabase/seeds/*.sql` would sweep it up and start deleting rows straight after
seeding them. See `docs/school-one/decisions.md` D-22. Run it by hand, by
pasting the block you want into the SQL editor, after reading it.

## 04_school_one_dev_seed.sql

The School One development roster: 60 students across Class 1–6 named
`Student A01` … `Student F10`, with `TEST-SO-*` admission numbers and fake
`+91 00000 000NN` phones. Reuses 01's session and classes; creates none of its
own. Also unschedules the two Notion pg_cron jobs so a development database
never calls the school's real Notion workspace.

Its first statement is a tripwire that aborts if the database holds any student
whose admission number is not `TEST-`, so the file cannot run against real data
even if every other guard has been misconfigured.

It creates no staff logins — those live in `auth.users` and come from
`scripts/bootstrap-test-staff.mjs`, which `npm run db:seed:dev` runs afterwards.

Safe to re-run. Run after 01 and 02.

## Usage

Normally: `npm run db:seed:dev`, which applies migrations and then the seed
files listed in `config.toml` against the development project.

**Seeds do not run on a plain `supabase db push`** — only under
`--include-seed` or `supabase db reset`. That is why the production release
command in `docs/school-one/BUILD-PLAN.md` §8 (`npx supabase db push --linked
--yes`) cannot seed anything by accident.

Otherwise run in the Supabase SQL Editor (Database -> SQL Editor) as
postgres/service role. Always run 01 before 02, and 02 before 04.

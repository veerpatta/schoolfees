-- =============================================================================
-- SVP SCHOOL — SCRIPT 4: SCHOOL ONE DEVELOPMENT SEED
--
-- Extends 01 (session + classes + fee_settings) and 02 (~120 TEST- students)
-- with a wider, boring roster for School One development: 60 students across
-- 6 classes whose names are obviously fake, so nothing in a screenshot, a test
-- fixture or a bug report can be mistaken for a real child.
--
-- Runs only through `supabase db push --include-seed` or `db reset`, from the
-- [db.seed].sql_paths list in supabase/config.toml. A plain `db push` — which
-- is the production release command in BUILD-PLAN §8 — does NOT run seeds.
--
-- 03_cleanup_existing_students.sql is deliberately absent from that list. It is
-- a deletion script, not a seed (decisions.md D-22).
--
-- Staff logins are NOT created here. A login lives in auth.users and is made
-- through the Auth Admin API; SQL cannot forge one without hand-writing rows
-- the auth trigger expects to own. `npm run db:seed:dev` therefore calls the
-- repo's existing bootstrap script afterwards — see scripts/school-one/dev-db.mjs.
--
-- Safe to re-run: every insert is ON CONFLICT DO NOTHING.
-- =============================================================================

-- ── (a) PRODUCTION TRIPWIRE — must stay the first statement in this file ─────
--
-- The last line of defence, after the env guard in dev-db.mjs and the CLI link
-- check. Those two can be defeated by a wrong .env.local; this one cannot: a
-- database holding a student whose admission number is not TEST- is not a
-- development database, whatever the configuration claims.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.students WHERE admission_no NOT LIKE 'TEST-%') THEN
    RAISE EXCEPTION
      'Refusing to seed: this database holds non-TEST students. Is this production?';
  END IF;
END $$;

-- ── (b) Dev must never call Notion ──────────────────────────────────────────
--
-- 20260612023000_notion_fee_sync.sql schedules two pg_cron jobs that POST to an
-- external service. Applied to dev they would fire against the school's real
-- Notion workspace with dev's numbers. Every other pg_cron job is left alone:
-- they are internal and useful here.
--
-- Guarded on the catalogue rather than assuming pg_cron exists, so a project
-- without the extension seeds instead of failing.
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron is not installed here; no external jobs to unschedule.';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN ('notion-fee-sync-daily', 'notion-fee-sync-daily-test');
END $$;

-- ── (c) 60 fake students across 6 classes ───────────────────────────────────
--
-- Reuses 01's TEST-2026-27 session and its class rows; creates no class, no
-- session, no fee setting of its own. If 01 has not run, `resolved` is empty
-- and this inserts nothing rather than inventing a class.
--
--   admission_no   TEST-SO-A01 … TEST-SO-F10   (never collides with 02's TEST-CL1-*)
--   full_name      Student A01 … Student F10
--   primary_phone  +91 00000 00001 … +91 00000 00060
--   aadhaar_no     never set, here or anywhere in a fixture
WITH target_classes(letter, class_name) AS (
  VALUES
    ('A', 'Class 1'),
    ('B', 'Class 2'),
    ('C', 'Class 3'),
    ('D', 'Class 4'),
    ('E', 'Class 5'),
    ('F', 'Class 6')
),
resolved AS (
  SELECT
    tc.letter,
    c.id AS class_id,
    row_number() OVER (ORDER BY tc.letter) AS class_index
  FROM target_classes tc
  JOIN public.classes c
    ON c.session_label = 'TEST-2026-27'
   AND c.class_name = tc.class_name
),
roster AS (
  SELECT
    r.letter,
    r.class_id,
    g.n,
    ((r.class_index - 1) * 10 + g.n)::int AS serial
  FROM resolved r
  CROSS JOIN generate_series(1, 10) AS g(n)
)
INSERT INTO public.students (
  admission_no, full_name, class_id, date_of_birth,
  father_name, primary_phone, status, notes
)
SELECT
  'TEST-SO-' || roster.letter || lpad(roster.n::text, 2, '0'),
  'Student ' || roster.letter || lpad(roster.n::text, 2, '0'),
  roster.class_id,
  DATE '2015-01-01' + roster.serial,
  'Parent ' || roster.letter || lpad(roster.n::text, 2, '0'),
  '+91 00000 000' || lpad(roster.serial::text, 2, '0'),
  'active',
  'School One dev seed — fake data, not a real child'
FROM roster
ON CONFLICT (admission_no) DO NOTHING;

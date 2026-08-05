-- Repair: bulk student-update import repointed live students into TEST-2026-27.
--
-- On 2026-08-05 08:25-09:02 UTC a bulk update import ran with a NULL
-- import_batches.target_session_label. That disabled class-session filtering in
-- the dry run, and because classes are ordered by session_label DESC
-- ("TEST-2026-27" > "2026-27" lexicographically), every class label resolved to
-- the TEST-2026-27 twin. 372 live students had students.class_id repointed into
-- the test session and vanished from every active-session surface, along with
-- their payment history.
--
-- Nothing was deleted. payments, receipts, payment_adjustments and installments
-- were untouched -- all 1,548 installments for the affected students still point
-- at 2026-27 classes and 2026-27 fee settings. Every session-scoped side table
-- (conventional discounts, family groups, carry-forward balances, collection
-- flags, defaulter contacts) still reads 2026-27. Moving the students back makes
-- all of it consistent again, so this migration only has to undo two things:
--
--   1. students.class_id                    (372 rows)
--   2. student_fee_overrides.fee_setting_id (372 rows)
--
-- Selector: the 79 legitimate TEST-2026-27 students all carry a 'TEST-'
-- admission-number prefix; the 372 misplaced ones carry none. Classes are a
-- perfect 1:1 mirror across the two sessions (19 names, no sections/streams), so
-- the mapping back is unambiguous.
--
-- Both statements are naturally idempotent: once repaired the selectors match
-- zero rows, so re-running is a no-op, as is running against any environment
-- that never hit the bug.

do $$
declare
  v_students_repaired  integer;
  v_overrides_repaired integer;
  v_orphans            integer;
begin
  -- Guard: every misplaced student must have a same-named class in the live
  -- session. Bail out rather than half-repair the roster.
  select count(*)
    into v_orphans
  from public.students s
  join public.classes c on c.id = s.class_id
  where c.session_label = 'TEST-2026-27'
    and s.admission_no not like 'TEST-%'
    and not exists (
      select 1
      from public.classes lc
      where lc.session_label = '2026-27'
        and lc.class_name = c.class_name
    );

  if v_orphans > 0 then
    raise exception
      'Aborting session repair: % misplaced student(s) have no matching 2026-27 class.',
      v_orphans;
  end if;

  -- 1. Move students back to the live class of the same name.
  with misplaced as (
    select s.id as student_id, c.class_name
    from public.students s
    join public.classes c on c.id = s.class_id
    where c.session_label = 'TEST-2026-27'
      and s.admission_no not like 'TEST-%'
  )
  update public.students s
  set class_id = lc.id,
      updated_at = now()
  from misplaced m
  join public.classes lc
    on lc.session_label = '2026-27'
   and lc.class_name = m.class_name
  where s.id = m.student_id;

  get diagnostics v_students_repaired = row_count;

  -- 2. Repoint fee overrides that still reference a TEST-2026-27 fee setting at
  --    the live fee setting for the student's (now corrected) class. Only the
  --    pointer is wrong -- no override carries fee amounts that changed.
  --    fee_settings is 1:1 with classes, so the join resolves a single row.
  update public.student_fee_overrides o
  set fee_setting_id = lfs.id,
      updated_at = now()
  from public.students s
  join public.classes lc
    on lc.id = s.class_id
   and lc.session_label = '2026-27'
  join public.fee_settings lfs
    on lfs.class_id = lc.id
  where o.student_id = s.id
    and exists (
      select 1
      from public.fee_settings tfs
      join public.classes tc on tc.id = tfs.class_id
      where tfs.id = o.fee_setting_id
        and tc.session_label = 'TEST-2026-27'
    );

  get diagnostics v_overrides_repaired = row_count;

  raise notice 'Session repair: % student(s) and % fee override(s) returned to 2026-27.',
    v_students_repaired, v_overrides_repaired;
end;
$$;

-- Queue the workbook/financial materialized views for refresh so the dashboard,
-- Payment Desk and Defaulters projections pick the roster back up. The statement
-- triggers on students/student_fee_overrides already enqueue, but this is
-- explicit and harmless. The */2 cron drains it; callers may also invoke
-- public.refresh_workbook_materialized_views_if_requested() to force it now.
select public.queue_workbook_materialized_view_refresh();

-- Drop the phone-match sibling detection.
--
-- A "sibling group" had two meanings. One is real: student_family_groups +
-- student_family_members, rows staff create explicitly, which the 3rd Child
-- Policy runs on and which the DB trigger enforce_third_child_traceability
-- already requires. The other was a guess -- v_student_sibling_groups grouped
-- active students by a shared 10-digit phone number and labelled the result
-- 'suspected', which the student profile rendered as an amber "Suspected
-- Siblings" panel.
--
-- The guess was wrong often enough to be a liability. In the live 2026-27
-- session it produced 27 groups over 59 students; six paired children with
-- unrelated surnames (a shared or mistyped guardian phone), and one child
-- appeared in two different "families" at once. Nothing downstream could
-- consume it: a suspected group can never grant a discount, so its only
-- function was to ask staff a question the data could not answer.
--
-- It was also the most expensive read in the app. getStudentSiblingPills
-- scanned mv_student_sibling_groups with an array-overlap filter on every
-- student-list load; lib/students/data.ts carried a 2.5s client-side abort
-- because the scan had already blown the Postgres statement timeout in
-- production, and the matview existed at all only to make that scan survivable.
-- Sibling pills now come from student_family_members via two indexed lookups.
--
-- Everything dropped here is derived. No student, family, membership or
-- financial row is touched, and the objects can be rebuilt verbatim from
-- 20260710060829_materialize_sibling_groups.sql and
-- 20260521031342_v_student_sibling_groups.sql if this is ever reversed.

-- 1. Stop the every-2-minutes refresh job before removing what it refreshes.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh-sibling-groups-matview') then
    perform cron.unschedule('refresh-sibling-groups-matview');
  end if;
end;
$$;

-- 2. The write-side triggers that queued a refresh on every students /
--    student_family_groups / student_family_members statement.
drop trigger if exists queue_sibling_refresh_on_students on public.students;
drop trigger if exists queue_sibling_refresh_on_family_groups on public.student_family_groups;
drop trigger if exists queue_sibling_refresh_on_family_members on public.student_family_members;

-- 3. The queue/refresh pair the triggers and the cron job drove.
drop function if exists public.refresh_sibling_groups_if_requested();
drop function if exists public.queue_sibling_groups_refresh();

-- 4. The detection itself. The matview reads the view, so it goes first.
--    Verified against the live catalog: nothing else depends on either.
drop materialized view if exists public.mv_student_sibling_groups;
drop view if exists public.v_student_sibling_groups;

-- 5. The queue row is now orphaned. The CHECK constraint that still permits
--    'sibling_groups' is deliberately left alone -- narrowing it would rewrite
--    a constraint shared with the workbook refresh for no benefit.
delete from public.workbook_materialized_view_refresh_queue
where queue_key = 'sibling_groups';

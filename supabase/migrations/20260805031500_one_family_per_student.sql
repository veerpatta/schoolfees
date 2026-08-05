-- Sibling linking: make "one student, one family" true in the data, and make
-- family lookups indexed.
--
-- Why: linking a third sibling failed whenever staff built the family from more
-- than one profile. The app now MERGES family groups instead of refusing, which
-- only works if a student cannot end up spread across two groups afterwards.
-- Membership carries no money (payments and receipts are untouched here), so
-- consolidating an already-inconsistent student into one group is a repair, not
-- a policy change.
--
-- Four steps, in order:
--   1. Index student_family_members(family_group_id) — every family read is a
--      lookup on this column and there was no index for it.
--   2. Consolidate any student sitting in more than one family group, using the
--      same survivor rule as the app (most members, oldest wins ties).
--   3. Drop groups that can no longer be a family (0 or 1 distinct student).
--   4. Enforce one family per student per session with a unique index.
--
-- Deliberately NOT done here: writing student_conventional_discount_assignments
-- to apply or withdraw the 3rd Child Policy. The workbook projection does not
-- read assignments directly — the discount only reaches a student's dues when
-- the app regenerates them. Applying it in SQL would leave the assignment and
-- the projection disagreeing. Run the session-wide pass from the app instead:
-- saving the discount block in Fee Setup calls applyThirdChildPolicyForSession()
-- and then regenerates dues for every student it touched.

-- 1. Family lookups -----------------------------------------------------------

create index if not exists idx_student_family_members_group
on public.student_family_members (family_group_id);

-- 2. Consolidate students spread across several groups ------------------------

with member_counts as (
  select
    member.family_group_id,
    count(distinct member.student_id) as member_count
  from public.student_family_members as member
  group by member.family_group_id
),
ranked_groups as (
  select
    grp.id as family_group_id,
    coalesce(member_counts.member_count, 0) as member_count,
    grp.created_at
  from public.student_family_groups as grp
  left join member_counts on member_counts.family_group_id = grp.id
),
multi_group_students as (
  select student_id
  from public.student_family_members
  group by student_id
  having count(distinct family_group_id) > 1
),
survivors as (
  select distinct on (member.student_id)
    member.student_id,
    member.family_group_id as keep_family_group_id
  from public.student_family_members as member
  join multi_group_students on multi_group_students.student_id = member.student_id
  join ranked_groups on ranked_groups.family_group_id = member.family_group_id
  order by member.student_id, ranked_groups.member_count desc, ranked_groups.created_at asc
)
delete from public.student_family_members as member
using survivors
where member.student_id = survivors.student_id
  and member.family_group_id <> survivors.keep_family_group_id;

-- 3. Retire groups that are no longer a family --------------------------------
-- An empty group younger than a day is left alone: it may belong to a link that
-- is still being assembled rather than to stale data.

with group_sizes as (
  select
    grp.id,
    grp.created_at,
    count(distinct member.student_id) as member_count
  from public.student_family_groups as grp
  left join public.student_family_members as member on member.family_group_id = grp.id
  group by grp.id, grp.created_at
)
delete from public.student_family_groups as grp
using group_sizes
where group_sizes.id = grp.id
  and (
    group_sizes.member_count = 1
    or (group_sizes.member_count = 0 and group_sizes.created_at < now() - interval '1 day')
  );

-- 4. One family per student per session ---------------------------------------
-- Step 2 removed every violation, so this cannot fail on repaired data. It is
-- the invariant the merge logic in linkSiblingsAction relies on: after a merge
-- there is exactly one group to recompute the 3rd Child Policy against.

create unique index if not exists idx_student_family_members_student_session_unique
on public.student_family_members (student_id, academic_session_label);

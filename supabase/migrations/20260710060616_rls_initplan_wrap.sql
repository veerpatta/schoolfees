-- Wrap bare has_permission(...) / has_any_permission(...) calls in RLS policy
-- expressions with scalar subqueries so Postgres evaluates them ONCE per
-- statement (InitPlan) instead of once per row.
--
-- Why: has_permission() resolves the caller's role via a lookup on
-- public.users (private.current_staff_role()). With the bare call in a policy,
-- every row scanned re-runs that lookup. Measured in production: a plain
-- 560-row students select spent ~168ms in per-row policy evaluation; the
-- audit_logs activity feed spent ~1.8s scanning ~22k rows. With the
-- (select ...) wrap the same check runs once per query (<2ms).
-- Ref: https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices
--
-- The rewrite is mechanical and idempotent: policies whose expression already
-- contains a SELECT are skipped. All existing policy expressions are flat
-- AND/OR combinations of constant-argument calls (verified against
-- pg_policies before writing this migration), so the two regexes below cover
-- every occurrence.

do $$
declare
  pol record;
  new_qual text;
  new_check text;
  cmd text;
begin
  for pol in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public', 'test')
      and (
        coalesce(qual, '') ~ 'has_(any_)?permission\(' or
        coalesce(with_check, '') ~ 'has_(any_)?permission\('
      )
  loop
    new_qual := pol.qual;
    new_check := pol.with_check;

    if new_qual is not null and new_qual !~* 'select' then
      new_qual := regexp_replace(
        new_qual,
        'has_any_permission\((ARRAY\[[^\]]+\])\)',
        '(select has_any_permission(\1))',
        'g'
      );
      new_qual := regexp_replace(
        new_qual,
        'has_permission\((''[^'']*''::text)\)',
        '(select has_permission(\1))',
        'g'
      );
    end if;

    if new_check is not null and new_check !~* 'select' then
      new_check := regexp_replace(
        new_check,
        'has_any_permission\((ARRAY\[[^\]]+\])\)',
        '(select has_any_permission(\1))',
        'g'
      );
      new_check := regexp_replace(
        new_check,
        'has_permission\((''[^'']*''::text)\)',
        '(select has_permission(\1))',
        'g'
      );
    end if;

    cmd := null;

    if new_qual is distinct from pol.qual or new_check is distinct from pol.with_check then
      cmd := format('alter policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);

      if new_qual is distinct from pol.qual then
        cmd := cmd || format(' using (%s)', new_qual);
      end if;

      if new_check is distinct from pol.with_check then
        cmd := cmd || format(' with check (%s)', new_check);
      end if;

      execute cmd;
    end if;
  end loop;
end $$;

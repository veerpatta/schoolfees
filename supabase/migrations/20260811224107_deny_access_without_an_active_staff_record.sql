-- Found by smoke-testing the whole app, not just EMI.
--
-- private.current_staff_role() COALESCEd a missing staff row to 'view_only'.
-- It correctly checked is_active — but then handed the caller a working role
-- anyway. So deactivating a departed employee did not remove their access, it
-- demoted them: with a still-valid token they could read all 614 students, 376
-- receipts and the school's live financial position straight off the data API.
-- Same for any authenticated user with no staff record at all.
--
-- requireAuthenticatedStaff() does redirect them out of the app, so the PAGES
-- were never exposed. But that guard protects the pages, not PostgREST, and
-- the publishable key ships to the browser. RLS was the only thing left, and
-- RLS was being told "view_only".
--
-- Now: no active staff row means no role. has_permission()'s CASE has no
-- branch for NULL, so it falls to `else false` and every RLS policy that asks
-- it denies. Only has_permission() reads this function, and no policy calls it
-- directly, so the blast radius is exactly the intended one.
--
-- NOTE: this does NOT cover the three financial materialized views, which have
-- no RLS of their own and are still granted to `authenticated`. Closing that
-- needs the matviews moved behind security_invoker wrappers — 6 dependent
-- views, 3 functions and the app's hottest read path — so it is deliberately
-- a separate change.
create or replace function private.current_staff_role()
returns staff_role
language sql
stable
security definer
set search_path to 'public', 'auth', 'private'
as $function$
  select u.role
  from public.users as u
  where u.id = auth.uid()
    and u.is_active = true
  limit 1;
$function$;

-- get_dashboard_fee_split and get_dashboard_summary are SECURITY DEFINER, so
-- they bypass RLS entirely — fixing the role above does not reach them. Both
-- were callable by any signed-in user with no permission check at all. Guard
-- them the same way get_dashboard_repayment_summary already is.
create or replace function public.get_dashboard_fee_split(p_session_label text)
returns table (
  current_year_expected integer,
  current_year_collected integer,
  current_year_pending integer,
  previous_year_original integer,
  previous_year_collected integer,
  previous_year_pending integer,
  late_fee_pending integer
)
language plpgsql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.has_any_permission(array['dashboard:view', 'finance:view'])
  then
    raise exception 'You do not have permission to read the fee split.';
  end if;

  return query
  with scoped as (
    select
      b.is_carry_forward,
      b.base_charge,
      b.applied_amount,
      b.pending_amount,
      b.final_late_fee
    from public.v_workbook_installment_balances as b
    join public.students as s on s.id = b.student_id
    join public.classes  as c on c.id = b.class_id
    where b.session_label = p_session_label
      and c.status = 'active'
      -- Active, or left/inactive but with money already collected: their
      -- remaining dues are still collectable and must stay visible. A departed
      -- student who never paid has had their installments cancelled, so they
      -- contribute nothing either way.
      and (
        s.status = 'active'
        or exists (
          select 1
          from public.payments p
          join public.receipts r on r.id = p.receipt_id
          where p.student_id = s.id and r.payment_mode <> 'discount'
        )
      )
  ),
  per_row as (
    select
      scoped.is_carry_forward,
      scoped.base_charge,
      least(greatest(scoped.applied_amount, 0), scoped.base_charge) as collected_against_base,
      scoped.pending_amount,
      least(greatest(scoped.final_late_fee, 0), scoped.pending_amount) as late_pending
    from scoped
  )
  select
    coalesce(sum(per_row.base_charge)            filter (where not per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.collected_against_base) filter (where not per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.pending_amount - per_row.late_pending)
                                                 filter (where not per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.base_charge)            filter (where per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.collected_against_base) filter (where per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.pending_amount)         filter (where per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.late_pending)           filter (where not per_row.is_carry_forward), 0)::integer
  from per_row;
end;
$function$;

grant execute on function public.get_dashboard_fee_split(text) to authenticated;
grant execute on function public.get_dashboard_fee_split(text) to service_role;

-- get_dashboard_summary is ~250 lines of aggregation. Patch the guard in rather
-- than restating the body, and fail loudly if the anchor ever moves.
do $$
declare
  v_src text;
  v_new text;
  v_guard text;
begin
  select pg_get_functiondef('public.get_dashboard_summary(text,text)'::regprocedure) into v_src;

  -- Idempotent: a replay must not stack a second copy of the guard.
  if position('You do not have permission to read the dashboard' in v_src) > 0 then
    return;
  end if;

  v_guard :=
    E'\nbegin\n'
    || E'  if coalesce(auth.role(), '''') <> ''service_role''\n'
    || E'     and not public.has_any_permission(array[''dashboard:view'', ''finance:view''])\n'
    || E'  then\n'
    || E'    raise exception ''You do not have permission to read the dashboard.'';\n'
    || E'  end if;\n';

  v_new := regexp_replace(v_src, E'\\nbegin\\n', v_guard);

  if v_new = v_src then
    raise exception 'get_dashboard_summary: could not find the begin anchor to guard';
  end if;

  execute v_new;
end $$;

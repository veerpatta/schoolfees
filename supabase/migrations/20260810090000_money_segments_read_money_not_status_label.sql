-- "Never paid" said 0 while 264 families had paid nothing.
--
-- The money chips were built on v_workbook_student_financials.status_label,
-- which is a TIMING label, not a payment one. On the live 2026-27 session it
-- only ever takes three values:
--
--   OVERDUE      418   (of whom 264 have paid nothing and 154 have paid some)
--   PARTLY PAID   67
--   PAID          24
--
-- 'NOT STARTED' never occurs -- it is for a student whose first due date has
-- not passed yet, and by August every due date has. So "Never paid", defined as
-- status_label = 'NOT STARTED', read 0. An office looking at that chip would
-- conclude every family had started paying. 264 have not.
--
-- The old three buckets also covered only 91 of 509 students, so they were not
-- a partition of anything; "Partly paid (67)" meant "square on the installments
-- due so far, with later ones outstanding", which is not what the words say.
--
-- Redefined on money:
--
--   never paid    total_paid = 0 and something was charged      264
--   partly paid   total_paid > 0 and outstanding > 0            221
--   year clear    outstanding <= 0 and something was settled      24
--                                                               ---
--                                                               509
--
-- "Year clear" replaces "Fully paid" and mirrors isYearCleared() in
-- lib/fees/year-clear.ts exactly, so the chip agrees with the stamp already
-- printed on receipts and statements. Overdue stays where it is: it is the
-- timing axis and legitimately overlaps all three.
--
-- DROP and recreate rather than CREATE OR REPLACE: seg_fully_paid becomes
-- seg_year_clear, and replace cannot rename a column. Nothing depends on this
-- view -- the two RPCs reference it from inside function bodies, which is not a
-- catalog dependency -- so the drop is safe inside this transaction.

drop view if exists public.v_student_directory;

create view public.v_student_directory
with (security_invoker = true) as
select
  s.id                            as student_id,
  s.admission_no,
  s.full_name,
  s.date_of_birth,
  s.father_name,
  s.mother_name,
  s.primary_phone,
  s.secondary_phone,
  s.status                        as record_status,
  s.class_id,
  s.transport_route_id,
  s.updated_at,
  s.photo_path,
  c.session_label,
  c.status                        as class_status,
  c.sort_order                    as class_sort_order,

  array_to_string(array_remove(array[
    nullif(btrim(c.class_name), ''),
    case
      when nullif(btrim(coalesce(c.section, '')), '') is not null
      then 'Section ' || btrim(c.section)
    end,
    nullif(btrim(coalesce(c.stream_name, '')), '')
  ], null), ' - ')                as class_label,

  coalesce(f.status_label, '')                        as status_label,
  coalesce(f.outstanding_amount, 0)                   as outstanding_amount,
  coalesce(f.base_outstanding_amount, 0)              as base_outstanding_amount,
  coalesce(f.late_fee_outstanding_amount, 0)          as late_fee_outstanding_amount,
  coalesce(i.carry_forward_pending_amount, 0)         as old_balance_amount,
  coalesce(i.overdue_base_amount, 0)                  as overdue_base_amount,
  coalesce(i.pending_late_fee_amount, 0)              as pending_late_fee_amount,
  coalesce(f.total_paid, 0)                           as total_paid,
  coalesce(f.base_charge_total, 0)                    as base_charge_total,
  f.last_payment_date,

  (coalesce(i.carry_forward_pending_amount, 0) > 0)   as seg_old_balance_due,
  -- Timing, not payment: an installment is past its due date and unpaid. A
  -- student can be overdue on installment 1 and have paid nothing, or be
  -- overdue and have paid a lot. It deliberately overlaps the three buckets
  -- below rather than partitioning with them.
  (coalesce(f.status_label, '') = 'OVERDUE')          as seg_overdue,
  (coalesce(f.late_fee_outstanding_amount, 0) > 0)    as seg_late_fee_pending,

  -- The three payment buckets, which DO partition the roll: never paid,
  -- started but not finished, finished. They read off money, not off
  -- status_label.
  --
  -- They used to read off status_label, and it does not mean what the labels
  -- implied. On the live 2026-27 session status_label only ever takes three
  -- values -- OVERDUE (418), PARTLY PAID (67), PAID (24) -- and 'NOT STARTED'
  -- never occurs, so "Never paid" read 0 while 264 families had in fact paid
  -- nothing at all. The office would have concluded every family had started
  -- paying. The old buckets also accounted for only 91 of 509 students; these
  -- three sum to 509 exactly.
  (coalesce(f.total_paid, 0) = 0
     and coalesce(f.base_charge_total, 0) > 0)        as seg_never_paid,
  (coalesce(f.total_paid, 0) > 0
     and coalesce(f.outstanding_amount, 0) > 0)       as seg_partly_paid,
  -- Mirrors isYearCleared() in lib/fees/year-clear.ts, including the reason it
  -- exists: outstanding <= 0 on its own also stamps a student whose dues were
  -- never prepared, so something must actually have been settled. A discount
  -- write-off counts as settlement -- it is not cash, and stays out of
  -- collection figures, but the balance is cleared.
  (coalesce(f.outstanding_amount, 0) <= 0
     and (coalesce(f.total_paid, 0) + coalesce(f.total_discount_closeouts, 0)) > 0
     and coalesce(f.base_charge_total, 0) > 0)        as seg_year_clear,
  (coalesce(f.outstanding_amount, 0) > 0)             as seg_has_dues,

  (s.status = 'active')                               as seg_active,
  (s.status = 'left')                                 as seg_left,
  (s.status = 'graduated')                            as seg_graduated,
  (s.status <> 'active' and coalesce(f.outstanding_amount, 0) > 0) as seg_left_owing,
  coalesce(f.student_status_label, 'Old')             as student_status_label,
  (coalesce(f.student_status_label, 'Old') = 'New')   as seg_new_this_year,

  (coalesce(nullif(btrim(coalesce(s.primary_phone, '')), ''),
            nullif(btrim(coalesce(s.secondary_phone, '')), '')) is null)
                                                      as seg_missing_phone,
  (coalesce(i.installment_count, 0) = 0)              as seg_dues_not_prepared,
  coalesce(f.missing_dob_flag, s.date_of_birth is null) as seg_missing_dob,
  coalesce(f.duplicate_sr_flag, false)                as seg_duplicate_sr,
  (upper(btrim(coalesce(s.admission_no, ''))) like 'PENDING-%') as seg_pending_sr,

  ((r.route_name is not null and lower(btrim(r.route_name)) <> 'no transport')
   or coalesce(f.transport_fee, 0) > 0)               as seg_on_transport,
  coalesce(f.transport_fee, 0)                        as transport_fee,
  r.route_name                                        as transport_route_name,
  r.route_code                                        as transport_route_code,
  coalesce(f.discount_amount, 0)                      as discount_amount,
  (coalesce(f.discount_amount, 0) > 0)                as seg_has_discount,
  coalesce(d.policy_codes, '{}'::text[])              as conventional_policy_codes,
  d.policy_labels                                     as conventional_discount_labels,
  ('rte'         = any(coalesce(d.policy_codes, '{}'::text[]))) as seg_discount_rte,
  ('staff_child' = any(coalesce(d.policy_codes, '{}'::text[]))) as seg_discount_staff_child,
  ('third_child' = any(coalesce(d.policy_codes, '{}'::text[]))) as seg_discount_third_child,

  (o.id is not null and (
       o.custom_tuition_fee_amount is not null
    or o.custom_transport_fee_amount is not null
    or coalesce(o.discount_amount, 0) > 0
    or coalesce(o.late_fee_waiver_amount, 0) > 0
    or o.other_adjustment_amount is not null
    or nullif(btrim(coalesce(o.other_adjustment_head, '')), '') is not null))
                                                      as seg_fee_exception,
  (o.id is not null)                                  as has_fee_profile,

  -- Manual only. See the header: counting automatic waivers here reported 412
  -- forgiven students where nobody had forgiven anyone.
  (coalesce(m.manual_waiver_count, 0) > 0)            as seg_late_fee_waived,

  lower(concat_ws(' ',
    s.full_name, s.admission_no,
    c.class_name, c.section, c.stream_name,
    s.primary_phone, s.secondary_phone,
    s.father_name, s.mother_name
  ))                                                  as search_text,

  -- Appended, not inserted: CREATE OR REPLACE VIEW can only add columns at the
  -- end, and renaming an existing position is rejected outright.
  coalesce(m.manual_waiver_amount, 0)                 as manual_late_fee_waived_amount,
  coalesce(i.late_fee_waived_count, 0)                as any_late_fee_waived_count
from public.students as s
join public.classes as c
  on c.id = s.class_id
left join public.transport_routes as r
  on r.id = s.transport_route_id
left join public.v_workbook_student_financials as f
  on f.student_id = s.id
left join public.v_student_installment_facets as i
  on i.student_id = s.id
left join public.v_student_conventional_discounts as d
  on d.student_id = s.id and d.session_label = c.session_label
left join public.v_student_manual_late_fee_waivers as m
  on m.student_id = s.id and m.session_label = c.session_label
left join public.student_fee_overrides as o
  on o.student_id = s.id and o.is_active;

comment on view public.v_student_directory is
  'One filterable row per student per session. seg_* booleans back the Students and Transactions segment chips. The three payment buckets (seg_never_paid, seg_partly_paid, seg_year_clear) partition the roll; seg_overdue is a timing flag and overlaps all three.';

revoke all on public.v_student_directory from public, anon;
grant select on public.v_student_directory to authenticated, service_role;


-- The counts RPC hands 'yearClear' where it used to hand 'fullyPaid'.
create or replace function public.get_student_segment_counts(
  p_session_label       text,
  p_class_id            uuid    default null,
  p_route_id            uuid    default null,
  p_query               text    default null,
  p_statuses            text[]  default null,
  p_active_classes_only boolean default true
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  with population as (
    select d.*
    from public.v_student_directory as d
    where d.session_label = p_session_label
      and (not p_active_classes_only or d.class_status = 'active')
      and (p_class_id is null or d.class_id = p_class_id)
      and (p_route_id is null or d.transport_route_id = p_route_id)
      and (
        p_query is null or btrim(p_query) = ''
        or d.search_text like '%' || lower(btrim(p_query)) || '%'
      )
  ),
  scoped as (
    select * from population
    where p_statuses is null or record_status::text = any(p_statuses)
  )
  select jsonb_build_object(
    'scopeTotal',      (select count(*) from scoped),
    'populationTotal', (select count(*) from population),
    'enrolment', (
      select jsonb_build_object(
        'active',      count(*) filter (where seg_active),
        'left',        count(*) filter (where seg_left),
        'leftOwing',   count(*) filter (where seg_left_owing),
        'graduated',   count(*) filter (where seg_graduated),
        'newThisYear', count(*) filter (where seg_new_this_year)
      ) from population
    ),
    'counts', (
      select jsonb_build_object(
        'oldBalanceDue',       count(*) filter (where seg_old_balance_due),
        'overdue',             count(*) filter (where seg_overdue),
        'lateFeePending',      count(*) filter (where seg_late_fee_pending),
        'partlyPaid',          count(*) filter (where seg_partly_paid),
        'yearClear',           count(*) filter (where seg_year_clear),
        'neverPaid',           count(*) filter (where seg_never_paid),
        'hasDues',             count(*) filter (where seg_has_dues),
        'missingPhone',        count(*) filter (where seg_missing_phone),
        'duesNotPrepared',     count(*) filter (where seg_dues_not_prepared),
        'missingDob',          count(*) filter (where seg_missing_dob),
        'duplicateSr',         count(*) filter (where seg_duplicate_sr),
        'pendingSr',           count(*) filter (where seg_pending_sr),
        'onTransport',         count(*) filter (where seg_on_transport),
        'hasDiscount',         count(*) filter (where seg_has_discount),
        'discountRte',         count(*) filter (where seg_discount_rte),
        'discountStaffChild',  count(*) filter (where seg_discount_staff_child),
        'discountThirdChild',  count(*) filter (where seg_discount_third_child),
        'feeException',        count(*) filter (where seg_fee_exception),
        'lateFeeWaived',       count(*) filter (where seg_late_fee_waived)
      ) from scoped
    )
  );
$fn$;

revoke all on function public.get_student_segment_counts(text, uuid, uuid, text, text[], boolean)
  from public, anon;

grant execute on function public.get_student_segment_counts(text, uuid, uuid, text, text[], boolean)
  to authenticated, service_role;

-- Invariants. Frozen counts would break the next time a payment posts, so these
-- are structural: the three payment buckets must partition the roll, and the
-- one that read zero for the wrong reason must now be non-empty.
do $verify$
declare
  v_total integer;
  v_never integer;
  v_partly integer;
  v_clear integer;
  v_overlap integer;
begin
  select count(*),
         count(*) filter (where seg_never_paid),
         count(*) filter (where seg_partly_paid),
         count(*) filter (where seg_year_clear),
         count(*) filter (where (seg_never_paid::int + seg_partly_paid::int + seg_year_clear::int) > 1)
    into v_total, v_never, v_partly, v_clear, v_overlap
  from public.v_student_directory
  where session_label = '2026-27' and record_status = 'active';

  if v_overlap > 0 then
    raise exception 'payment buckets overlap for % student(s)', v_overlap;
  end if;

  if v_never + v_partly + v_clear <> v_total then
    raise exception 'payment buckets do not partition the roll: %+%+% <> %',
      v_never, v_partly, v_clear, v_total;
  end if;

  -- The bug this migration exists for. If it is zero again, the definition has
  -- regressed to something that cannot see a family who has paid nothing.
  if v_never = 0 and v_total > 0 then
    raise exception 'seg_never_paid is zero across % students -- check the predicate', v_total;
  end if;

  raise notice 'payment buckets: never=% partly=% clear=% total=%', v_never, v_partly, v_clear, v_total;
end
$verify$;

notify pgrst, 'reload schema';

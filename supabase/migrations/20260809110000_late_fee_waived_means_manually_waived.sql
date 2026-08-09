-- "Late fee waived" should mean a person decided to forgive it.
--
-- v_student_installment_facets counted any installment with waiver_applied > 0,
-- which read 412 students. But every waiver in the database today is automatic:
-- 635 rows with source 'grandfather' across 433 students, written when the
-- late-fee rule was unified in 20260808140000, plus 107 'migration' rows across
-- 85 students carried over from the old student-level pool. Not one was a
-- cashier's decision.
--
-- A chip labelled "Late fee waived (412)" would therefore tell the office that
-- 412 families had their late fee forgiven, when nobody forgave anything -- the
-- number would be an artefact of a data migration presented as a business fact.
-- Filtering on it would hand back a list nobody could act on.
--
-- The segment now counts only waivers a human granted: source 'manual' or
-- 'payment_desk'. That reads 0 today, which is honest, and grows as staff
-- actually use the waive action. The automatic ones remain fully visible in
-- student_late_fee_waivers with their reasons, and still net off the fee owed --
-- they are simply not what this filter is asking about.
--
-- Amending rather than fixing forward because these views were created minutes
-- ago in 20260809100000 and nothing reads them yet.

create or replace view public.v_student_installment_facets
with (security_invoker = true) as
select
  b.student_id,
  b.session_label,
  count(*)::integer                                      as installment_count,

  -- Retained for completeness: every waiver, automatic ones included. This is
  -- the figure that reconciles against the fee actually charged.
  count(*) filter (where b.waiver_applied > 0)::integer  as late_fee_waived_count,

  coalesce(sum(b.pending_amount) filter (where b.is_carry_forward), 0)::integer
                                                         as carry_forward_pending_amount,
  coalesce(sum(b.base_charge) filter (where b.is_carry_forward), 0)::integer
                                                         as carry_forward_original_amount,

  -- Mirrors calculateOverdueBaseAmount + calculateInstallmentBasePending
  -- (lib/fees/due-amounts.ts). TWO QUIRKS ARE PRESERVED DELIBERATELY so that no
  -- number already on screen moves as a side effect of adding a filter:
  --   * paid and adjustment are clamped at zero INDIVIDUALLY, which drops a
  --     negative reversal adjustment. This is the same defect that
  --     20260808160000 documented and corrected for the dashboard. Correcting it
  --     here would shift the Overdue figure for roughly 19 rows; that belongs in
  --     its own commit with a before/after diff, not buried in a filter change.
  --   * discount_closeout_amount is not netted, though base_outstanding_amount
  --     on the financials matview does net it.
  coalesce(sum(
    greatest(b.base_charge - greatest(b.paid_amount, 0) - greatest(b.adjustment_amount, 0), 0)
  ) filter (where b.balance_status = 'overdue'), 0)::integer as overdue_base_amount,

  -- Mirrors calculatePendingLateFeeAmount (lib/fees/due-amounts.ts:40-45).
  coalesce(sum(
    least(greatest(b.final_late_fee, 0), greatest(b.pending_amount, 0))
  ), 0)::integer                                         as pending_late_fee_amount
from public.v_workbook_installment_balances as b
group by b.student_id, b.session_label;

-- Manual waivers, counted straight off the waiver table so `source` is visible.
-- Uses student_late_fee_waivers_student_session_idx from 20260808131348.
create or replace view public.v_student_manual_late_fee_waivers
with (security_invoker = true) as
select
  w.student_id,
  w.session_label,
  count(*)::integer          as manual_waiver_count,
  sum(w.amount)::integer     as manual_waiver_amount
from public.student_late_fee_waivers as w
where w.voided_at is null
  and w.source in ('manual', 'payment_desk')
group by w.student_id, w.session_label;

comment on view public.v_student_manual_late_fee_waivers is
  'Late-fee waivers a person actually granted, excluding the automatic grandfather and migration rows written when the late-fee rule was unified. This is what a "Late fee waived" filter means to the office.';

revoke all on public.v_student_manual_late_fee_waivers from public, anon;
grant select on public.v_student_manual_late_fee_waivers to authenticated, service_role;

-- Re-create the directory so seg_late_fee_waived reads the manual view. Column
-- list is otherwise byte-identical to 20260809100000.
create or replace view public.v_student_directory
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
  (coalesce(f.status_label, '') = 'OVERDUE')          as seg_overdue,
  (coalesce(f.late_fee_outstanding_amount, 0) > 0)    as seg_late_fee_pending,
  (coalesce(f.status_label, '') = 'PARTLY PAID')      as seg_partly_paid,
  (coalesce(f.status_label, '') = 'PAID')             as seg_fully_paid,
  (coalesce(f.status_label, '') = 'NOT STARTED')      as seg_never_paid,
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

-- Re-assert the invariants: a new LEFT JOIN is exactly how fan-out gets in.
do $$
declare
  v_rows bigint;
  v_distinct bigint;
  v_expected bigint;
begin
  select count(*), count(distinct student_id) into v_rows, v_distinct
  from public.v_student_directory;

  select count(*) into v_expected
  from public.students s join public.classes c on c.id = s.class_id;

  if v_rows <> v_distinct or v_rows <> v_expected then
    raise exception
      'v_student_directory fans out after adding the manual-waiver join: % rows, % distinct students, % expected',
      v_rows, v_distinct, v_expected;
  end if;

  if exists (select 1 from public.v_student_directory where seg_late_fee_waived is null) then
    raise exception 'seg_late_fee_waived is null on some rows';
  end if;
end;
$$;

notify pgrst, 'reload schema';

-- Align workbook late-fee parity and expose the Students_Master projection fields.
-- Supabase CLI is unavailable in this workspace, so this migration was created
-- manually and kept in sync with supabase/schema.sql.

create or replace function private.workbook_installment_snapshot(
  p_student_id uuid default null,
  p_as_of_date date default current_date,
  p_include_candidate_late boolean default false
)
returns table (
  installment_id uuid,
  student_id uuid,
  admission_no text,
  student_name text,
  father_name text,
  father_phone text,
  session_label text,
  class_id uuid,
  class_name text,
  class_label text,
  section text,
  stream_name text,
  installment_no smallint,
  installment_label text,
  due_date date,
  base_charge integer,
  paid_amount integer,
  adjustment_amount integer,
  applied_amount integer,
  raw_late_fee integer,
  waiver_applied integer,
  final_late_fee integer,
  total_charge integer,
  pending_amount integer,
  balance_status text,
  last_payment_date date,
  transport_route_id uuid,
  transport_route_name text,
  transport_route_code text
)
language sql
stable
set search_path = public, private
as $$
  with active_policy as (
    select academic_session_label
    from public.fee_policy_configs
    where is_active = true
      and calculation_model = 'workbook_v1'
    order by updated_at desc
    limit 1
  ),
  session_installments as (
    select
      i.id as installment_id,
      i.student_id,
      s.admission_no,
      s.full_name as student_name,
      s.father_name,
      s.primary_phone as father_phone,
      c.session_label,
      i.class_id,
      c.class_name,
      private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label,
      coalesce(c.section, '') as section,
      coalesce(c.stream_name, '') as stream_name,
      i.installment_no,
      i.installment_label,
      i.due_date,
      i.amount_due as base_charge,
      i.status as installment_status,
      i.late_fee_flat_amount,
      coalesce(override_row.late_fee_waiver_amount, 0) as late_fee_waiver_total,
      s.transport_route_id,
      route_row.route_name as transport_route_name,
      route_row.route_code as transport_route_code
    from public.installments as i
    join public.students as s
      on s.id = i.student_id
    join public.classes as c
      on c.id = i.class_id
    join active_policy as policy_row
      on policy_row.academic_session_label = c.session_label
    left join public.student_fee_overrides as override_row
      on override_row.student_id = i.student_id
     and override_row.is_active = true
    left join public.transport_routes as route_row
      on route_row.id = s.transport_route_id
    where i.status <> 'cancelled'
      and (p_student_id is null or i.student_id = p_student_id)
  ),
  rolled as (
    select
      session_installments.*,
      coalesce(payment_row.paid_amount, 0)::integer as paid_amount,
      coalesce(payment_row.paid_by_due_amount, 0)::integer as paid_by_due_amount,
      coalesce(adjustment_row.adjustment_amount, 0)::integer as adjustment_amount,
      payment_row.last_payment_date,
      coalesce(payment_row.had_payment_after_due, false) as had_payment_after_due
    from session_installments
    left join lateral (
      select
        coalesce(sum(payment_row.amount), 0) as paid_amount,
        coalesce(sum(payment_row.amount) filter (where receipt_row.payment_date <= session_installments.due_date), 0) as paid_by_due_amount,
        max(receipt_row.payment_date) as last_payment_date,
        bool_or(receipt_row.payment_date > session_installments.due_date) as had_payment_after_due
      from public.payments as payment_row
      join public.receipts as receipt_row
        on receipt_row.id = payment_row.receipt_id
      where payment_row.installment_id = session_installments.installment_id
    ) as payment_row
      on true
    left join lateral (
      select coalesce(sum(adjustment_row.amount_delta), 0) as adjustment_amount
      from public.payment_adjustments as adjustment_row
      where adjustment_row.installment_id = session_installments.installment_id
    ) as adjustment_row
      on true
  ),
  late_eval as (
    select
      rolled.*,
      greatest(rolled.paid_amount + rolled.adjustment_amount, 0)::integer as applied_amount,
      greatest(
        rolled.base_charge - greatest(rolled.paid_amount + rolled.adjustment_amount, 0),
        0
      )::integer as base_pending_amount,
      case
        when rolled.installment_status = 'waived' then 0
        when rolled.base_charge <= 0 then 0
        when rolled.paid_by_due_amount >= rolled.base_charge then 0
        when rolled.had_payment_after_due then rolled.late_fee_flat_amount
        when p_include_candidate_late
          and p_as_of_date > rolled.due_date
          and greatest(
            rolled.base_charge - greatest(rolled.paid_amount + rolled.adjustment_amount, 0),
            0
          ) > 0
          then rolled.late_fee_flat_amount
        else 0
      end::integer as raw_late_fee
    from rolled
  ),
  waiver_eval as (
    select
      late_eval.*,
      least(
        late_eval.raw_late_fee,
        greatest(
          late_eval.late_fee_waiver_total - coalesce(
            sum(late_eval.raw_late_fee) over (
              partition by late_eval.student_id
              order by late_eval.installment_no
              rows between unbounded preceding and 1 preceding
            ),
            0
          ),
          0
        )
      )::integer as waiver_applied
    from late_eval
  )
  select
    waiver_eval.installment_id,
    waiver_eval.student_id,
    waiver_eval.admission_no,
    waiver_eval.student_name,
    waiver_eval.father_name,
    waiver_eval.father_phone,
    waiver_eval.session_label,
    waiver_eval.class_id,
    waiver_eval.class_name,
    waiver_eval.class_label,
    waiver_eval.section,
    waiver_eval.stream_name,
    waiver_eval.installment_no,
    waiver_eval.installment_label,
    waiver_eval.due_date,
    waiver_eval.base_charge,
    waiver_eval.paid_amount,
    waiver_eval.adjustment_amount,
    waiver_eval.applied_amount,
    waiver_eval.raw_late_fee,
    waiver_eval.waiver_applied,
    greatest(waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0)::integer as final_late_fee,
    greatest(waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0)::integer as total_charge,
    greatest(
      waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied - waiver_eval.applied_amount,
      0
    )::integer as pending_amount,
    case
      when waiver_eval.installment_status = 'waived' then 'waived'
      when greatest(
        waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied - waiver_eval.applied_amount,
        0
      ) <= 0 then 'paid'
      when waiver_eval.applied_amount > 0 then 'partial'
      when p_as_of_date > waiver_eval.due_date then 'overdue'
      else 'pending'
    end as balance_status,
    waiver_eval.last_payment_date,
    waiver_eval.transport_route_id,
    waiver_eval.transport_route_name,
    waiver_eval.transport_route_code
  from waiver_eval
  order by waiver_eval.student_id, waiver_eval.installment_no;
$$;

create or replace view public.v_workbook_installment_balances
with (security_invoker = true)
as
select *
from private.workbook_installment_snapshot(null, current_date, false);

create or replace view public.v_workbook_student_financials
with (security_invoker = true)
as
with active_policy as (
  select
    academic_session_label,
    installment_schedule,
    new_student_academic_fee_amount,
    old_student_academic_fee_amount
  from public.fee_policy_configs
  where is_active = true
    and calculation_model = 'workbook_v1'
  order by updated_at desc
  limit 1
),
school_default as (
  select
    tuition_fee_amount,
    transport_fee_amount,
    student_type_default
  from public.school_fee_defaults
  where is_active = true
  order by updated_at desc
  limit 1
),
student_base as (
  select
    s.id as student_id,
    s.admission_no,
    s.full_name as student_name,
    s.date_of_birth,
    s.father_name,
    s.mother_name,
    s.primary_phone as father_phone,
    s.secondary_phone as mother_phone,
    s.status as record_status,
    s.class_id,
    c.session_label,
    c.class_name,
    private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label,
    c.sort_order,
    s.transport_route_id,
    route_row.route_name as transport_route_name,
    route_row.route_code as transport_route_code,
    coalesce(
      nullif(trim(override_row.student_type_override), ''),
      fee_row.student_type_default,
      school_default.student_type_default,
      'existing'
    ) as student_status_code,
    coalesce(override_row.custom_tuition_fee_amount, fee_row.tuition_fee_amount, school_default.tuition_fee_amount, 0) as tuition_fee,
    case
      when override_row.custom_transport_fee_amount is not null then override_row.custom_transport_fee_amount
      when s.transport_route_id is not null then coalesce(
        route_row.annual_fee_amount,
        route_row.default_installment_amount * jsonb_array_length(active_policy.installment_schedule)
      )
      else 0
    end as transport_fee,
    case
      when override_row.other_adjustment_amount is not null then override_row.other_adjustment_amount
      when override_row.custom_other_fee_heads is not null and override_row.custom_other_fee_heads <> '{}'::jsonb then coalesce(
        (
          select sum(value::integer)
          from jsonb_each_text(override_row.custom_other_fee_heads)
        ),
        0
      )
      else 0
    end as other_adjustment_amount,
    case
      when nullif(trim(coalesce(override_row.other_adjustment_head, '')), '') is not null then nullif(trim(coalesce(override_row.other_adjustment_head, '')), '')
      when override_row.custom_other_fee_heads is not null and override_row.custom_other_fee_heads <> '{}'::jsonb then 'Other fee / adjustment'
      else null
    end as other_adjustment_head,
    coalesce(override_row.discount_amount, 0) as raw_discount_amount,
    coalesce(override_row.late_fee_waiver_amount, 0) as late_fee_waiver_amount,
    override_row.reason as override_reason,
    count(*) over (partition by nullif(trim(s.admission_no), '')) as admission_no_count
  from public.students as s
  join public.classes as c
    on c.id = s.class_id
  join active_policy
    on active_policy.academic_session_label = c.session_label
  left join school_default
    on true
  left join public.fee_settings as fee_row
    on fee_row.class_id = c.id
   and fee_row.is_active = true
  left join public.student_fee_overrides as override_row
    on override_row.student_id = s.id
   and override_row.is_active = true
  left join public.transport_routes as route_row
    on route_row.id = s.transport_route_id
),
student_profile as (
  select
    student_base.*,
    case
      when student_base.student_status_code = 'new' then active_policy.new_student_academic_fee_amount
      else active_policy.old_student_academic_fee_amount
    end as academic_fee
  from student_base
  join active_policy
    on active_policy.academic_session_label = student_base.session_label
),
student_profile_enriched as (
  select
    student_profile.*,
    greatest(
      0,
      student_profile.tuition_fee +
      student_profile.transport_fee +
      student_profile.academic_fee +
      student_profile.other_adjustment_amount
    ) as gross_base_before_discount,
    least(
      coalesce(student_profile.raw_discount_amount, 0),
      greatest(
        0,
        student_profile.tuition_fee +
        student_profile.transport_fee +
        student_profile.academic_fee +
        student_profile.other_adjustment_amount
      )
    ) as discount_amount
  from student_profile
),
installment_summary as (
  select
    student_id,
    coalesce(sum(base_charge), 0)::integer as base_charge_total,
    coalesce(sum(final_late_fee), 0)::integer as late_fee_total,
    coalesce(sum(total_charge), 0)::integer as total_due,
    coalesce(sum(applied_amount), 0)::integer as total_paid,
    coalesce(sum(pending_amount), 0)::integer as outstanding_amount,
    coalesce(max(last_payment_date), null) as last_payment_date,
    count(*) filter (where pending_amount <= 0) as paid_installment_count,
    count(*) filter (where pending_amount > 0 and applied_amount > 0) as partly_paid_installment_count,
    count(*) filter (where balance_status = 'overdue') as overdue_installment_count,
    max(case when installment_no = 1 then base_charge end)::integer as installment1_base,
    max(case when installment_no = 2 then base_charge end)::integer as installment2_base,
    max(case when installment_no = 3 then base_charge end)::integer as installment3_base,
    max(case when installment_no = 4 then base_charge end)::integer as installment4_base,
    max(case when installment_no = 1 then paid_amount end)::integer as paid_installment1,
    max(case when installment_no = 2 then paid_amount end)::integer as paid_installment2,
    max(case when installment_no = 3 then paid_amount end)::integer as paid_installment3,
    max(case when installment_no = 4 then paid_amount end)::integer as paid_installment4,
    max(case when installment_no = 1 then raw_late_fee end)::integer as raw_late_fee1,
    max(case when installment_no = 2 then raw_late_fee end)::integer as raw_late_fee2,
    max(case when installment_no = 3 then raw_late_fee end)::integer as raw_late_fee3,
    max(case when installment_no = 4 then raw_late_fee end)::integer as raw_late_fee4,
    max(case when installment_no = 1 then waiver_applied end)::integer as waiver_applied1,
    max(case when installment_no = 2 then waiver_applied end)::integer as waiver_applied2,
    max(case when installment_no = 3 then waiver_applied end)::integer as waiver_applied3,
    max(case when installment_no = 4 then waiver_applied end)::integer as waiver_applied4,
    max(case when installment_no = 1 then final_late_fee end)::integer as final_late_fee1,
    max(case when installment_no = 2 then final_late_fee end)::integer as final_late_fee2,
    max(case when installment_no = 3 then final_late_fee end)::integer as final_late_fee3,
    max(case when installment_no = 4 then final_late_fee end)::integer as final_late_fee4,
    max(case when installment_no = 1 then pending_amount end)::integer as inst1_pending,
    max(case when installment_no = 2 then pending_amount end)::integer as inst2_pending,
    max(case when installment_no = 3 then pending_amount end)::integer as inst3_pending,
    max(case when installment_no = 4 then pending_amount end)::integer as inst4_pending
  from public.v_workbook_installment_balances
  group by student_id
),
next_due as (
  select distinct on (student_id)
    student_id,
    due_date as next_due_date,
    pending_amount as next_due_amount,
    installment_label as next_due_label
  from public.v_workbook_installment_balances
  where pending_amount > 0
  order by student_id, due_date, installment_no
),
last_payment as (
  select distinct on (student_id)
    student_id,
    payment_date as last_payment_date,
    total_amount as last_payment_amount
  from public.receipts
  order by student_id, payment_date desc, created_at desc
)
select
  profile.student_id,
  case
    when nullif(trim(profile.admission_no), '') is not null then profile.class_label || '|' || profile.admission_no
    when profile.date_of_birth is not null then profile.class_label || '|' || profile.student_name || '|' || to_char(profile.date_of_birth, 'DDMMYYYY')
    else profile.class_label || '|' || profile.student_name
  end as workbook_student_key,
  profile.admission_no,
  profile.student_name,
  profile.date_of_birth,
  profile.father_name,
  profile.mother_name,
  profile.father_phone,
  profile.mother_phone,
  profile.record_status,
  profile.class_id,
  profile.session_label,
  profile.class_name,
  profile.class_label,
  profile.sort_order,
  profile.transport_route_id,
  profile.transport_route_name,
  profile.transport_route_code,
  profile.student_status_code,
  case when profile.student_status_code = 'new' then 'New' else 'Old' end as student_status_label,
  profile.tuition_fee,
  profile.transport_fee,
  profile.academic_fee,
  profile.other_adjustment_head,
  profile.other_adjustment_amount,
  profile.gross_base_before_discount,
  profile.discount_amount,
  profile.late_fee_waiver_amount,
  coalesce(summary.base_charge_total, greatest(profile.gross_base_before_discount - profile.discount_amount, 0)) as base_charge_total,
  coalesce(summary.base_charge_total, greatest(profile.gross_base_before_discount - profile.discount_amount, 0)) as base_total_due,
  coalesce(summary.installment1_base, 0) as installment1_base,
  coalesce(summary.installment2_base, 0) as installment2_base,
  coalesce(summary.installment3_base, 0) as installment3_base,
  coalesce(summary.installment4_base, 0) as installment4_base,
  coalesce(summary.paid_installment1, 0) as paid_installment1,
  coalesce(summary.paid_installment2, 0) as paid_installment2,
  coalesce(summary.paid_installment3, 0) as paid_installment3,
  coalesce(summary.paid_installment4, 0) as paid_installment4,
  coalesce(summary.raw_late_fee1, 0) as raw_late_fee1,
  coalesce(summary.raw_late_fee2, 0) as raw_late_fee2,
  coalesce(summary.raw_late_fee3, 0) as raw_late_fee3,
  coalesce(summary.raw_late_fee4, 0) as raw_late_fee4,
  coalesce(summary.waiver_applied1, 0) as waiver_applied1,
  coalesce(summary.waiver_applied2, 0) as waiver_applied2,
  coalesce(summary.waiver_applied3, 0) as waiver_applied3,
  coalesce(summary.waiver_applied4, 0) as waiver_applied4,
  coalesce(summary.final_late_fee1, 0) as final_late_fee1,
  coalesce(summary.final_late_fee2, 0) as final_late_fee2,
  coalesce(summary.final_late_fee3, 0) as final_late_fee3,
  coalesce(summary.final_late_fee4, 0) as final_late_fee4,
  coalesce(summary.inst1_pending, 0) as inst1_pending,
  coalesce(summary.inst2_pending, 0) as inst2_pending,
  coalesce(summary.inst3_pending, 0) as inst3_pending,
  coalesce(summary.inst4_pending, 0) as inst4_pending,
  coalesce(summary.late_fee_total, 0) as late_fee_total,
  coalesce(summary.total_due, greatest(profile.gross_base_before_discount - profile.discount_amount, 0)) as total_due,
  coalesce(summary.total_paid, 0) as total_paid,
  coalesce(summary.outstanding_amount, greatest(profile.gross_base_before_discount - profile.discount_amount, 0)) as outstanding_amount,
  next_due.next_due_date,
  next_due.next_due_amount,
  next_due.next_due_label,
  coalesce(last_payment.last_payment_date, summary.last_payment_date) as last_payment_date,
  coalesce(last_payment.last_payment_amount, 0) as last_payment_amount,
  coalesce(summary.paid_installment_count, 0) as paid_installment_count,
  coalesce(summary.partly_paid_installment_count, 0) as partly_paid_installment_count,
  coalesce(summary.overdue_installment_count, 0) as overdue_installment_count,
  case
    when coalesce(summary.total_due, greatest(profile.gross_base_before_discount - profile.discount_amount, 0)) <= 0 then ''
    when coalesce(summary.outstanding_amount, greatest(profile.gross_base_before_discount - profile.discount_amount, 0)) <= 0 then 'PAID'
    when coalesce(summary.total_paid, 0) <= 0 then 'NOT STARTED'
    when next_due.next_due_date is not null and current_date > next_due.next_due_date then 'OVERDUE'
    else 'PARTLY PAID'
  end as status_label,
  case when nullif(trim(profile.admission_no), '') is not null and profile.admission_no_count > 1 then true else false end as duplicate_sr_flag,
  case when profile.date_of_birth is null then true else false end as missing_dob_flag,
  case when nullif(trim(profile.class_label), '') is null then true else false end as missing_class_flag,
  case when nullif(trim(profile.student_status_code), '') is null then true else false end as missing_status_flag,
  profile.override_reason
from student_profile_enriched as profile
left join installment_summary as summary
  on summary.student_id = profile.student_id
left join next_due
  on next_due.student_id = profile.student_id
left join last_payment
  on last_payment.student_id = profile.student_id;

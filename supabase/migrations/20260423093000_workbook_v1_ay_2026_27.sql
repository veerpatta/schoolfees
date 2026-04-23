alter table public.fee_policy_configs
  add column if not exists calculation_model text not null default 'standard'
    check (calculation_model in ('standard', 'workbook_v1')),
  add column if not exists new_student_academic_fee_amount integer not null default 1100
    check (new_student_academic_fee_amount >= 0),
  add column if not exists old_student_academic_fee_amount integer not null default 500
    check (old_student_academic_fee_amount >= 0);

alter table public.transport_routes
  add column if not exists annual_fee_amount integer
    check (annual_fee_amount >= 0);

alter table public.student_fee_overrides
  add column if not exists other_adjustment_head text,
  add column if not exists other_adjustment_amount integer,
  add column if not exists late_fee_waiver_amount integer not null default 0
    check (late_fee_waiver_amount >= 0);

alter table public.student_fee_overrides
  drop constraint if exists student_fee_overrides_override_payload_check,
  add constraint student_fee_overrides_override_payload_check
  check (
    custom_annual_base_amount is not null
    or custom_transport_installment_amount is not null
    or custom_late_fee_flat_amount is not null
    or discount_amount > 0
    or custom_tuition_fee_amount is not null
    or custom_transport_fee_amount is not null
    or custom_books_fee_amount is not null
    or custom_admission_activity_misc_fee_amount is not null
    or (
      custom_other_fee_heads is not null
      and custom_other_fee_heads <> '{}'::jsonb
    )
    or student_type_override is not null
    or transport_applies_override is not null
    or coalesce(other_adjustment_amount, 0) <> 0
    or nullif(trim(coalesce(other_adjustment_head, '')), '') is not null
    or late_fee_waiver_amount > 0
  );

create index if not exists idx_transport_routes_annual_fee_amount
on public.transport_routes (annual_fee_amount)
where annual_fee_amount is not null;

create index if not exists idx_receipts_reference_number
on public.receipts (reference_number)
where reference_number is not null;

create or replace function private.normalize_workbook_class_label(
  p_class_name text,
  p_stream_name text default null
)
returns text
language sql
immutable
set search_path = private
as $$
  select case regexp_replace(
    lower(coalesce(p_class_name, '') || coalesce(p_stream_name, '')),
    '[^a-z0-9]+',
    '',
    'g'
  )
    when 'nursery' then 'Nursery'
    when 'kg1' then 'JKG'
    when 'jkg' then 'JKG'
    when 'lkg' then 'JKG'
    when 'kg2' then 'SKG'
    when 'skg' then 'SKG'
    when 'ukg' then 'SKG'
    when 'class1' then 'Class 1'
    when '1' then 'Class 1'
    when '1st' then 'Class 1'
    when 'first' then 'Class 1'
    when 'class2' then 'Class 2'
    when '2' then 'Class 2'
    when '2nd' then 'Class 2'
    when 'second' then 'Class 2'
    when 'class3' then 'Class 3'
    when '3' then 'Class 3'
    when '3rd' then 'Class 3'
    when 'third' then 'Class 3'
    when 'class4' then 'Class 4'
    when '4' then 'Class 4'
    when '4th' then 'Class 4'
    when 'fourth' then 'Class 4'
    when 'class5' then 'Class 5'
    when '5' then 'Class 5'
    when '5th' then 'Class 5'
    when 'fifth' then 'Class 5'
    when 'class6' then 'Class 6'
    when '6' then 'Class 6'
    when '6th' then 'Class 6'
    when 'sixth' then 'Class 6'
    when 'class7' then 'Class 7'
    when '7' then 'Class 7'
    when '7th' then 'Class 7'
    when 'seventh' then 'Class 7'
    when 'class8' then 'Class 8'
    when '8' then 'Class 8'
    when '8th' then 'Class 8'
    when 'eighth' then 'Class 8'
    when 'class9' then 'Class 9'
    when '9' then 'Class 9'
    when '9th' then 'Class 9'
    when 'ninth' then 'Class 9'
    when 'class10' then 'Class 10'
    when '10' then 'Class 10'
    when '10th' then 'Class 10'
    when 'tenth' then 'Class 10'
    when '11arts' then '11 Arts'
    when '11tharts' then '11 Arts'
    when 'class11arts' then '11 Arts'
    when 'xiarts' then '11 Arts'
    when '11commerce' then '11 Commerce'
    when '11thcommerce' then '11 Commerce'
    when 'class11commerce' then '11 Commerce'
    when 'xicommerce' then '11 Commerce'
    when '11science' then '11 Science'
    when '11thscience' then '11 Science'
    when 'class11science' then '11 Science'
    when 'xiscience' then '11 Science'
    when '12arts' then '12 Arts'
    when '12tharts' then '12 Arts'
    when 'class12arts' then '12 Arts'
    when 'xiiarts' then '12 Arts'
    when '12commerce' then '12 Commerce'
    when '12thcommerce' then '12 Commerce'
    when 'class12commerce' then '12 Commerce'
    when 'xiicommerce' then '12 Commerce'
    when '12science' then '12 Science'
    when '12thscience' then '12 Science'
    when 'class12science' then '12 Science'
    when 'xiiscience' then '12 Science'
    else coalesce(nullif(trim(concat_ws(' ', p_class_name, p_stream_name)), ''), 'Unknown class')
  end;
$$;

update public.classes
set session_label = '2026-27'
where trim(session_label) = '2026-2027';

insert into public.academic_sessions (
  session_label,
  status,
  is_current,
  notes
)
values (
  '2026-27',
  'active',
  true,
  'Workbook parity session for AY 2026-27'
)
on conflict (session_label) do update
set
  status = 'active',
  is_current = true,
  notes = excluded.notes,
  updated_at = now();

update public.academic_sessions
set is_current = false,
    status = case when session_label = '2026-27' then 'active' else status end,
    updated_at = now()
where session_label <> '2026-27'
  and is_current = true;

with class_seed as (
  select *
  from (
    values
      ('Nursery', 1, 16000),
      ('JKG', 2, 17000),
      ('SKG', 3, 17000),
      ('Class 1', 4, 18000),
      ('Class 2', 5, 18500),
      ('Class 3', 6, 19000),
      ('Class 4', 7, 19500),
      ('Class 5', 8, 20000),
      ('Class 6', 9, 21000),
      ('Class 7', 10, 22000),
      ('Class 8', 11, 23000),
      ('Class 9', 12, 24000),
      ('Class 10', 13, 25000),
      ('11 Arts', 14, 30000),
      ('11 Commerce', 15, 30000),
      ('11 Science', 16, 35000),
      ('12 Arts', 17, 32000),
      ('12 Commerce', 18, 32000),
      ('12 Science', 19, 38000)
  ) as seed(class_label, sort_order, tuition_fee_amount)
),
existing_match as (
  select
    c.id,
    private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label
  from public.classes as c
  where c.session_label = '2026-27'
),
inserted_classes as (
  insert into public.classes (
    session_label,
    class_name,
    section,
    stream_name,
    sort_order,
    status,
    notes
  )
  select
    '2026-27',
    seed.class_label,
    null,
    null,
    seed.sort_order,
    'active'::public.class_status,
    'AY 2026-27 workbook class seed'
  from class_seed as seed
  where not exists (
    select 1
    from existing_match as match_row
    where match_row.class_label = seed.class_label
  )
  returning id, class_name
),
all_session_classes as (
  select
    c.id,
    private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label
  from public.classes as c
  where c.session_label = '2026-27'
)
insert into public.fee_settings (
  class_id,
  annual_base_amount,
  late_fee_flat_amount,
  installment_count,
  tuition_fee_amount,
  transport_fee_amount,
  books_fee_amount,
  admission_activity_misc_fee_amount,
  other_fee_heads,
  student_type_default,
  transport_applies_default,
  notes,
  is_active
)
select
  class_row.id,
  seed.tuition_fee_amount,
  1000,
  4,
  seed.tuition_fee_amount,
  0,
  0,
  0,
  '{}'::jsonb,
  'existing',
  false,
  'AY 2026-27 workbook tuition default',
  true
from class_seed as seed
join all_session_classes as class_row
  on class_row.class_label = seed.class_label
where not exists (
  select 1
  from public.fee_settings as fs
  where fs.class_id = class_row.id
    and fs.is_active = true
);

with class_seed as (
  select *
  from (
    values
      ('Nursery', 16000),
      ('JKG', 17000),
      ('SKG', 17000),
      ('Class 1', 18000),
      ('Class 2', 18500),
      ('Class 3', 19000),
      ('Class 4', 19500),
      ('Class 5', 20000),
      ('Class 6', 21000),
      ('Class 7', 22000),
      ('Class 8', 23000),
      ('Class 9', 24000),
      ('Class 10', 25000),
      ('11 Arts', 30000),
      ('11 Commerce', 30000),
      ('11 Science', 35000),
      ('12 Arts', 32000),
      ('12 Commerce', 32000),
      ('12 Science', 38000)
  ) as seed(class_label, tuition_fee_amount)
)
update public.fee_settings as fs
set
  annual_base_amount = seed.tuition_fee_amount,
  late_fee_flat_amount = 1000,
  installment_count = 4,
  tuition_fee_amount = seed.tuition_fee_amount,
  transport_fee_amount = 0,
  books_fee_amount = 0,
  admission_activity_misc_fee_amount = 0,
  other_fee_heads = '{}'::jsonb,
  student_type_default = 'existing',
  transport_applies_default = false,
  notes = 'AY 2026-27 workbook tuition default',
  is_active = true,
  updated_at = now()
from public.classes as c
join class_seed as seed
  on seed.class_label = private.normalize_workbook_class_label(c.class_name, c.stream_name)
where fs.class_id = c.id
  and c.session_label = '2026-27'
  and fs.is_active = true;

with route_seed as (
  select *
  from (
    values
      ('No Transport', 0),
      ('Amet Bus', 5500),
      ('Amet College Side (On Road)', 6000),
      ('Amet College Road (Colony Inside)', 6000),
      ('Amet Railway Station (On Road)', 7000),
      ('Amet Railway Station (Inside)', 7000),
      ('Amet City', 7000),
      ('Bhopji Ka Kheda', 11000),
      ('Ballo Ka Khera', 12000),
      ('Makarda', 14000),
      ('Masingpura', 14000),
      ('Jilola', 17000),
      ('Mund Koshiya', 12000),
      ('Dhelana', 11000),
      ('Selaguda', 9000),
      ('Kanji Ka Kedha', 4000),
      ('Aambaghati', 6000),
      ('Banda', 9500),
      ('Aidana', 11500),
      ('Karera', 13000),
      ('Saprav', 10500),
      ('Dabla', 14500),
      ('Tanvan', 6000),
      ('Sardargarh', 14000),
      ('Agariya Kotari', 9000),
      ('Gugli', 11500),
      ('Ghosundi', 10000),
      ('Agariya', 10000),
      ('Bhakroda', 14000)
  ) as seed(route_name, annual_fee_amount)
)
insert into public.transport_routes (
  route_code,
  route_name,
  default_installment_amount,
  annual_fee_amount,
  is_active,
  notes
)
select
  null,
  seed.route_name,
  floor(seed.annual_fee_amount / 4.0)::integer,
  seed.annual_fee_amount,
  true,
  'AY 2026-27 workbook route seed'
from route_seed as seed
where not exists (
  select 1
  from public.transport_routes as routes
  where lower(trim(routes.route_name)) = lower(trim(seed.route_name))
)
on conflict do nothing;

with route_seed as (
  select *
  from (
    values
      ('No Transport', 0),
      ('Amet Bus', 5500),
      ('Amet College Side (On Road)', 6000),
      ('Amet College Road (Colony Inside)', 6000),
      ('Amet Railway Station (On Road)', 7000),
      ('Amet Railway Station (Inside)', 7000),
      ('Amet City', 7000),
      ('Bhopji Ka Kheda', 11000),
      ('Ballo Ka Khera', 12000),
      ('Makarda', 14000),
      ('Masingpura', 14000),
      ('Jilola', 17000),
      ('Mund Koshiya', 12000),
      ('Dhelana', 11000),
      ('Selaguda', 9000),
      ('Kanji Ka Kedha', 4000),
      ('Aambaghati', 6000),
      ('Banda', 9500),
      ('Aidana', 11500),
      ('Karera', 13000),
      ('Saprav', 10500),
      ('Dabla', 14500),
      ('Tanvan', 6000),
      ('Sardargarh', 14000),
      ('Agariya Kotari', 9000),
      ('Gugli', 11500),
      ('Ghosundi', 10000),
      ('Agariya', 10000),
      ('Bhakroda', 14000)
  ) as seed(route_name, annual_fee_amount)
)
update public.transport_routes as routes
set
  default_installment_amount = floor(seed.annual_fee_amount / 4.0)::integer,
  annual_fee_amount = seed.annual_fee_amount,
  is_active = true,
  notes = 'AY 2026-27 workbook route seed',
  updated_at = now()
from route_seed as seed
where lower(trim(routes.route_name)) = lower(trim(seed.route_name));

update public.fee_policy_configs
set
  academic_session_label = '2026-27',
  calculation_model = 'workbook_v1',
  installment_schedule = jsonb_build_array(
    jsonb_build_object('label', 'Installment 1', 'dueDateLabel', '20-04-2026'),
    jsonb_build_object('label', 'Installment 2', 'dueDateLabel', '20-07-2026'),
    jsonb_build_object('label', 'Installment 3', 'dueDateLabel', '20-10-2026'),
    jsonb_build_object('label', 'Installment 4', 'dueDateLabel', '20-01-2027')
  ),
  late_fee_flat_amount = 1000,
  new_student_academic_fee_amount = 1100,
  old_student_academic_fee_amount = 500,
  accepted_payment_modes = array[
    'cash'::public.payment_mode,
    'upi'::public.payment_mode,
    'bank_transfer'::public.payment_mode,
    'cheque'::public.payment_mode
  ],
  receipt_prefix = 'SVP',
  notes = 'AY 2026-27 workbook policy. Workbook note conflict resolved in favour of editable Fee_Setup value: flat late fee Rs 1000. Books stay excluded from workbook mode.',
  is_active = true,
  updated_at = now()
where is_active = true;

insert into public.fee_policy_configs (
  academic_session_label,
  calculation_model,
  installment_schedule,
  late_fee_flat_amount,
  new_student_academic_fee_amount,
  old_student_academic_fee_amount,
  custom_fee_heads,
  accepted_payment_modes,
  receipt_prefix,
  notes,
  is_active
)
select
  '2026-27',
  'workbook_v1',
  jsonb_build_array(
    jsonb_build_object('label', 'Installment 1', 'dueDateLabel', '20-04-2026'),
    jsonb_build_object('label', 'Installment 2', 'dueDateLabel', '20-07-2026'),
    jsonb_build_object('label', 'Installment 3', 'dueDateLabel', '20-10-2026'),
    jsonb_build_object('label', 'Installment 4', 'dueDateLabel', '20-01-2027')
  ),
  1000,
  1100,
  500,
  '[]'::jsonb,
  array[
    'cash'::public.payment_mode,
    'upi'::public.payment_mode,
    'bank_transfer'::public.payment_mode,
    'cheque'::public.payment_mode
  ],
  'SVP',
  'AY 2026-27 workbook policy. Workbook note conflict resolved in favour of editable Fee_Setup value: flat late fee Rs 1000. Books stay excluded from workbook mode.',
  true
where not exists (
  select 1
  from public.fee_policy_configs
  where is_active = true
);

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
      coalesce(adjustment_row.adjustment_amount, 0)::integer as adjustment_amount,
      payment_row.last_payment_date,
      coalesce(payment_row.had_payment_after_due, false) as had_payment_after_due
    from session_installments
    left join lateral (
      select
        coalesce(sum(payment_row.amount), 0) as paid_amount,
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
        when greatest(
          rolled.base_charge - greatest(rolled.paid_amount + rolled.adjustment_amount, 0),
          0
        ) <= 0 then 0
        when rolled.had_payment_after_due then rolled.late_fee_flat_amount
        when p_include_candidate_late and p_as_of_date > rolled.due_date then rolled.late_fee_flat_amount
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
    override_row.reason as override_reason
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
)
select
  profile.student_id,
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
  coalesce(summary.late_fee_total, 0) as late_fee_total,
  coalesce(summary.total_due, greatest(profile.gross_base_before_discount - profile.discount_amount, 0)) as total_due,
  coalesce(summary.total_paid, 0) as total_paid,
  coalesce(summary.outstanding_amount, greatest(profile.gross_base_before_discount - profile.discount_amount, 0)) as outstanding_amount,
  next_due.next_due_date,
  next_due.next_due_amount,
  next_due.next_due_label,
  summary.last_payment_date,
  coalesce(summary.paid_installment_count, 0) as paid_installment_count,
  coalesce(summary.partly_paid_installment_count, 0) as partly_paid_installment_count,
  coalesce(summary.overdue_installment_count, 0) as overdue_installment_count,
  coalesce(summary.inst1_pending, 0) as inst1_pending,
  coalesce(summary.inst2_pending, 0) as inst2_pending,
  coalesce(summary.inst3_pending, 0) as inst3_pending,
  coalesce(summary.inst4_pending, 0) as inst4_pending,
  case
    when coalesce(summary.total_due, greatest(profile.gross_base_before_discount - profile.discount_amount, 0)) <= 0 then ''
    when coalesce(summary.outstanding_amount, greatest(profile.gross_base_before_discount - profile.discount_amount, 0)) <= 0 then 'PAID'
    when coalesce(summary.total_paid, 0) <= 0 then 'NOT STARTED'
    when next_due.next_due_date is not null and current_date > next_due.next_due_date then 'OVERDUE'
    else 'PARTLY PAID'
  end as status_label,
  profile.override_reason
from student_profile_enriched as profile
left join installment_summary as summary
  on summary.student_id = profile.student_id
left join next_due
  on next_due.student_id = profile.student_id;

create or replace function public.post_student_payment(
  p_student_id uuid,
  p_payment_date date,
  p_payment_mode public.payment_mode,
  p_total_amount integer,
  p_reference_number text default null,
  p_remarks text default null,
  p_received_by text default null,
  p_receipt_prefix text default 'SVP'
)
returns table (
  receipt_id uuid,
  receipt_number text,
  allocated_total integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  balance_row record;
  allocation_amount integer;
  remaining_amount integer;
  daily_sequence integer;
  candidate_receipt_number text;
  candidate_receipt_id uuid;
  total_outstanding integer;
  normalized_prefix text;
  active_policy_model text;
  active_policy_session text;
  student_session_label text;
  use_workbook_mode boolean := false;
begin
  if not public.has_permission('payments:write') then
    raise exception 'You do not have permission to post payments.';
  end if;

  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'Payment amount must be greater than 0.';
  end if;

  if p_payment_date is null then
    raise exception 'Payment date is required.';
  end if;

  if p_student_id is null then
    raise exception 'Student is required.';
  end if;

  select c.session_label
  into student_session_label
  from public.students as s
  join public.classes as c
    on c.id = s.class_id
  where s.id = p_student_id;

  if student_session_label is null then
    raise exception 'Selected student was not found.';
  end if;

  select calculation_model, academic_session_label
  into active_policy_model, active_policy_session
  from public.fee_policy_configs
  where is_active = true
  order by updated_at desc
  limit 1;

  use_workbook_mode :=
    active_policy_model = 'workbook_v1'
    and student_session_label = active_policy_session;

  normalized_prefix := nullif(trim(coalesce(p_receipt_prefix, '')), '');

  if normalized_prefix is null then
    normalized_prefix := 'SVP';
  end if;

  if use_workbook_mode then
    select coalesce(sum(pending_amount), 0)
    into total_outstanding
    from private.workbook_installment_snapshot(
      p_student_id,
      p_payment_date,
      true
    )
    where pending_amount > 0;
  else
    select coalesce(sum(outstanding_amount), 0)
    into total_outstanding
    from public.v_installment_balances
    where student_id = p_student_id
      and outstanding_amount > 0;
  end if;

  if total_outstanding <= 0 then
    raise exception 'No pending dues are available for this student.';
  end if;

  if p_total_amount > total_outstanding then
    raise exception 'Payment amount cannot exceed total pending amount.';
  end if;

  select coalesce(
    max((regexp_match(receipt_number, '-([0-9]{4})$'))[1]::integer),
    0
  )
  into daily_sequence
  from public.receipts
  where receipt_number like normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-%';

  for _attempt in 1..12 loop
    daily_sequence := daily_sequence + 1;
    candidate_receipt_number :=
      normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-' || lpad(daily_sequence::text, 4, '0');

    begin
      insert into public.receipts (
        receipt_number,
        student_id,
        payment_date,
        payment_mode,
        total_amount,
        reference_number,
        notes,
        received_by
      )
      values (
        candidate_receipt_number,
        p_student_id,
        p_payment_date,
        p_payment_mode,
        p_total_amount,
        nullif(trim(coalesce(p_reference_number, '')), ''),
        nullif(trim(coalesce(p_remarks, '')), ''),
        nullif(trim(coalesce(p_received_by, '')), '')
      )
      returning id into candidate_receipt_id;

      exit;
    exception
      when unique_violation then
        continue;
    end;
  end loop;

  if candidate_receipt_id is null then
    raise exception 'Unable to generate a unique receipt number. Please retry.';
  end if;

  remaining_amount := p_total_amount;

  if use_workbook_mode then
    for balance_row in
      select installment_id, pending_amount
      from private.workbook_installment_snapshot(
        p_student_id,
        p_payment_date,
        true
      )
      where pending_amount > 0
      order by due_date asc, installment_no asc
    loop
      exit when remaining_amount <= 0;

      allocation_amount := least(remaining_amount, balance_row.pending_amount);

      if allocation_amount <= 0 then
        continue;
      end if;

      insert into public.payments (
        receipt_id,
        student_id,
        installment_id,
        amount,
        notes
      )
      values (
        candidate_receipt_id,
        p_student_id,
        balance_row.installment_id,
        allocation_amount,
        nullif(trim(coalesce(p_remarks, '')), '')
      );

      remaining_amount := remaining_amount - allocation_amount;
    end loop;
  else
    for balance_row in
      select installment_id, outstanding_amount
      from public.v_installment_balances
      where student_id = p_student_id
        and outstanding_amount > 0
      order by due_date asc, installment_no asc
    loop
      exit when remaining_amount <= 0;

      allocation_amount := least(remaining_amount, balance_row.outstanding_amount);

      if allocation_amount <= 0 then
        continue;
      end if;

      insert into public.payments (
        receipt_id,
        student_id,
        installment_id,
        amount,
        notes
      )
      values (
        candidate_receipt_id,
        p_student_id,
        balance_row.installment_id,
        allocation_amount,
        nullif(trim(coalesce(p_remarks, '')), '')
      );

      remaining_amount := remaining_amount - allocation_amount;
    end loop;
  end if;

  if remaining_amount <> 0 then
    raise exception 'Unable to allocate payment cleanly. Please retry.';
  end if;

  return query
  select
    candidate_receipt_id as receipt_id,
    candidate_receipt_number as receipt_number,
    p_total_amount as allocated_total;
end;
$$;

grant execute on function public.post_student_payment(
  uuid,
  date,
  public.payment_mode,
  integer,
  text,
  text,
  text,
  text
) to authenticated;

create or replace function public.import_student_batch_row(
  p_batch_id uuid,
  p_row_index integer,
  p_full_name text,
  p_class_id uuid,
  p_admission_no text,
  p_date_of_birth date,
  p_father_name text,
  p_mother_name text,
  p_primary_phone text,
  p_secondary_phone text,
  p_address text,
  p_transport_route_id uuid,
  p_status public.student_status,
  p_notes text,
  p_custom_tuition_fee_amount integer,
  p_custom_transport_fee_amount integer,
  p_custom_books_fee_amount integer,
  p_custom_admission_activity_misc_fee_amount integer,
  p_custom_other_fee_heads jsonb,
  p_custom_late_fee_flat_amount integer,
  p_discount_amount integer,
  p_student_type_override text,
  p_transport_applies_override boolean,
  p_other_adjustment_head text default null,
  p_other_adjustment_amount integer default null,
  p_late_fee_waiver_amount integer default 0
)
returns table (
  student_id uuid,
  student_fee_override_id uuid
)
language plpgsql
set search_path = public, private
as $$
declare
  inserted_student_id uuid;
  imported_override_id uuid := null;
  active_fee_setting_id uuid;
  has_override boolean;
begin
  insert into public.students (
    full_name,
    class_id,
    admission_no,
    date_of_birth,
    father_name,
    mother_name,
    primary_phone,
    secondary_phone,
    address,
    transport_route_id,
    status,
    notes
  )
  values (
    trim(p_full_name),
    p_class_id,
    trim(p_admission_no),
    p_date_of_birth,
    nullif(trim(coalesce(p_father_name, '')), ''),
    nullif(trim(coalesce(p_mother_name, '')), ''),
    nullif(trim(coalesce(p_primary_phone, '')), ''),
    nullif(trim(coalesce(p_secondary_phone, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    p_transport_route_id,
    p_status,
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into inserted_student_id;

  has_override :=
    p_custom_tuition_fee_amount is not null
    or p_custom_transport_fee_amount is not null
    or p_custom_books_fee_amount is not null
    or p_custom_admission_activity_misc_fee_amount is not null
    or p_custom_late_fee_flat_amount is not null
    or coalesce(p_discount_amount, 0) > 0
    or (
      p_custom_other_fee_heads is not null
      and p_custom_other_fee_heads <> '{}'::jsonb
    )
    or nullif(trim(coalesce(p_student_type_override, '')), '') is not null
    or p_transport_applies_override is not null
    or coalesce(p_other_adjustment_amount, 0) <> 0
    or nullif(trim(coalesce(p_other_adjustment_head, '')), '') is not null
    or coalesce(p_late_fee_waiver_amount, 0) > 0;

  if has_override then
    select fs.id
    into active_fee_setting_id
    from public.fee_settings as fs
    where fs.class_id = p_class_id
      and fs.is_active = true
    limit 1;

    if active_fee_setting_id is null then
      raise exception 'No active fee settings found for imported student class.';
    end if;

    insert into public.student_fee_overrides (
      student_id,
      fee_setting_id,
      custom_tuition_fee_amount,
      custom_transport_fee_amount,
      custom_books_fee_amount,
      custom_admission_activity_misc_fee_amount,
      custom_other_fee_heads,
      custom_late_fee_flat_amount,
      other_adjustment_head,
      other_adjustment_amount,
      late_fee_waiver_amount,
      discount_amount,
      student_type_override,
      transport_applies_override,
      reason,
      notes,
      is_active
    )
    values (
      inserted_student_id,
      active_fee_setting_id,
      p_custom_tuition_fee_amount,
      p_custom_transport_fee_amount,
      p_custom_books_fee_amount,
      p_custom_admission_activity_misc_fee_amount,
      case
        when p_custom_other_fee_heads is null then '{}'::jsonb
        else p_custom_other_fee_heads
      end,
      p_custom_late_fee_flat_amount,
      nullif(trim(coalesce(p_other_adjustment_head, '')), ''),
      p_other_adjustment_amount,
      greatest(coalesce(p_late_fee_waiver_amount, 0), 0),
      coalesce(p_discount_amount, 0),
      nullif(trim(coalesce(p_student_type_override, '')), ''),
      p_transport_applies_override,
      format('Imported from batch %s row %s', p_batch_id, p_row_index),
      null,
      true
    )
    returning id into imported_override_id;
  end if;

  return query
  select inserted_student_id, imported_override_id;
end;
$$;

grant execute on function public.import_student_batch_row(
  uuid,
  integer,
  text,
  uuid,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  uuid,
  public.student_status,
  text,
  integer,
  integer,
  integer,
  integer,
  jsonb,
  integer,
  integer,
  text,
  boolean,
  text,
  integer,
  integer
) to authenticated;

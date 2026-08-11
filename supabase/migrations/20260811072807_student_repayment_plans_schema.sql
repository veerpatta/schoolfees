-- Monthly EMI repayment plans — storage layer.
--
-- An EMI plan does NOT rewrite installments, receipts or the fee engine. It is
-- an auditable layer ON TOP of dues that already exist: it names the exact
-- installments a family has agreed to clear monthly, fixes a calendar for that
-- clearing, and permanently forgives the late fees on those rows. The canonical
-- ledger underneath stays byte-for-byte what it was.
--
-- Four tables:
--   student_repayment_plans          the agreement (mutable lifecycle only)
--   student_repayment_plan_items     which installments it covers + snapshots
--   student_repayment_schedule       the monthly calendar
--   student_repayment_receipt_links  what each receipt contributed to the plan
--
-- Everything except the plan's own lifecycle columns is append-only. A plan is
-- never edited in place: rescheduling writes a REPLACEMENT plan and marks the
-- old one superseded, so the schedule a parent was shown is always recoverable.

-- ---------------------------------------------------------------------------
-- Late-fee waivers gain a fourth source.
--
-- Plan waivers are permanent and cover FUTURE late fees too: the waiver row is
-- written for the installment's full late_fee_flat_amount at activation, so
-- when the due date later passes, `waiver_applied = least(raw_late_fee, waived)`
-- cancels it before it can ever reach the family.
-- ---------------------------------------------------------------------------

alter table public.student_late_fee_waivers
  drop constraint if exists student_late_fee_waivers_source_check;

alter table public.student_late_fee_waivers
  add constraint student_late_fee_waivers_source_check
  check (source = any (array['manual', 'payment_desk', 'migration', 'grandfather', 'repayment_plan']));


-- ---------------------------------------------------------------------------
-- The agreement
-- ---------------------------------------------------------------------------

create table if not exists public.student_repayment_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  session_label text not null,

  -- 'old_balance_only'  — carry-forward (previous-year) dues only.
  -- 'old_and_current'   — carry-forward PLUS every unpaid current-year charge,
  --                        including installments not yet due.
  scope text not null check (scope in ('old_balance_only', 'old_and_current')),

  opening_balance integer not null check (opening_balance > 0),
  monthly_amount integer not null check (monthly_amount > 0),
  first_due_date date not null,
  term_months smallint not null check (term_months between 1 and 12),
  -- The last EMI absorbs the remainder, so it is <= monthly_amount.
  final_installment_amount integer not null check (final_installment_amount > 0),

  -- Late fee already charged on the covered rows at activation. Display only —
  -- the authoritative record is the student_late_fee_waivers rows themselves.
  waived_late_fee_total integer not null default 0 check (waived_late_fee_total >= 0),

  reason text not null check (length(btrim(reason)) >= 4),

  -- Double-submit protection for activation, same contract as receipts.
  client_request_id uuid,

  lifecycle text not null default 'active'
    check (lifecycle in ('active', 'cancelled', 'superseded')),

  -- Reschedule chain. Both directions so either end can walk the history.
  --
  -- superseded_by is DEFERRABLE on purpose. Rescheduling has to retire the old
  -- plan BEFORE inserting the replacement, or the one-active-plan-per-student
  -- index fires; but retiring it means naming a successor that does not exist
  -- yet. Deferring the check to commit lets both facts be true at once.
  supersedes_plan_id uuid references public.student_repayment_plans (id) on delete set null,
  superseded_by_plan_id uuid references public.student_repayment_plans (id) on delete set null
    deferrable initially deferred,

  activated_by uuid references auth.users (id) on delete set null,
  activated_by_label text,
  activated_at timestamp with time zone not null default now(),

  cancelled_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamp with time zone,
  cancellation_reason text,

  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint student_repayment_plans_final_within_monthly
    check (final_installment_amount <= monthly_amount),

  -- monthly * (term - 1) + final must be exactly the opening balance.
  constraint student_repayment_plans_schedule_totals
    check (monthly_amount * (term_months - 1) + final_installment_amount = opening_balance),

  -- Cancelling requires a reason and a timestamp; nothing else may carry them.
  constraint student_repayment_plans_cancel_complete
    check (
      (lifecycle = 'cancelled'
        and cancelled_at is not null
        and length(btrim(coalesce(cancellation_reason, ''))) >= 4)
      or (lifecycle <> 'cancelled'
        and cancelled_at is null
        and cancellation_reason is null)
    ),

  constraint student_repayment_plans_supersede_complete
    check (lifecycle <> 'superseded' or superseded_by_plan_id is not null),

  constraint student_repayment_plans_no_self_supersede
    check (superseded_by_plan_id is null or superseded_by_plan_id <> id)
);

-- One active plan per student. Partial unique index rather than a constraint so
-- cancelled and superseded history can pile up freely.
create unique index if not exists student_repayment_plans_one_active_per_student
  on public.student_repayment_plans (student_id)
  where lifecycle = 'active';

create index if not exists idx_student_repayment_plans_student
  on public.student_repayment_plans (student_id);

create unique index if not exists student_repayment_plans_client_request_unique
  on public.student_repayment_plans (student_id, client_request_id)
  where client_request_id is not null;

create index if not exists idx_student_repayment_plans_session_lifecycle
  on public.student_repayment_plans (session_label, lifecycle);

create index if not exists idx_student_repayment_plans_supersedes
  on public.student_repayment_plans (supersedes_plan_id)
  where supersedes_plan_id is not null;

create index if not exists idx_student_repayment_plans_superseded_by
  on public.student_repayment_plans (superseded_by_plan_id)
  where superseded_by_plan_id is not null;


-- ---------------------------------------------------------------------------
-- Which installments the plan covers, and what they looked like when it was
-- agreed. The snapshot columns are how "Plan review needed" is detected: if
-- Fee Setup later moves a covered charge, current base_charge stops matching
-- snapshot_base_charge and every surface says so instead of silently repricing
-- the family's monthly commitment.
-- ---------------------------------------------------------------------------

create table if not exists public.student_repayment_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.student_repayment_plans (id) on delete cascade,
  student_id uuid not null,
  installment_id uuid not null,

  installment_no smallint,
  installment_label text,
  due_date date not null,
  is_carry_forward boolean not null default false,

  -- Base charge on the row at activation (late fee excluded).
  snapshot_base_charge integer not null check (snapshot_base_charge >= 0),
  -- What was still owed on it at activation. Sums to the plan opening balance.
  included_base_balance integer not null check (included_base_balance >= 0),
  -- Late fee live on the row at activation, now permanently forgiven.
  waived_late_fee integer not null default 0 check (waived_late_fee >= 0),

  created_at timestamp with time zone not null default now(),

  constraint student_repayment_plan_items_installment_fk
    foreign key (installment_id, student_id)
    references public.installments (id, student_id) on delete cascade,

  constraint student_repayment_plan_items_unique unique (plan_id, installment_id)
);

create index if not exists idx_student_repayment_plan_items_installment
  on public.student_repayment_plan_items (installment_id);

create index if not exists idx_student_repayment_plan_items_student
  on public.student_repayment_plan_items (student_id);


-- ---------------------------------------------------------------------------
-- The monthly calendar. Generated once at activation and never edited.
-- ---------------------------------------------------------------------------

create table if not exists public.student_repayment_schedule (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.student_repayment_plans (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  sequence_no smallint not null check (sequence_no > 0),
  due_date date not null,
  amount integer not null check (amount > 0),
  created_at timestamp with time zone not null default now(),

  constraint student_repayment_schedule_unique unique (plan_id, sequence_no)
);

create index if not exists idx_student_repayment_schedule_plan_due
  on public.student_repayment_schedule (plan_id, due_date);

create index if not exists idx_student_repayment_schedule_student
  on public.student_repayment_schedule (student_id);


-- ---------------------------------------------------------------------------
-- What each receipt actually did to the plan. One row per (plan, receipt), so
-- a family can be shown the exact contribution of a receipt they are holding.
-- Written inside post_student_payment_with_adjustments, in the same transaction
-- as the receipt itself.
-- ---------------------------------------------------------------------------

create table if not exists public.student_repayment_receipt_links (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.student_repayment_plans (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  receipt_id uuid not null references public.receipts (id) on delete cascade,

  -- Split of the receipt: what cleared plan debt vs what spilled into dues the
  -- plan does not cover. contribution + spillover <= receipt total.
  contribution_amount integer not null check (contribution_amount >= 0),
  spillover_amount integer not null default 0 check (spillover_amount >= 0),

  plan_balance_before integer not null check (plan_balance_before >= 0),
  plan_balance_after integer not null check (plan_balance_after >= 0),

  created_at timestamp with time zone not null default now(),

  constraint student_repayment_receipt_links_unique unique (plan_id, receipt_id),
  constraint student_repayment_receipt_links_balance_moves
    check (plan_balance_after = plan_balance_before - contribution_amount)
);

create index if not exists idx_student_repayment_receipt_links_receipt
  on public.student_repayment_receipt_links (receipt_id);

create index if not exists idx_student_repayment_receipt_links_student
  on public.student_repayment_receipt_links (student_id);


-- ---------------------------------------------------------------------------
-- Immutability
--
-- The plan row itself may only move along its lifecycle. A guard trigger pins
-- every financial term, so no code path — RPC, psql, or a future migration
-- written in a hurry — can quietly reprice an agreement a parent already signed.
-- ---------------------------------------------------------------------------

create or replace function private.protect_repayment_plan_terms()
returns trigger
language plpgsql
set search_path to 'private', 'public', 'pg_temp'
as $function$
begin
  if new.student_id is distinct from old.student_id
     or new.session_label is distinct from old.session_label
     or new.scope is distinct from old.scope
     or new.opening_balance is distinct from old.opening_balance
     or new.monthly_amount is distinct from old.monthly_amount
     or new.first_due_date is distinct from old.first_due_date
     or new.term_months is distinct from old.term_months
     or new.final_installment_amount is distinct from old.final_installment_amount
     or new.reason is distinct from old.reason
     or new.activated_at is distinct from old.activated_at
     or new.supersedes_plan_id is distinct from old.supersedes_plan_id
  then
    raise exception 'Repayment plan terms are immutable. Reschedule the plan instead of editing it.';
  end if;

  if old.lifecycle <> 'active' and new.lifecycle is distinct from old.lifecycle then
    raise exception 'A % repayment plan cannot change lifecycle again.', old.lifecycle;
  end if;

  return new;
end;
$function$;

create or replace function private.prevent_repayment_row_update()
returns trigger
language plpgsql
set search_path to 'private', 'public', 'pg_temp'
as $function$
begin
  raise exception '% rows are written once and cannot be updated.', tg_table_name;
end;
$function$;

drop trigger if exists protect_terms_on_student_repayment_plans on public.student_repayment_plans;
create trigger protect_terms_on_student_repayment_plans
  before update on public.student_repayment_plans
  for each row execute function private.protect_repayment_plan_terms();

drop trigger if exists set_actor_columns_on_student_repayment_plans on public.student_repayment_plans;
create trigger set_actor_columns_on_student_repayment_plans
  before insert or update on public.student_repayment_plans
  for each row execute function private.set_actor_columns();

drop trigger if exists set_updated_at_on_student_repayment_plans on public.student_repayment_plans;
create trigger set_updated_at_on_student_repayment_plans
  before update on public.student_repayment_plans
  for each row execute function private.set_updated_at();

drop trigger if exists audit_student_repayment_plans on public.student_repayment_plans;
create trigger audit_student_repayment_plans
  after insert or delete or update on public.student_repayment_plans
  for each row execute function private.capture_audit_event();

-- Items / schedule / receipt links: UPDATE is refused outright. DELETE is left
-- to the FK cascades so deleting a student still works, exactly as it does for
-- their installments today.
drop trigger if exists student_repayment_plan_items_write_once on public.student_repayment_plan_items;
create trigger student_repayment_plan_items_write_once
  before update on public.student_repayment_plan_items
  for each row execute function private.prevent_repayment_row_update();

drop trigger if exists student_repayment_schedule_write_once on public.student_repayment_schedule;
create trigger student_repayment_schedule_write_once
  before update on public.student_repayment_schedule
  for each row execute function private.prevent_repayment_row_update();

drop trigger if exists student_repayment_receipt_links_write_once on public.student_repayment_receipt_links;
create trigger student_repayment_receipt_links_write_once
  before update on public.student_repayment_receipt_links
  for each row execute function private.prevent_repayment_row_update();

drop trigger if exists audit_student_repayment_plan_items on public.student_repayment_plan_items;
create trigger audit_student_repayment_plan_items
  after insert or delete on public.student_repayment_plan_items
  for each row execute function private.capture_audit_event();

drop trigger if exists audit_student_repayment_receipt_links on public.student_repayment_receipt_links;
create trigger audit_student_repayment_receipt_links
  after insert or delete on public.student_repayment_receipt_links
  for each row execute function private.capture_audit_event();


-- ---------------------------------------------------------------------------
-- RLS
--
-- Reads follow fee visibility. Writes need `fees:repayment_plan`, which
-- public.has_permission grants to admin only — every other role falls through
-- to its explicit array, and the string is in none of them.
-- ---------------------------------------------------------------------------

alter table public.student_repayment_plans enable row level security;
alter table public.student_repayment_plan_items enable row level security;
alter table public.student_repayment_schedule enable row level security;
alter table public.student_repayment_receipt_links enable row level security;

drop policy if exists "staff can read repayment plans" on public.student_repayment_plans;
create policy "staff can read repayment plans" on public.student_repayment_plans
  as permissive for select to authenticated
  using ((select public.has_any_permission(array['fees:view', 'payments:view', 'defaulters:view', 'dashboard:view'])));

drop policy if exists "admin can create repayment plans" on public.student_repayment_plans;
create policy "admin can create repayment plans" on public.student_repayment_plans
  as permissive for insert to authenticated
  with check ((select public.has_permission('fees:repayment_plan')));

drop policy if exists "admin can move repayment plan lifecycle" on public.student_repayment_plans;
create policy "admin can move repayment plan lifecycle" on public.student_repayment_plans
  as permissive for update to authenticated
  using ((select public.has_permission('fees:repayment_plan')))
  with check ((select public.has_permission('fees:repayment_plan')));

drop policy if exists "staff can read repayment plan items" on public.student_repayment_plan_items;
create policy "staff can read repayment plan items" on public.student_repayment_plan_items
  as permissive for select to authenticated
  using ((select public.has_any_permission(array['fees:view', 'payments:view', 'defaulters:view', 'dashboard:view'])));

drop policy if exists "admin can create repayment plan items" on public.student_repayment_plan_items;
create policy "admin can create repayment plan items" on public.student_repayment_plan_items
  as permissive for insert to authenticated
  with check ((select public.has_permission('fees:repayment_plan')));

drop policy if exists "staff can read repayment schedule" on public.student_repayment_schedule;
create policy "staff can read repayment schedule" on public.student_repayment_schedule
  as permissive for select to authenticated
  using ((select public.has_any_permission(array['fees:view', 'payments:view', 'defaulters:view', 'dashboard:view'])));

drop policy if exists "admin can create repayment schedule" on public.student_repayment_schedule;
create policy "admin can create repayment schedule" on public.student_repayment_schedule
  as permissive for insert to authenticated
  with check ((select public.has_permission('fees:repayment_plan')));

drop policy if exists "staff can read repayment receipt links" on public.student_repayment_receipt_links;
create policy "staff can read repayment receipt links" on public.student_repayment_receipt_links
  as permissive for select to authenticated
  using ((select public.has_any_permission(array['fees:view', 'payments:view', 'ledger:view', 'receipts:view', 'finance:view', 'dashboard:view'])));

-- Cashiers do not hold `fees:repayment_plan`, but posting a payment against a
-- plan has to record the link. The row is written by
-- post_student_payment_with_adjustments, which already gates on
-- `payments:write` — so that is the permission the policy asks for.
drop policy if exists "payment posting can link receipts to plans" on public.student_repayment_receipt_links;
create policy "payment posting can link receipts to plans" on public.student_repayment_receipt_links
  as permissive for insert to authenticated
  with check ((select public.has_permission('payments:write')));


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, references, trigger on table public.student_repayment_plans to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.student_repayment_plans to service_role;

grant select, insert, references, trigger on table public.student_repayment_plan_items to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.student_repayment_plan_items to service_role;

grant select, insert, references, trigger on table public.student_repayment_schedule to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.student_repayment_schedule to service_role;

grant select, insert, references, trigger on table public.student_repayment_receipt_links to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.student_repayment_receipt_links to service_role;


comment on table public.student_repayment_plans is
  'Monthly EMI agreement layered over existing dues. Interest-free, admin-only, never rewrites the ledger. Terms are immutable — reschedule writes a replacement plan.';
comment on table public.student_repayment_plan_items is
  'Exact installments an EMI plan covers, with base-charge and balance snapshots taken at activation. Drift from snapshot_base_charge raises "Plan review needed".';
comment on table public.student_repayment_schedule is
  'Generated monthly calendar for an EMI plan. Month-end dates are clamped (31 Jan + 1 month = 28/29 Feb).';
comment on table public.student_repayment_receipt_links is
  'Per-receipt contribution to an EMI plan with plan balance before/after. Written atomically with the receipt.';

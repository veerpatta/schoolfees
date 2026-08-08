-- Late-fee waivers become per-installment, permanent and auditable.
--
-- The bug this fixes, in the office's words: "waiving the late fee keeps coming
-- back if I waived it during a partial payment of an installment."
--
-- Why it came back. A waiver was a single rupee POOL on
-- student_fee_overrides.late_fee_waiver_amount -- one active row per student,
-- no installment reference, no academic session. Nothing recorded WHICH
-- installment the cashier forgave. Both engines re-allocated the pool from
-- scratch on every single read:
--
--     least(raw_late_fee,
--           pool - sum(raw_late_fee) over (partition by student
--                                          order by installment_no
--                                          rows between unbounded preceding
--                                                   and 1 preceding))
--
-- i.e. the pool was consumed greedily by the LOWEST-numbered installment that
-- happened to carry a fee at that moment. Post a partial payment and the set of
-- installments carrying a fee changes, so the pool slides onto a different
-- installment -- and the one the cashier actually waived is charged again.
-- Waive it a second time and the pool grows, which is why the amount crept up.
--
-- This table replaces the pool with one row per (student, installment) waiver:
-- targeted, permanent, attributable, and reversible only by an explicit void.
--
-- This migration is deliberately INERT -- nothing reads the table yet, so no
-- balance moves. The engines are switched over to it in the next migration,
-- which also backfills the existing pools.

create table public.student_late_fee_waivers (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students(id) on delete cascade,
  installment_id    uuid not null,
  session_label     text not null,
  amount            integer not null check (amount > 0),
  reason            text not null check (length(btrim(reason)) >= 4),
  source            text not null default 'manual'
                    check (source in ('manual', 'payment_desk', 'migration', 'grandfather')),
  client_request_id uuid,
  waived_by         uuid references auth.users(id) on delete set null,
  waived_by_label   text,
  waived_at         timestamptz not null default now(),
  voided_at         timestamptz,
  voided_by         uuid references auth.users(id) on delete set null,
  void_reason       text,
  created_at        timestamptz not null default now(),

  -- Rides installments_id_student_unique. Without the student_id in the FK a
  -- waiver could be pointed at another student's installment.
  constraint student_late_fee_waivers_installment_fk
    foreign key (installment_id, student_id)
    references public.installments (id, student_id) on delete cascade,

  -- A void is all-or-nothing and must carry a reason.
  constraint student_late_fee_waivers_void_complete check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and length(btrim(coalesce(void_reason, ''))) >= 4)
  )
);

comment on table public.student_late_fee_waivers is
  'One row per late-fee waiver, targeted at a specific installment. Replaces the student-level rupee pool on student_fee_overrides.late_fee_waiver_amount, which slid between installments whenever a payment changed which installment carried a fee. Append-only in spirit: a waiver is VOIDED (voided_at/voided_by/void_reason), never deleted -- there is deliberately no delete policy.';

comment on column public.student_late_fee_waivers.session_label is
  'Derived in the RPC from installments -> classes, never taken from the caller. The old pool had no session column at all, which is how a waiver could leak across academic years.';

comment on column public.student_late_fee_waivers.source is
  'manual = staff used the waive action; payment_desk = waived inline while posting; migration = carried over from the old student-level pool; grandfather = auto-issued when the late-fee rule was unified, so that no family''s late fee rose as a result of the rule change.';

-- Real idempotency. waive_late_fee accepted p_client_request_id and threw it
-- away, so a double-submit waived twice. One logical request may legitimately
-- span several installments, so the key includes installment_id.
create unique index student_late_fee_waivers_request_idx
  on public.student_late_fee_waivers (student_id, client_request_id, installment_id)
  where client_request_id is not null;

create index student_late_fee_waivers_installment_idx
  on public.student_late_fee_waivers (installment_id)
  where voided_at is null;

create index student_late_fee_waivers_student_session_idx
  on public.student_late_fee_waivers (student_id, session_label);

create index student_late_fee_waivers_waived_by_idx
  on public.student_late_fee_waivers (waived_by);

alter table public.student_late_fee_waivers enable row level security;

-- waive_late_fee is SECURITY INVOKER, so these policies are the real
-- enforcement, not merely defence in depth.
create policy "staff can read late fee waivers"
  on public.student_late_fee_waivers
  for select to authenticated
  using ((select public.has_any_permission(array['fees:view', 'payments:view'])));

create policy "staff can grant late fee waivers"
  on public.student_late_fee_waivers
  for insert to authenticated
  with check ((select public.has_permission('payments:waive_late_fee')));

-- Voiding a waiver RAISES what a family owes, so it is gated harder than
-- granting one: payments:adjust rather than payments:waive_late_fee.
create policy "staff can void late fee waivers"
  on public.student_late_fee_waivers
  for update to authenticated
  using ((select public.has_permission('payments:adjust')))
  with check ((select public.has_permission('payments:adjust')));

-- No delete policy, on purpose.

revoke all on table public.student_late_fee_waivers from public, anon;
grant select, insert, update on table public.student_late_fee_waivers to authenticated;
grant all on table public.student_late_fee_waivers to service_role;

-- The engines join this, not the base table: it collapses multiple waivers on
-- one installment (e.g. a migration row plus a grandfather row) into the single
-- number the late-fee arithmetic needs, and hides voided rows.
create view public.v_effective_late_fee_waivers
with (security_invoker = true) as
select
  installment_id,
  student_id,
  sum(amount)::integer as waiver_amount
from public.student_late_fee_waivers
where voided_at is null
group by installment_id, student_id;

comment on view public.v_effective_late_fee_waivers is
  'Non-voided waiver total per installment. The single thing the late-fee engines join.';

grant select on public.v_effective_late_fee_waivers to authenticated;
grant select on public.v_effective_late_fee_waivers to service_role;

-- Granting or voiding a waiver changes money on screen, so it must enqueue a
-- refresh exactly like a payment does.
drop trigger if exists refresh_financials_on_late_fee_waiver
  on public.student_late_fee_waivers;
create trigger refresh_financials_on_late_fee_waiver
  after insert or update or delete or truncate on public.student_late_fee_waivers
  for each statement execute function public.trigger_refresh_financial_views();

notify pgrst, 'reload schema';

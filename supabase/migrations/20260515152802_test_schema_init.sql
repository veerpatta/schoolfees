create schema if not exists test;

grant usage on schema test to authenticated;

-- Read-through catalogue/reference views. Physical catalogue data stays in public;
-- these views keep APP_MODE=test clients on the test API schema without copying
-- shared fee policy, class, route, or discount reference data.
create or replace view test.academic_sessions
with (security_invoker = true)
as select * from public.academic_sessions;

create or replace view test.users
with (security_invoker = true)
as select * from public.users;

create or replace view test.app_settings
with (security_invoker = true)
as select * from public.app_settings;

create or replace view test.fee_policy_configs
with (security_invoker = true)
as select * from public.fee_policy_configs;

create or replace view test.classes
with (security_invoker = true)
as select * from public.classes;

create or replace view test.transport_routes
with (security_invoker = true)
as select * from public.transport_routes;

create or replace view test.fee_settings
with (security_invoker = true)
as select * from public.fee_settings;

create or replace view test.school_fee_defaults
with (security_invoker = true)
as select * from public.school_fee_defaults;

create or replace view test.conventional_discount_policies
with (security_invoker = true)
as select * from public.conventional_discount_policies;

create or replace view test.student_family_groups
with (security_invoker = true)
as select * from public.student_family_groups;

create or replace view test.student_family_members
with (security_invoker = true)
as select * from public.student_family_members;

grant select on
  test.academic_sessions,
  test.users,
  test.app_settings,
  test.fee_policy_configs,
  test.classes,
  test.transport_routes,
  test.fee_settings,
  test.school_fee_defaults,
  test.conventional_discount_policies,
  test.student_family_groups,
  test.student_family_members
to authenticated;

create or replace function private.enforce_max_active_conventional_discounts_in_schema()
returns trigger
language plpgsql
as $$
declare
  active_count integer;
begin
  if new.is_active then
    execute format(
      'select count(*)::integer
       from %I.student_conventional_discount_assignments as assignment
       where assignment.student_id = $1
         and assignment.academic_session_label = $2
         and assignment.is_active = true
         and assignment.id <> coalesce($3, ''00000000-0000-0000-0000-000000000000''::uuid)',
      tg_table_schema
    )
    into active_count
    using new.student_id, new.academic_session_label, new.id;

    if active_count >= 2 then
      raise exception 'A student can have maximum 2 active conventional discounts for one academic year.';
    end if;
  end if;

  return new;
end;
$$;

create table if not exists test.students (like public.students including all);
create table if not exists test.student_fee_overrides (like public.student_fee_overrides including all);
create table if not exists test.installments (like public.installments including all);
create table if not exists test.receipts (like public.receipts including all);
create table if not exists test.payments (like public.payments including all);
create table if not exists test.payment_adjustments (like public.payment_adjustments including all);
create table if not exists test.refund_requests (like public.refund_requests including all);
create table if not exists test.student_conventional_discount_assignments (
  like public.student_conventional_discount_assignments including all
);
create table if not exists test.import_batches (like public.import_batches including all);
create table if not exists test.import_rows (like public.import_rows including all);

alter table test.students
  add constraint students_class_id_fkey foreign key (class_id) references public.classes(id) on delete restrict,
  add constraint students_transport_route_id_fkey foreign key (transport_route_id) references public.transport_routes(id) on delete set null,
  add constraint students_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null,
  add constraint students_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null;

alter table test.student_fee_overrides
  add constraint student_fee_overrides_student_id_fkey foreign key (student_id) references test.students(id) on delete cascade,
  add constraint student_fee_overrides_fee_setting_id_fkey foreign key (fee_setting_id) references public.fee_settings(id) on delete restrict,
  add constraint student_fee_overrides_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null,
  add constraint student_fee_overrides_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null;

alter table test.installments
  add constraint installments_student_id_fkey foreign key (student_id) references test.students(id) on delete cascade,
  add constraint installments_class_id_fkey foreign key (class_id) references public.classes(id) on delete restrict,
  add constraint installments_fee_setting_id_fkey foreign key (fee_setting_id) references public.fee_settings(id) on delete restrict,
  add constraint installments_student_fee_override_id_fkey foreign key (student_fee_override_id) references test.student_fee_overrides(id) on delete set null,
  add constraint installments_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null,
  add constraint installments_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null;

alter table test.receipts
  add constraint receipts_student_id_fkey foreign key (student_id) references test.students(id) on delete restrict,
  add constraint receipts_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;

alter table test.payments
  add constraint payments_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null,
  add constraint payments_receipt_fk foreign key (receipt_id, student_id) references test.receipts(id, student_id) on delete restrict,
  add constraint payments_installment_fk foreign key (installment_id, student_id) references test.installments(id, student_id) on delete restrict;

alter table test.payment_adjustments
  add constraint payment_adjustments_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null,
  add constraint payment_adjustments_payment_fk foreign key (payment_id, student_id, installment_id) references test.payments(id, student_id, installment_id) on delete restrict;

alter table test.refund_requests
  add constraint refund_requests_receipt_id_fkey foreign key (receipt_id) references test.receipts(id) on delete restrict,
  add constraint refund_requests_student_id_fkey foreign key (student_id) references test.students(id) on delete restrict,
  add constraint refund_requests_approved_by_fkey foreign key (approved_by) references auth.users(id) on delete set null,
  add constraint refund_requests_processed_by_fkey foreign key (processed_by) references auth.users(id) on delete set null,
  add constraint refund_requests_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null,
  add constraint refund_requests_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null;

alter table test.student_conventional_discount_assignments
  add constraint student_conventional_discount_assignments_student_id_fkey foreign key (student_id) references test.students(id) on delete cascade,
  add constraint student_conventional_discount_assignments_policy_id_fkey foreign key (policy_id) references public.conventional_discount_policies(id) on delete restrict,
  add constraint student_conventional_discount_assignments_applied_by_fkey foreign key (applied_by) references auth.users(id) on delete set null,
  add constraint student_conventional_discount_assignments_family_group_id_fkey foreign key (family_group_id) references public.student_family_groups(id) on delete set null;

alter table test.import_batches
  add constraint import_batches_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null,
  add constraint import_batches_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null;

alter table test.import_rows
  add constraint import_rows_batch_id_fkey foreign key (batch_id) references test.import_batches(id) on delete cascade,
  add constraint import_rows_target_student_id_fkey foreign key (target_student_id) references test.students(id) on delete set null,
  add constraint import_rows_duplicate_student_id_fkey foreign key (duplicate_student_id) references test.students(id) on delete set null,
  add constraint import_rows_imported_student_id_fkey foreign key (imported_student_id) references test.students(id) on delete set null,
  add constraint import_rows_imported_override_id_fkey foreign key (imported_override_id) references test.student_fee_overrides(id) on delete set null,
  add constraint import_rows_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null,
  add constraint import_rows_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null;

alter table test.students enable row level security;
alter table test.student_fee_overrides enable row level security;
alter table test.installments enable row level security;
alter table test.receipts enable row level security;
alter table test.payments enable row level security;
alter table test.payment_adjustments enable row level security;
alter table test.refund_requests enable row level security;
alter table test.student_conventional_discount_assignments enable row level security;
alter table test.import_batches enable row level security;
alter table test.import_rows enable row level security;

create policy "authenticated can read students"
on test.students for select
to authenticated
using (public.has_any_permission(array['students:view', 'payments:view', 'ledger:view', 'receipts:view', 'defaulters:view', 'dashboard:view', 'finance:view']));

create policy "authenticated can insert students"
on test.students for insert
to authenticated
with check (public.has_permission('students:write'));

create policy "authenticated can update students"
on test.students for update
to authenticated
using (public.has_permission('students:write'))
with check (public.has_permission('students:write'));

create policy "authenticated can read student fee overrides"
on test.student_fee_overrides for select
to authenticated
using (public.has_permission('fees:view'));

create policy "authenticated can insert student fee overrides"
on test.student_fee_overrides for insert
to authenticated
with check (public.has_permission('fees:write'));

create policy "authenticated can update student fee overrides"
on test.student_fee_overrides for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

create policy "authenticated can read installments"
on test.installments for select
to authenticated
using (public.has_any_permission(array['fees:view', 'payments:view', 'ledger:view', 'defaulters:view', 'finance:view']));

create policy "authenticated can insert installments"
on test.installments for insert
to authenticated
with check (public.has_permission('fees:write'));

create policy "authenticated can update installments"
on test.installments for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

create policy "authenticated can read receipts"
on test.receipts for select
to authenticated
using (public.has_any_permission(array['payments:view', 'ledger:view', 'receipts:view', 'dashboard:view', 'finance:view']));

create policy "authenticated can insert receipts"
on test.receipts for insert
to authenticated
with check (public.has_permission('payments:write'));

create policy "authenticated can read payments"
on test.payments for select
to authenticated
using (public.has_any_permission(array['payments:view', 'ledger:view', 'receipts:view', 'dashboard:view', 'finance:view']));

create policy "authenticated can insert payments"
on test.payments for insert
to authenticated
with check (public.has_permission('payments:write'));

create policy "authenticated can read payment adjustments"
on test.payment_adjustments for select
to authenticated
using (public.has_any_permission(array['ledger:view', 'defaulters:view', 'dashboard:view', 'finance:view']));

create policy "authenticated can insert payment adjustments"
on test.payment_adjustments for insert
to authenticated
with check (public.has_permission('payments:adjust'));

create policy "authenticated can read refund requests"
on test.refund_requests for select
to authenticated
using (public.has_permission('finance:view'));

create policy "authenticated can insert refund requests"
on test.refund_requests for insert
to authenticated
with check (public.has_permission('finance:write'));

create policy "authenticated can update refund requests"
on test.refund_requests for update
to authenticated
using (public.has_any_permission(array['finance:write', 'finance:approve']))
with check (public.has_any_permission(array['finance:write', 'finance:approve']));

create policy "authenticated can read student conventional discounts"
on test.student_conventional_discount_assignments for select
to authenticated
using (public.has_any_permission(array['students:view', 'fees:view', 'payments:view', 'reports:view', 'defaulters:view']));

create policy "authenticated can write student conventional discounts"
on test.student_conventional_discount_assignments for all
to authenticated
using (public.has_permission('students:write'))
with check (public.has_permission('students:write'));

create policy "staff can read import batches"
on test.import_batches for select
to authenticated
using (public.has_permission('imports:view') or public.has_permission('students:write'));

create policy "staff can insert import batches"
on test.import_batches for insert
to authenticated
with check (public.has_permission('students:write'));

create policy "staff can update import batches"
on test.import_batches for update
to authenticated
using (public.has_permission('students:write'))
with check (public.has_permission('students:write'));

create policy "staff can read import rows"
on test.import_rows for select
to authenticated
using (public.has_permission('imports:view') or public.has_permission('students:write'));

create policy "staff can insert import rows"
on test.import_rows for insert
to authenticated
with check (public.has_permission('students:write'));

create policy "staff can update import rows"
on test.import_rows for update
to authenticated
using (public.has_permission('students:write'))
with check (public.has_permission('students:write'));

drop trigger if exists set_updated_at_on_students on test.students;
create trigger set_updated_at_on_students
before update on test.students
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_students on test.students;
create trigger set_actor_columns_on_students
before insert or update on test.students
for each row execute function private.set_actor_columns();

drop trigger if exists set_updated_at_on_student_fee_overrides on test.student_fee_overrides;
create trigger set_updated_at_on_student_fee_overrides
before update on test.student_fee_overrides
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_student_fee_overrides on test.student_fee_overrides;
create trigger set_actor_columns_on_student_fee_overrides
before insert or update on test.student_fee_overrides
for each row execute function private.set_actor_columns();

drop trigger if exists set_updated_at_on_installments on test.installments;
create trigger set_updated_at_on_installments
before update on test.installments
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_installments on test.installments;
create trigger set_actor_columns_on_installments
before insert or update on test.installments
for each row execute function private.set_actor_columns();

drop trigger if exists set_created_by_on_receipts on test.receipts;
create trigger set_created_by_on_receipts
before insert on test.receipts
for each row execute function private.set_created_by_column();

drop trigger if exists set_created_by_on_payments on test.payments;
create trigger set_created_by_on_payments
before insert on test.payments
for each row execute function private.set_created_by_column();

drop trigger if exists set_created_by_on_payment_adjustments on test.payment_adjustments;
create trigger set_created_by_on_payment_adjustments
before insert on test.payment_adjustments
for each row execute function private.set_created_by_column();

drop trigger if exists set_updated_at_on_refund_requests on test.refund_requests;
create trigger set_updated_at_on_refund_requests
before update on test.refund_requests
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_refund_requests on test.refund_requests;
create trigger set_actor_columns_on_refund_requests
before insert or update on test.refund_requests
for each row execute function private.set_actor_columns();

drop trigger if exists set_updated_at_on_import_batches on test.import_batches;
create trigger set_updated_at_on_import_batches
before update on test.import_batches
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_import_batches on test.import_batches;
create trigger set_actor_columns_on_import_batches
before insert or update on test.import_batches
for each row execute function private.set_actor_columns();

drop trigger if exists set_updated_at_on_import_rows on test.import_rows;
create trigger set_updated_at_on_import_rows
before update on test.import_rows
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_import_rows on test.import_rows;
create trigger set_actor_columns_on_import_rows
before insert or update on test.import_rows
for each row execute function private.set_actor_columns();

drop trigger if exists set_updated_at_on_student_conventional_discount_assignments on test.student_conventional_discount_assignments;
create trigger set_updated_at_on_student_conventional_discount_assignments
before update on test.student_conventional_discount_assignments
for each row execute function private.set_updated_at();

drop trigger if exists receipts_are_append_only on test.receipts;
create trigger receipts_are_append_only
before update or delete on test.receipts
for each row execute function private.prevent_append_only_mutation();

drop trigger if exists payments_are_append_only on test.payments;
create trigger payments_are_append_only
before update or delete on test.payments
for each row execute function private.prevent_append_only_mutation();

drop trigger if exists payment_adjustments_are_append_only on test.payment_adjustments;
create trigger payment_adjustments_are_append_only
before update or delete on test.payment_adjustments
for each row execute function private.prevent_append_only_mutation();

drop trigger if exists enforce_max_active_conventional_discounts on test.student_conventional_discount_assignments;
create trigger enforce_max_active_conventional_discounts
before insert or update on test.student_conventional_discount_assignments
for each row execute function private.enforce_max_active_conventional_discounts_in_schema();

drop trigger if exists audit_students on test.students;
create trigger audit_students
after insert or update or delete on test.students
for each row execute function private.capture_audit_event();

drop trigger if exists audit_student_fee_overrides on test.student_fee_overrides;
create trigger audit_student_fee_overrides
after insert or update or delete on test.student_fee_overrides
for each row execute function private.capture_audit_event();

drop trigger if exists audit_installments on test.installments;
create trigger audit_installments
after insert or update or delete on test.installments
for each row execute function private.capture_audit_event();

drop trigger if exists audit_receipts on test.receipts;
create trigger audit_receipts
after insert or update or delete on test.receipts
for each row execute function private.capture_audit_event();

drop trigger if exists audit_payments on test.payments;
create trigger audit_payments
after insert or update or delete on test.payments
for each row execute function private.capture_audit_event();

drop trigger if exists audit_payment_adjustments on test.payment_adjustments;
create trigger audit_payment_adjustments
after insert or update or delete on test.payment_adjustments
for each row execute function private.capture_audit_event();

drop trigger if exists audit_refund_requests on test.refund_requests;
create trigger audit_refund_requests
after insert or update or delete on test.refund_requests
for each row execute function private.capture_audit_event();

drop trigger if exists audit_import_batches on test.import_batches;
create trigger audit_import_batches
after insert or update or delete on test.import_batches
for each row execute function private.capture_audit_event();

drop trigger if exists audit_import_rows on test.import_rows;
create trigger audit_import_rows
after insert or update or delete on test.import_rows
for each row execute function private.capture_audit_event();

drop trigger if exists audit_student_conventional_discount_assignments on test.student_conventional_discount_assignments;
create trigger audit_student_conventional_discount_assignments
after insert or update or delete on test.student_conventional_discount_assignments
for each row execute function private.capture_audit_event();

grant select, insert, update on
  test.students,
  test.student_fee_overrides,
  test.installments,
  test.refund_requests,
  test.student_conventional_discount_assignments,
  test.import_batches,
  test.import_rows
to authenticated;

grant select, insert on
  test.receipts,
  test.payments,
  test.payment_adjustments
to authenticated;

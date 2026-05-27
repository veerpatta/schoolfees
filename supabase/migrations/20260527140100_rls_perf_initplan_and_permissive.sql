-- RLS performance pass — addresses the warnings from
-- supabase.get_advisors('performance'):
--   • auth_rls_initplan: 8 policies that call auth.role()/auth.uid()/auth.jwt()
--     directly in their predicate, so Postgres re-evaluates per row instead
--     of once per query plan. Wrapping the call in `(select …)` lifts it to
--     an InitPlan that runs once.
--   • multiple_permissive_policies: 6 tables where a "FOR ALL" write policy
--     and a "FOR SELECT" read policy both apply to SELECT, forcing the
--     planner to OR them on every row. We replace each "FOR ALL" with
--     explicit INSERT/UPDATE/DELETE policies so only one permissive policy
--     applies per (table, role, action) pair.
--
-- Tables touched (no schema/data changes — policies only):
--   defaulter_contacts, whatsapp_templates, user_activity_events,
--   conventional_discount_policies, student_family_groups,
--   student_family_members, student_conventional_discount_assignments,
--   app_settings.

-- ---------------------------------------------------------------------------
-- 1. auth_rls_initplan fixes for the three audit/log tables
-- ---------------------------------------------------------------------------

drop policy if exists "user_activity_events: staff read" on public.user_activity_events;
create policy "user_activity_events: staff read"
  on public.user_activity_events for select
  using ((select auth.role()) = 'authenticated');

drop policy if exists "user_activity_events: staff insert" on public.user_activity_events;
create policy "user_activity_events: staff insert"
  on public.user_activity_events for insert
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "whatsapp_templates: staff read" on public.whatsapp_templates;
create policy "whatsapp_templates: staff read"
  on public.whatsapp_templates for select
  using ((select auth.role()) = 'authenticated');

drop policy if exists "whatsapp_templates: admin write insert" on public.whatsapp_templates;
create policy "whatsapp_templates: admin write insert"
  on public.whatsapp_templates for insert
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "whatsapp_templates: admin write update" on public.whatsapp_templates;
create policy "whatsapp_templates: admin write update"
  on public.whatsapp_templates for update
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists "whatsapp_templates: admin write delete" on public.whatsapp_templates;
create policy "whatsapp_templates: admin write delete"
  on public.whatsapp_templates for delete
  using ((select auth.role()) = 'authenticated');

drop policy if exists "defaulter_contacts: staff read" on public.defaulter_contacts;
create policy "defaulter_contacts: staff read"
  on public.defaulter_contacts for select
  using ((select auth.role()) = 'authenticated');

drop policy if exists "defaulter_contacts: staff insert" on public.defaulter_contacts;
create policy "defaulter_contacts: staff insert"
  on public.defaulter_contacts for insert
  with check ((select auth.role()) = 'authenticated');

-- ---------------------------------------------------------------------------
-- 2. Eliminate multiple_permissive_policies — replace FOR ALL write policies
--    with explicit INSERT/UPDATE/DELETE policies so SELECT only matches a
--    single read policy. Same effective permissions; smaller plan-time cost.
-- ---------------------------------------------------------------------------

drop policy if exists "authenticated can write conventional discount policies" on public.conventional_discount_policies;
create policy "authenticated can insert conventional discount policies"
  on public.conventional_discount_policies for insert
  to authenticated
  with check (public.has_permission('fees:write'));
create policy "authenticated can update conventional discount policies"
  on public.conventional_discount_policies for update
  to authenticated
  using (public.has_permission('fees:write'))
  with check (public.has_permission('fees:write'));
create policy "authenticated can delete conventional discount policies"
  on public.conventional_discount_policies for delete
  to authenticated
  using (public.has_permission('fees:write'));

drop policy if exists "authenticated can write student family groups" on public.student_family_groups;
create policy "authenticated can insert student family groups"
  on public.student_family_groups for insert
  to authenticated
  with check (public.has_permission('students:write'));
create policy "authenticated can update student family groups"
  on public.student_family_groups for update
  to authenticated
  using (public.has_permission('students:write'))
  with check (public.has_permission('students:write'));
create policy "authenticated can delete student family groups"
  on public.student_family_groups for delete
  to authenticated
  using (public.has_permission('students:write'));

drop policy if exists "authenticated can write student family members" on public.student_family_members;
create policy "authenticated can insert student family members"
  on public.student_family_members for insert
  to authenticated
  with check (public.has_permission('students:write'));
create policy "authenticated can update student family members"
  on public.student_family_members for update
  to authenticated
  using (public.has_permission('students:write'))
  with check (public.has_permission('students:write'));
create policy "authenticated can delete student family members"
  on public.student_family_members for delete
  to authenticated
  using (public.has_permission('students:write'));

drop policy if exists "authenticated can write student conventional discounts" on public.student_conventional_discount_assignments;
create policy "authenticated can insert student conventional discounts"
  on public.student_conventional_discount_assignments for insert
  to authenticated
  with check (public.has_permission('students:write'));
create policy "authenticated can update student conventional discounts"
  on public.student_conventional_discount_assignments for update
  to authenticated
  using (public.has_permission('students:write'))
  with check (public.has_permission('students:write'));
create policy "authenticated can delete student conventional discounts"
  on public.student_conventional_discount_assignments for delete
  to authenticated
  using (public.has_permission('students:write'));

-- app_settings: confirmed live policy shape via pg_policy:
--   • "authenticated can read app_settings"  FOR SELECT  using (true)
--   • "settings:write can update app_settings"  FOR ALL  has_permission('settings:write')
-- Both apply to SELECT — the FOR ALL one is the one to split.

drop policy if exists "settings:write can update app_settings" on public.app_settings;
create policy "settings:write can insert app_settings"
  on public.app_settings for insert
  to authenticated
  with check (public.has_permission('settings:write'));
create policy "settings:write can update app_settings"
  on public.app_settings for update
  to authenticated
  using (public.has_permission('settings:write'))
  with check (public.has_permission('settings:write'));
create policy "settings:write can delete app_settings"
  on public.app_settings for delete
  to authenticated
  using (public.has_permission('settings:write'));

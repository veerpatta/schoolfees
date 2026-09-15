-- Who can see a feature, decided without a deploy.
--
-- School One extends the app the school runs its day on. The office cannot
-- afford for a half-finished screen to appear in front of them on a Tuesday,
-- and waiting until everything is done means shipping a year's work in one go
-- and finding out then whether any of it fits.
--
-- So production carries two admin logins and one table. `director@vpps.co.in`
-- runs the school and sees today's fee app exactly as it is. `raj@vpps.co.in`
-- is the canary and sees new work the day it merges. Each School One surface
-- checks a row here, and a flag moves in this order:
--
--   off for everyone  →  the canary's user id  →  the roles that need it
--                     →  enabled_for_all / director@
--
-- Flipping one is a UI action taken by a person, in seconds, reversible in
-- seconds — not a deploy. That is the point: the rollback for "this is not
-- ready" must not be a git revert while twenty families wait at the counter.
--
-- Flags are NOT secrets. Every signed-in staff member may read this table:
-- knowing that a feature exists is not the same as being able to use it, and
-- the surfaces themselves are guarded by permissions as they always were. Only
-- `settings:write` can change a row, and there is deliberately no DELETE
-- policy — a flag is retired by turning it off, so the history of what was
-- shown to whom survives.
--
-- Additive only. No fee table, RPC, trigger or policy is touched.

begin;

create table if not exists public.feature_flags (
  key text primary key,
  description text not null,
  enabled_for_all boolean not null default false,
  enabled_roles public.staff_role[] not null default '{}',
  enabled_user_ids uuid[] not null default '{}',
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

comment on table public.feature_flags is
  'The canary model. Each School One surface checks a key here before it renders. A flag moves off → one user id (raj@, the canary) → roles → everyone; director@vpps.co.in, who runs the school, is never on the list until the feature is done. Flags are not secrets: any signed-in staff member may read them, only settings:write may change them, and there is no DELETE policy because a flag is retired by turning it off.';

comment on column public.feature_flags.enabled_user_ids is
  'public.users.id values. This is the column the canary model runs on: one id here is the difference between a feature the canary can see with real data and a feature the office meets by accident.';

comment on column public.feature_flags.enabled_roles is
  'Any staff member holding one of these roles sees the feature. Applied after enabled_for_all and alongside enabled_user_ids — the three are OR-ed, never AND-ed.';

alter table public.feature_flags enable row level security;

drop policy if exists "authenticated can read feature flags" on public.feature_flags;
create policy "authenticated can read feature flags"
on public.feature_flags for select
to authenticated
using (true);

drop policy if exists "settings writers can add feature flags" on public.feature_flags;
create policy "settings writers can add feature flags"
on public.feature_flags for insert
to authenticated
with check (public.has_permission('settings:write'));

drop policy if exists "settings writers can change feature flags" on public.feature_flags;
create policy "settings writers can change feature flags"
on public.feature_flags for update
to authenticated
using (public.has_permission('settings:write'))
with check (public.has_permission('settings:write'));

-- No DELETE policy, deliberately. See the table comment.

revoke all on table public.feature_flags from public, anon;
grant select on table public.feature_flags to authenticated, service_role;
grant insert, update on table public.feature_flags to authenticated, service_role;

-- The first flag. Everything off: it is visible to nobody until a person turns
-- it on for themselves, which is exactly the check this model needs to pass
-- before anything real is gated on it.
insert into public.feature_flags (key, description)
values (
  'school_one_placeholder',
  'Proves the canary model end to end: shows a placeholder School One item in the workspace navigation. Enable for one user id only.'
)
on conflict (key) do nothing;

commit;

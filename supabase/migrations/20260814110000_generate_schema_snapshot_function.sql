-- Make `supabase/schema.sql` reproducible on a machine without Docker.
--
-- That file is a readable snapshot of what the migrations add up to. It went
-- stale because the only supported way to refresh it — `supabase db dump` —
-- shells out to pg_dump inside Docker, and the machine maintaining this repo
-- does not have Docker. Worse, the failure is destructive: `db dump -f <file>`
-- creates the target file BEFORE it discovers Docker is missing, so a failed
-- run truncates the snapshot to zero bytes. It has destroyed this file once
-- already.
--
-- So the snapshot is built by introspecting pg_catalog instead, which is how
-- the 2026-08-10 revision was made by hand. Doing it by hand is why it then
-- sat five migrations behind. This function is that same introspection, written
-- down once so `node scripts/generate-schema-snapshot.mjs` can repeat it.
--
-- It returns the whole file as a single text value, so the content travels
-- straight from Postgres to disk. The object definitions are the server's own
-- (`pg_get_viewdef`, `pg_get_functiondef`, `pg_get_constraintdef`,
-- `pg_get_indexdef`, `pg_get_triggerdef`), so they are exact rather than
-- reconstructed.
--
-- Read-only: it touches nothing but the catalog. Restricted to `service_role`
-- anyway — the full schema including every RLS policy is a map of the security
-- model, and there is no reason for a browser session to be able to ask for it.

begin;

create or replace function public.generate_schema_snapshot()
returns text
language plpgsql
stable
-- DEFINER, deliberately, and the narrowest version of it that works.
--
-- Two things a schema snapshot must contain live outside the caller's reach:
-- the pg_cron job list (the `cron` schema is not granted to service_role) and
-- the applied migration version (`supabase_migrations` likewise). Invoker
-- rights silently produced a snapshot missing the nightly jobs that charge late
-- fees and refresh the financial views — which is exactly the kind of omission
-- a snapshot exists to prevent.
--
-- What keeps it safe: no arguments, so there is no injection surface;
-- `search_path` pinned so nothing can be shadowed; execute revoked from
-- `public`, `anon` and `authenticated` and granted only to `service_role`; and
-- every JWT in a cron command redacted before it reaches the output. It reads
-- the catalog and returns text — it cannot write.
security definer
-- pg_catalog ONLY, without public. `pg_get_viewdef` omits the schema for
-- anything the current search_path already reaches, so including `public` here
-- produced view bodies referring to bare `students` and `installments`. In a
-- snapshot read outside any particular search_path that is ambiguous at best;
-- dropping `public` makes every reference schema-qualified.
set search_path to pg_catalog
as $function$
declare
  snapshot text := '';
  section text;
  schema_version text := 'unknown';
begin
  -- `supabase_migrations` is not granted to service_role, and the caller of
  -- this function is service_role. A stamped version is a nicety; failing the
  -- entire snapshot because we could not read one is not. Degrade instead.
  begin
    select max(version) into schema_version from supabase_migrations.schema_migrations;
  exception when others then
    schema_version := 'unknown';
  end;

  snapshot := snapshot || E'-- Shri Veer Patta Senior Secondary School — fee management schema\n';
  snapshot := snapshot || E'--\n';
  snapshot := snapshot || E'-- GENERATED ARTIFACT. Do not hand-edit, and do not treat it as the source of\n';
  snapshot := snapshot || E'-- truth — `supabase/migrations/` is. This is a readable snapshot of what those\n';
  snapshot := snapshot || E'-- migrations add up to, for reading and for grepping.\n';
  snapshot := snapshot || E'--\n';
  snapshot := snapshot || E'-- Regenerate with:  node scripts/generate-schema-snapshot.mjs\n';
  snapshot := snapshot || E'--\n';
  snapshot := snapshot || E'-- Built by introspecting pg_catalog, NOT by pg_dump: `supabase db dump` needs\n';
  snapshot := snapshot || E'-- Docker, and on a machine without it that command truncates its own target\n';
  snapshot := snapshot || E'-- file to zero bytes. Every object definition below is the server''s own text,\n';
  snapshot := snapshot || E'-- so it is exact. Objects are grouped by kind and views are emitted in\n';
  snapshot := snapshot || E'-- dependency order; this has NOT been verified to replay top-to-bottom into an\n';
  snapshot := snapshot || E'-- empty database, and `supabase db push` is the supported way to build one.\n';
  snapshot := snapshot || E'--\n';
  snapshot := snapshot || '-- Schema version: ' || coalesce(schema_version, 'unknown') || E'\n';
  snapshot := snapshot || '-- Objects: ' ||
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'private') and c.relkind in ('r', 'v', 'm')) ||
    E' tables/views, ' ||
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')) || E' functions\n';

  -- ── Extensions ───────────────────────────────────────────────────────────
  select coalesce(string_agg(
    format('create extension if not exists %I with schema %I;', e.extname, n.nspname),
    E'\n' order by e.extname), '')
  into section
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname <> 'plpgsql';

  snapshot := snapshot || E'\n\n-- ══ Extensions ══════════════════════════════════════════════════════════\n\n'
    || section;

  -- ── Schemas ──────────────────────────────────────────────────────────────
  select coalesce(string_agg(format('create schema if not exists %I;', nspname), E'\n' order by nspname), '')
  into section
  from pg_namespace
  where nspname in ('private');

  snapshot := snapshot || E'\n\n-- ══ Schemas ═════════════════════════════════════════════════════════════\n\n'
    || section;

  -- ── Enum types ───────────────────────────────────────────────────────────
  select coalesce(string_agg(definition, E'\n' order by definition), '')
  into section
  from (
    select format(
      'create type %I.%I as enum (%s);',
      n.nspname, t.typname,
      string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
    ) as definition
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname in ('public', 'private')
    group by n.nspname, t.typname
  ) enums;

  snapshot := snapshot || E'\n\n-- ══ Types ═══════════════════════════════════════════════════════════════\n\n'
    || section;

  -- ── Tables ───────────────────────────────────────────────────────────────
  -- Columns carry their generated expression where they have one: several
  -- money columns here are GENERATED ALWAYS AS ... STORED, and a snapshot that
  -- printed them as plain integers would misdescribe the ledger.
  snapshot := snapshot || E'\n\n-- ══ Tables ══════════════════════════════════════════════════════════════\n';

  for section in
    select format(
      E'\n-- %s.%s\ncreate table if not exists %I.%I (\n%s\n);',
      n.nspname, c.relname, n.nspname, c.relname,
      (
        select string_agg(
          '  ' || quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
          || case
               when a.attgenerated = 's'
                 then ' generated always as (' || pg_get_expr(ad.adbin, ad.adrelid) || ') stored'
               when ad.adbin is not null
                 then ' default ' || pg_get_expr(ad.adbin, ad.adrelid)
               else ''
             end
          || case when a.attnotnull then ' not null' else '' end,
          E',\n' order by a.attnum)
        from pg_attribute a
        left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      )
    )
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind = 'r'
    order by n.nspname, c.relname
  loop
    snapshot := snapshot || section || E'\n';
  end loop;

  -- ── Constraints ──────────────────────────────────────────────────────────
  -- Primary keys and uniques first, then checks, then foreign keys, so the
  -- referenced key always exists before the reference to it.
  select coalesce(string_agg(
    format('alter table %I.%I add constraint %I %s;', n.nspname, c.relname, con.conname,
           pg_get_constraintdef(con.oid)),
    E'\n' order by
      case con.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 else 3 end,
      n.nspname, c.relname, con.conname), '')
  into section
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind = 'r';

  snapshot := snapshot || E'\n\n-- ══ Constraints ═════════════════════════════════════════════════════════\n\n'
    || section;

  -- ── Indexes ──────────────────────────────────────────────────────────────
  -- Constraint-backing indexes are skipped: they were created above with their
  -- constraint, and emitting them again would fail on replay.
  -- `if not exists` is grafted on: pg_get_indexdef never emits it, and without
  -- it the snapshot cannot be replayed twice or applied over a partial schema.
  select coalesce(string_agg(
    regexp_replace(pg_get_indexdef(i.indexrelid), '^CREATE (UNIQUE )?INDEX ',
                   'create \1index if not exists ') || ';',
    E'\n' order by ic.relname), '')
  into section
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  join pg_class tc on tc.oid = i.indrelid
  join pg_namespace n on n.oid = tc.relnamespace
  where n.nspname in ('public', 'private')
    and not exists (select 1 from pg_constraint con where con.conindid = i.indexrelid);

  snapshot := snapshot || E'\n\n-- ══ Indexes ═════════════════════════════════════════════════════════════\n\n'
    || section;

  -- ── Functions ────────────────────────────────────────────────────────────
  -- Before the views, because a view may call one.
  select coalesce(string_agg(pg_get_functiondef(p.oid) || E';\n', E'\n' order by n.nspname, p.proname), '')
  into section
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f';

  snapshot := snapshot || E'\n\n-- ══ Functions ═══════════════════════════════════════════════════════════\n\n'
    || section;

  -- ── Views and materialized views, in dependency order ────────────────────
  -- A view built on another view has to come second. Depth is the longest
  -- chain of view-on-view dependencies, computed from pg_rewrite.
  snapshot := snapshot || E'\n\n-- ══ Views ═══════════════════════════════════════════════════════════════\n';

  for section in
    with recursive edges as (
      select distinct r.ev_class as view_oid, d.refobjid as depends_on
      from pg_rewrite r
      join pg_depend d on d.objid = r.oid and d.classid = 'pg_rewrite'::regclass
      join pg_class dc on dc.oid = d.refobjid and dc.relkind in ('v', 'm')
      where r.ev_class <> d.refobjid
    ),
    depth as (
      select c.oid, 0 as lvl
      from pg_class c
      where c.relkind in ('v', 'm')
        and not exists (select 1 from edges e where e.view_oid = c.oid)
      union all
      select e.view_oid, d.lvl + 1
      from edges e
      join depth d on d.oid = e.depends_on
      where d.lvl < 20
    ),
    ranked as (
      select oid, max(lvl) as lvl from depth group by oid
    )
    -- A plain view gets `or replace`; a MATERIALIZED view has no such form, so
    -- it gets `if not exists` instead. Without one of the two the snapshot
    -- cannot be replayed over an existing database at all.
    select format(
      E'\n-- %s.%s\ncreate %s %I.%I as\n%s',
      n.nspname, c.relname,
      case when c.relkind = 'm' then 'materialized view if not exists' else 'or replace view' end,
      n.nspname, c.relname,
      pg_get_viewdef(c.oid, true)
    )
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join ranked on ranked.oid = c.oid
    where n.nspname in ('public', 'private') and c.relkind in ('v', 'm')
    order by coalesce(ranked.lvl, 0), n.nspname, c.relname
  loop
    snapshot := snapshot || section || E'\n';
  end loop;

  -- ── Triggers ─────────────────────────────────────────────────────────────
  select coalesce(string_agg(pg_get_triggerdef(t.oid) || ';', E'\n' order by c.relname, t.tgname), '')
  into section
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and not t.tgisinternal;

  snapshot := snapshot || E'\n\n-- ══ Triggers ════════════════════════════════════════════════════════════\n\n'
    || section;

  -- ── Row level security ───────────────────────────────────────────────────
  select coalesce(string_agg(
    format('alter table %I.%I enable row level security;', n.nspname, c.relname),
    E'\n' order by n.nspname, c.relname), '')
  into section
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind = 'r' and c.relrowsecurity;

  snapshot := snapshot || E'\n\n-- ══ Row level security ══════════════════════════════════════════════════\n\n'
    || section;

  select coalesce(string_agg(definition, E'\n' order by definition), '')
  into section
  from (
    -- Dropped first: a policy has no `create or replace`, and 166 of them
    -- failing on the second replay would make the file useless.
    select format(
      E'drop policy if exists %I on %I.%I;\ncreate policy %I on %I.%I as %s for %s to %s%s%s;',
      p.policyname, p.schemaname, p.tablename,
      p.policyname, p.schemaname, p.tablename,
      p.permissive, p.cmd, array_to_string(p.roles, ', '),
      case when p.qual is null then '' else ' using (' || p.qual || ')' end,
      case when p.with_check is null then '' else ' with check (' || p.with_check || ')' end
    ) as definition
    from pg_policies p
    where p.schemaname in ('public', 'private')
  ) policies;

  snapshot := snapshot || E'\n\n' || section;

  -- ── Grants ───────────────────────────────────────────────────────────────
  -- The Supabase roles only. Ownership grants are noise in a readable snapshot.
  --
  -- Schema-level USAGE first: a table grant is inert without it, so a snapshot
  -- that listed only table grants would describe a database nobody can read.
  select coalesce(string_agg(definition, E'\n' order by definition), '')
  into section
  from (
    -- r.rolname, not a.grantee: aclexplode yields the role OID, and %I on an
    -- OID silently emits a quoted number ("16485") that grants nothing.
    select distinct format('grant usage on schema %I to %I;', n.nspname, r.rolname) as definition
    from pg_namespace n
    cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
    join pg_roles r on r.oid = a.grantee
    where n.nspname in ('public', 'private')
      and a.privilege_type = 'USAGE'
      and r.rolname in ('anon', 'authenticated', 'service_role')
  ) schema_grants;

  snapshot := snapshot || E'\n\n-- ══ Grants ══════════════════════════════════════════════════════════════\n\n'
    || section || E'\n\n';

  select coalesce(string_agg(definition, E'\n' order by definition), '')
  into section
  from (
    select distinct format(
      'grant %s on %I.%I to %I;',
      g.privilege_type, g.table_schema, g.table_name, g.grantee
    ) as definition
    from information_schema.role_table_grants g
    where g.table_schema in ('public', 'private')
      and g.grantee in ('anon', 'authenticated', 'service_role')
  ) table_grants;

  snapshot := snapshot || section || E'\n\n';

  -- EXECUTE grants decide who may call the RPCs the app is built on, so a
  -- snapshot without them describes a database the Payment Desk cannot use.
  select coalesce(string_agg(definition, E'\n' order by definition), '')
  into section
  from (
    -- oidvectortypes, not pg_get_function_identity_arguments: the latter
    -- includes parameter NAMES here, giving
    -- `...(p_student_id uuid, p_as_of_date date, ...)`. Valid GRANT syntax, but
    -- a signature that changes whenever somebody renames a parameter. Types
    -- alone are what identifies the function.
    select distinct format(
      'grant execute on function %I.%I(%s) to %I;',
      n.nspname, p.proname, pg_catalog.oidvectortypes(p.proargtypes), r.rolname
    ) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    join pg_roles r on r.oid = a.grantee
    where n.nspname in ('public', 'private')
      and a.privilege_type = 'EXECUTE'
      and r.rolname in ('anon', 'authenticated', 'service_role')
  ) function_grants;

  snapshot := snapshot || section || E'\n';

  -- ── Scheduled jobs ───────────────────────────────────────────────────────
  -- pg_cron lives outside the public/private schemas, so nothing above finds
  -- it — and what runs nightly against the ledger belongs in a schema snapshot.
  --
  -- Commands are emitted with any JWT redacted, unconditionally. This repo is
  -- PUBLIC, cron commands are free text, and one job here already carries a
  -- hardcoded key (the anon key, which is public by design — but the sibling
  -- job does the same thing properly through vault.decrypted_secrets). A
  -- generator that copies commands verbatim would publish a service-role key
  -- the day somebody pastes one in, and would do it silently.
  begin
    select coalesce(string_agg(
      format(E'-- %s — %s\nselect cron.schedule(%L, %L, %L);',
        j.jobname, case when j.active then 'active' else 'INACTIVE' end,
        j.jobname, j.schedule,
        regexp_replace(j.command, 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',
                       '<redacted-jwt>', 'g')),
      E'\n\n' order by j.jobname), '')
    into section
    from cron.job j;
  exception when others then
    section := '-- (cron.job is not readable by this role)';
  end;

  snapshot := snapshot || E'\n\n-- ══ Scheduled jobs (pg_cron) ════════════════════════════════════════════\n\n'
    || section || E'\n';

  return snapshot;
end;
$function$;

comment on function public.generate_schema_snapshot() is
  'Returns supabase/schema.sql as text, by introspecting pg_catalog. Regenerate the file with node scripts/generate-schema-snapshot.mjs. Read-only; service_role only.';

revoke all on function public.generate_schema_snapshot() from public, anon, authenticated;
grant execute on function public.generate_schema_snapshot() to service_role;

commit;

-- PostgREST only exposes the public/graphql_public schemas, so the temporary
-- vpps-import-applier Edge Function (2026-05-15 mass import) reached
-- private.vpps_apply_chunk through this public proxy. SECURITY DEFINER lets
-- the proxy hop the schema boundary; execute is restricted to service_role.
--
-- The proxy is dropped at the end of the import (see
-- 20260515110000_drop_public_wrapper_for_vpps_apply_chunk.sql) but the create
-- statement is kept in history so the migration sequence remains replayable.

create or replace function public.vpps_apply_chunk_proxy(p_kind text, p_rows jsonb)
returns jsonb
language sql
security definer
set search_path = public, private
as $$
  select private.vpps_apply_chunk(p_kind, p_rows);
$$;

revoke all on function public.vpps_apply_chunk_proxy(text, jsonb) from public, anon, authenticated;
grant execute on function public.vpps_apply_chunk_proxy(text, jsonb) to service_role;

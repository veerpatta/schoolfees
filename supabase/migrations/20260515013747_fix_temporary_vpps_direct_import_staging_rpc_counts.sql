create or replace function public.vpps_stage_direct_import_20260514(
  p_token text,
  p_kind text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  expected_token constant text := 'eecd87343b8f4f3fbd2fa3660b974c8f';
  v_import_name constant text := 'latest-excel-import-2026-05-14-201835-direct-2026-27-safe-matched';
  staged_count integer := 0;
begin
  if p_token is distinct from expected_token then
    raise exception 'Unauthorized direct import staging request.' using errcode = '28000';
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Rows payload must be a JSON array.';
  end if;

  if p_kind = 'students' then
    insert into private.vpps_direct_import_stage_students (import_name, source_key, payload)
    select v_import_name, row->>'sourceKey', row
    from jsonb_array_elements(p_rows) as row
    where row ? 'sourceKey'
    on conflict (import_name, source_key) do update
    set payload = excluded.payload;
  elsif p_kind = 'dues' then
    insert into private.vpps_direct_import_stage_dues (import_name, source_key, payload)
    select v_import_name, row->>'sourceKey', row
    from jsonb_array_elements(p_rows) as row
    where row ? 'sourceKey'
    on conflict (import_name, source_key) do update
    set payload = excluded.payload;
  elsif p_kind = 'skipped' then
    insert into private.vpps_direct_import_stage_skipped (import_name, source, source_row_number, status, payload)
    select v_import_name, row->>'source', (row->>'sourceRowNumber')::integer, row->>'status', row
    from jsonb_array_elements(p_rows) as row
    where row ? 'source' and row ? 'sourceRowNumber' and row ? 'status'
    on conflict (import_name, source, source_row_number, status) do update
    set payload = excluded.payload;
  else
    raise exception 'Unsupported staging kind: %', p_kind;
  end if;

  get diagnostics staged_count = row_count;

  return jsonb_build_object(
    'kind', p_kind,
    'staged_or_updated', staged_count,
    'students_total', (select count(*) from private.vpps_direct_import_stage_students s where s.import_name = v_import_name),
    'dues_total', (select count(*) from private.vpps_direct_import_stage_dues d where d.import_name = v_import_name),
    'skipped_total', (select count(*) from private.vpps_direct_import_stage_skipped k where k.import_name = v_import_name)
  );
end;
$$;

revoke all on function public.vpps_stage_direct_import_20260514(text, text, jsonb) from public;
grant execute on function public.vpps_stage_direct_import_20260514(text, text, jsonb) to anon, authenticated;

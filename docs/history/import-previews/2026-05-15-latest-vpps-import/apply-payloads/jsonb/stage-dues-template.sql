with payload as (
  select jsonb_array_elements(:'p'::jsonb) as r
)
insert into private.vpps_direct_import_stage_dues (import_name, source_key, payload)
select 'vpps-latest-2026-05-15-fullbook', r->>'source_key', r->'payload'
from payload
on conflict (import_name, source_key) do update set payload = excluded.payload;
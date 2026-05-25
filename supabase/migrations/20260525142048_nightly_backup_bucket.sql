insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nightly-backups',
  'nightly-backups',
  false,
  104857600, -- 100 MB ceiling per file
  array['text/csv', 'application/zip', 'application/json']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'nightly_backups: admin read'
  ) then
    create policy "nightly_backups: admin read"
      on storage.objects for select
      using (
        bucket_id = 'nightly-backups' and public.has_permission('settings:write')
      );
  end if;
end
$$;

alter table public.students
  add column if not exists photo_path text;

comment on column public.students.photo_path is
  'Storage path inside the student-photos bucket pointing to the avatar image for this student. Null when no photo uploaded.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-photos',
  'student-photos',
  false,
  524288, -- 512 KB ceiling; resized client-side to stay under 200 KB.
  array['image/jpeg', 'image/png', 'image/webp']
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
      and policyname = 'student_photos: staff read'
  ) then
    create policy "student_photos: staff read"
      on storage.objects for select
      using (
        bucket_id = 'student-photos' and auth.role() = 'authenticated'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'student_photos: staff upload'
  ) then
    create policy "student_photos: staff upload"
      on storage.objects for insert
      with check (
        bucket_id = 'student-photos' and auth.role() = 'authenticated'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'student_photos: staff update'
  ) then
    create policy "student_photos: staff update"
      on storage.objects for update
      using (
        bucket_id = 'student-photos' and auth.role() = 'authenticated'
      )
      with check (
        bucket_id = 'student-photos' and auth.role() = 'authenticated'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'student_photos: staff delete'
  ) then
    create policy "student_photos: staff delete"
      on storage.objects for delete
      using (
        bucket_id = 'student-photos' and auth.role() = 'authenticated'
      );
  end if;
end
$$;

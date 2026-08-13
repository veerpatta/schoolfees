-- Scope the student-photos bucket to staff permissions.
--
-- The four policies written in 20260525133208 all read
--
--     bucket_id = 'student-photos' and auth.role() = 'authenticated'
--
-- which is not a permission check — it only asks "is this anyone at all?". Any
-- signed-in staff member could read, overwrite and DELETE every student photo
-- in the school by talking to the storage API directly. The students:view gate
-- lives in app/protected/students/photo/route.ts, and a session token goes
-- straight past it.
--
-- That mattered little while the only way to reach the uploader was the desktop
-- edit form. A phone flow makes the bucket something staff touch daily, so it
-- gets the same permission model as the records it belongs to:
--
--   read   -> students:view                      (everyone who sees the list)
--   write  -> students:write or students:edit_basic  (whoever may edit a student)
--
-- Deliberately matches who can already edit a student in the app: admin and
-- teacher can change a photo, accountant and fee_collector cannot, view_only
-- can look but not touch. public.has_permission is STABLE SECURITY DEFINER and
-- reads private.current_staff_role(), so it evaluates correctly under the
-- browser client's JWT — which is what performs the upload.

begin;

drop policy if exists "student_photos: staff read" on storage.objects;
drop policy if exists "student_photos: staff upload" on storage.objects;
drop policy if exists "student_photos: staff update" on storage.objects;
drop policy if exists "student_photos: staff delete" on storage.objects;

create policy "student_photos: staff read"
  on storage.objects for select
  using (
    bucket_id = 'student-photos'
    and public.has_permission('students:view')
  );

create policy "student_photos: staff upload"
  on storage.objects for insert
  with check (
    bucket_id = 'student-photos'
    and (
      public.has_permission('students:write')
      or public.has_permission('students:edit_basic')
    )
  );

create policy "student_photos: staff update"
  on storage.objects for update
  using (
    bucket_id = 'student-photos'
    and (
      public.has_permission('students:write')
      or public.has_permission('students:edit_basic')
    )
  )
  with check (
    bucket_id = 'student-photos'
    and (
      public.has_permission('students:write')
      or public.has_permission('students:edit_basic')
    )
  );

-- Replacing a photo deletes the object it replaced, so delete follows write
-- rather than being admin-only.
create policy "student_photos: staff delete"
  on storage.objects for delete
  using (
    bucket_id = 'student-photos'
    and (
      public.has_permission('students:write')
      or public.has_permission('students:edit_basic')
    )
  );

commit;

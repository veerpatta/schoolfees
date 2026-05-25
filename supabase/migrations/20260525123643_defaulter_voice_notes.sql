-- Voice-note attachments on defaulter contact log entries.
--
-- A short (≤60s) audio clip recorded in the browser via MediaRecorder.
-- Uploaded to the private `defaulter-voice-notes` storage bucket before
-- the contact form is submitted. The path is stored on the contact row
-- and the timeline renders an <audio> element backed by a signed URL.

alter table defaulter_contacts
  add column if not exists voice_note_path text;

comment on column defaulter_contacts.voice_note_path is
  'Storage path inside the defaulter-voice-notes bucket pointing to the recorded '
  'audio clip for this contact attempt. Null when no voice note was attached.';

-- Private storage bucket for voice notes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'defaulter-voice-notes',
  'defaulter-voice-notes',
  false,
  5242880, -- 5 MB ceiling — 60 s @ webm/opus ≈ 0.5 MB, leave a generous margin.
  array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Staff (authenticated users) can read and upload to the bucket; updates and
-- deletes are intentionally not allowed — voice notes are append-only with
-- the contact-log row they belong to.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'defaulter_voice_notes: staff read'
  ) then
    create policy "defaulter_voice_notes: staff read"
      on storage.objects for select
      using (
        bucket_id = 'defaulter-voice-notes' and auth.role() = 'authenticated'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'defaulter_voice_notes: staff upload'
  ) then
    create policy "defaulter_voice_notes: staff upload"
      on storage.objects for insert
      with check (
        bucket_id = 'defaulter-voice-notes' and auth.role() = 'authenticated'
      );
  end if;
end
$$;

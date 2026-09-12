-- A WhatsApp notice can carry the document it is about.
--
-- AiSensy's v2 body takes `media: { url, filename }`, and Meta fetches that URL
-- ONCE, at send time, then stores the file in the chat. The parent keeps the
-- PDF, not the link. So the link needs to live for minutes, not months — which
-- makes a short-lived signed URL from a PRIVATE bucket both sufficient and far
-- safer than any durable public route.
--
-- Why not an existing route: every PDF route in this app is behind
-- `requireStaffPermission`, and Meta's fetcher carries no session. Why not a
-- public tokenised route: these documents name a child, their class and what
-- the family owes, and a route that renders on demand also puts a cold
-- serverless render between Meta's fetcher and a successful send.
--
-- `public.student_share_links` (20260525141454) was considered and rejected:
-- it is a tokenised link table for a PARENT to open in a browser, has never
-- been wired to anything, and answers a different question. Nothing here reuses
-- it, and nothing here duplicates it either — this stores an object path, not a
-- link.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'parent-documents',
  'parent-documents',
  false,
  -- A receipt is ~40 KB and a four-installment statement ~60 KB. 2 MB is room
  -- for a logo change or a longer family statement, and still small enough that
  -- nothing else can be smuggled in.
  2097152,
  array['application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No staff-facing policy at all, on purpose.
--
-- Every write and every signature happens server-side under the service role,
-- which bypasses RLS. A browser never touches this bucket: staff read a receipt
-- through /protected/receipts/[id]/pdf, which renders it fresh. Granting
-- `authenticated` read here would hand every signed-in account the whole
-- school's parent correspondence through the storage API, which is precisely
-- the hole 20260813170000 closed for student photos.
--
-- Written as a drop so a re-run cannot leave an older grant standing.
drop policy if exists "parent_documents: staff read" on storage.objects;
drop policy if exists "parent_documents: staff write" on storage.objects;

-- Where the object for a send lives, so a RETRY can re-sign it.
--
-- The signed URL is deliberately NOT stored: it has expired by the time anyone
-- retries, and a stored dead link is worse than no link — AiSensy accepts the
-- send and the parent receives a document that will not open. The path is
-- stable, the signature is minted per attempt.
alter table public.whatsapp_reminder_sends
  add column if not exists document_path text;

comment on column public.whatsapp_reminder_sends.document_path is
  'Object path inside the private parent-documents bucket for the PDF this notice carried, or null for a body-only notice. A retry re-signs from this path; the signed URL itself is never stored because it expires.';

commit;

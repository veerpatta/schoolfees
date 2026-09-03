-- A broadcast is not a conversation.
--
-- `sendRemindersAction` logs every messaged family to `defaulter_contacts` with
-- `channel = 'whatsapp'`, which is right: the family WAS contacted, it belongs
-- on the student's profile, and the office should see it.
--
-- But `deriveCadence` reads the latest contact timestamp and drops anyone
-- touched in the last six hours into `done`, so they leave the callers' Now
-- bucket. That rule exists to stop a collector ringing the same parent twice in
-- an afternoon — a good rule about a PERSON having just spoken to them.
--
-- A morning broadcast to 171 families therefore emptied the call list for the
-- rest of the day. The collectors lost their worklist precisely on the days the
-- office was pushing hardest, which is the opposite of what the reminder is for.
--
-- A marker, not a new channel value. The channel says HOW the family was
-- reached and 'whatsapp' is still true; `bulk` says whether a human chose this
-- family and typed to them, which is the thing the six-hour rule actually cares
-- about. Adding 'whatsapp_bulk' to the channel check would have made every
-- existing channel filter, icon map and per-number attribution wrong.

alter table public.defaulter_contacts
  add column if not exists bulk boolean not null default false;

comment on column public.defaulter_contacts.bulk is
  'True when this row records a family being included in a broadcast rather than '
  'a member of staff contacting them individually. Set by the WhatsApp reminder '
  'send; false for everything a collector logs by hand. '
  'deriveCadence IGNORES bulk rows for its six-hour and twenty-four-hour '
  'cool-off rules, so a morning broadcast does not empty the call list — but '
  'they still appear in the contact history, still count as attempts, and still '
  'carry their outcome, because the family really was contacted.';

-- The call queue reads "the latest contact that was not a broadcast" per student
-- on every load of the defaulters screen, so it is worth an index.
create index if not exists defaulter_contacts_student_personal_idx
  on public.defaulter_contacts (student_id, session_label, contacted_at desc)
  where not bulk;

comment on index public.defaulter_contacts_student_personal_idx is
  'Partial on `not bulk`: the cadence buckets are decided by the most recent '
  'PERSONAL contact, and a session with thousands of broadcast rows would '
  'otherwise make that lookup scan them all.';

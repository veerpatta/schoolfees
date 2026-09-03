# defaulters

The daily follow-up list, and the contact log behind it.

| | |
|---|---|
| Route | /protected/defaulters |
| Files | 10 domain · 2 data · 17 ui |

## Owns

- The worklist and its filters
- Contact logging, promises, no-call flags, voice notes
- The WhatsApp draft a collector sends

## Invariants

- **A late fee never makes a student a defaulter.** Overdue is decided by `pending_amount`, which is fees only. A family whose only debt is a late fee is not on this list.
- Money counts `record_status = 'active' OR total_paid > 0` — a student who left owing money still owes it.

## Never

- Take a payment here. Collection happens at the Payment Desk.

## A broadcast is not a conversation

`deriveCadence` drops anyone contacted in the last six hours into `done`, so a
collector does not ring the same parent twice in an afternoon. That is a fact
about a PERSON having just spoken to them.

`sendRemindersAction` logs every messaged family here as a `whatsapp` contact —
correctly, because the family really was contacted and it belongs on their
profile. But it meant a 171-family morning broadcast put all of them in `done`
and emptied the call list for the rest of the day, on exactly the days the
office was pushing hardest.

So `defaulter_contacts.bulk` marks a row as part of a broadcast, and the cadence
rules read `lastPersonalContactedAt` — the latest row that was NOT one — for
both the six-hour and twenty-four-hour cool-offs, and for the heat score's
freshness penalty.

A marker rather than a new `channel` value, deliberately: the channel says how
the family was reached and `whatsapp` is still true, while `bulk` says whether a
human chose them and typed to them. Adding `whatsapp_bulk` to the channel check
would have made every channel filter, icon map and per-number attribution wrong.

Bulk rows still show in the history, still count as attempts and still carry
their outcome. They simply do not cool a family off the call list.

## Shared with the reminders

`suggestPhoneLabel` and `PhoneResponsiveness` moved to
`@/platform/helpers/phone-responsiveness` and are re-exported from
`domain/cadence.ts`, so every existing caller is unchanged.

They moved because the WhatsApp reminders pick which parent to message from the
same signal this module picks which parent to ring — and `defaulters/ui` already
imports `whatsapp/domain/render`, so importing back the other way would have
closed a module cycle that `npm run quality:architecture` counts.

A family the reminders have messaged twice without payment gets the third notice
on the second number as well. That decision is made in
`whatsapp/domain/family-grouping.ts`, from this module's answer about which
number answers.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.

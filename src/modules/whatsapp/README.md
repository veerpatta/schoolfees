# whatsapp

Fee reminders and the message templates behind them.

| | |
|---|---|
| Route | /protected/reminders (+ campaigns, runs) · /protected/admin-tools/whatsapp-templates |
| Files | 16 domain · 7 data · 11 ui |

## Owns

- Template storage and rendering, in English and Hindi
- Reminder cadence — which families to remind, and how often
- The AiSensy send path
- The fee calendar's read of who is due a reminder today (`domain/installment-calendar.ts`)
- Grouping the audience into families, one message per phone (`domain/family-grouping.ts`)

## Invariants

- Cadence decides who is due a reminder. It exists so staff stop unticking the same families by hand every day.
- **The calendar decides the installments, not a constant.** `TEMPLATE_INSTALLMENTS` is the last-resort fallback for a session with no readable schedule; the default comes from `buildInstallmentCalendar` and is resolved once, in `parseReminderFilters`, so the filter and the slot {{4}} phrase cannot disagree.
- **A late fee is read, never derived.** `late_fee_applied` quotes `v_workbook_installment_balances.late_fee_pending`. The view is the only thing that knows about waivers and the accrual rule at once — recomputing it in TypeScript is the trap `waive_late_fee` fell into from the other side.
- **Fees and the late fee reach the message in separate slots.** `pending_amount` is fees, `late_fee_pending` is the late fee, and only `total_pending` adds them. A message folding the first two together would be the first place "a late fee is not a fee" broke.
- **One phone, one message.** The audience is derived per student because the ledger and the send log are keyed that way, but `sendFamily` groups by destination. Siblings get `covered_by_sibling` rows carrying the messaged sibling's `provider_message_id`, so the unique index, the cadence gap and the run outcomes all still work per student. Since 2026-09-04 a phone with siblings gets the family template on fee_due, balance and upcoming (`domain/family-notice.ts` decides; `late_fee_applied` stays per-child until its date and total slots have a source), and every row carries the name of the message that went — so "already messaged today" reads BOTH names a notice can log under.
- **Language belongs to the family.** The run's language is a default; `student_collection_flags.whatsapp_language` overrides it, and the send row records what actually went out.
- **`approved` is explicit on every descriptor.** `campaignFor` refuses an unapproved campaign, and the picker shows the chip disabled rather than hiding it. All eighteen `_v3` campaigns have been approved and Live since 2026-09-04; approval is changed in code and deployed, never from a screen or a settings row.

## Never

- Import `domain/campaign-bodies-v3` from `ui/` or from `src/app`. It holds the family and receipt template bodies, which only `data/run-sender.ts` and `data/receipt-notice.ts` send and no screen previews — so every byte of it in the client bundle is unreachable text against a ceiling that only ratchets down. `tests/ui/whatsapp-reminders-screen.test.ts` enforces it.
- Send to a family that has asked not to be called. Respect the no-call flag.
- Insert into `student_collection_flags` without passing `no_call: false` explicitly. Its default is TRUE, so a row written to record a cadence or a language would silently drop the family out of the call queue.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.

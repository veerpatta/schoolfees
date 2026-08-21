# WhatsApp fee reminders

`/protected/admin-tools/whatsapp-reminders` — an Admin Tools screen that lists
families with pending fees, lets an admin tick the ones they mean, and sends them
a Meta-approved WhatsApp template through AiSensy's Campaign API. Live in
production since 20 Aug 2026, rendering 150 eligible families.

Nothing on this screen sends on its own. Every send is a press, and every press
costs money and reaches a real parent with a child's name and fee balance on it.

## Files

| Path | What it is |
|---|---|
| `src/app/protected/admin-tools/whatsapp-reminders/page.tsx` | Server page: resolves the session, builds the audience, renders warnings |
| `src/app/protected/admin-tools/whatsapp-reminders/actions.ts` | `sendRemindersAction`, `sendTestReminderAction` |
| `src/app/protected/admin-tools/whatsapp-reminders/loading.tsx` | Route skeleton |
| `src/modules/whatsapp/ui/reminders-workspace.tsx` | Filters, list (cards + table), selection, send |
| `src/modules/whatsapp/ui/test-send-panel.tsx` | The test panel: editable slots, live preview, raw provider result |
| `src/modules/whatsapp/domain/reminder-template.ts` | The template body, its constants, `buildReminderParams`, `renderReminderPreview`. **No `server-only`** — the live preview runs in the browser |
| `src/modules/whatsapp/domain/phone.ts` | `toWhatsappDestination`. Pure, client-safe |
| `src/modules/whatsapp/data/aisensy.ts` | Campaign API client. `server-only` |
| `src/modules/whatsapp/domain/fee-reminders.ts` | Audience query and filters. `server-only` — a client component may only `import type` from it |
| `supabase/migrations/20260820140000_whatsapp_reminder_sends.sql` | The send log |
| `tests/unit/whatsapp-reminder-template.test.ts` | Slot count/order, amount formatting, phone normalisation |
| `tests/ui/whatsapp-reminders-screen.test.ts` | Takeover clearance, one form, the name-less checkbox, client boundary |

## Design decisions — preserve these unless asked

- **The audience is never stored.** It is re-derived from
  `v_workbook_student_financials` on every page load, which is what makes
  "families who paid drop off automatically" free. Do not add a candidates table.
- **Nothing is pre-selected**, and Send asks for confirmation naming the count.
- **Amounts are re-derived server-side** in `sendRemindersAction` from the
  submitted student ids. Never trust an amount posted from the client — a family
  who paid since page load must drop out at send time.
- **`whatsapp_reminder_sends` claims the row before the provider call**, so the
  unique `(student_id, session_label, sent_on)` index decides races. Already-sent
  families render greyed and unselectable.
- Exclusions reuse `student_collection_flags.no_call` — do not invent a second
  do-not-contact list.
- Sends are logged to `defaulter_contacts` as a `whatsapp` contact, best-effort.
- **A test is never written to `whatsapp_reminder_sends`.** There is no Supabase
  call anywhere in `sendTestReminderAction`, and that absence is the guarantee.
  Logging a test would claim that student's day and silently drop them from the
  real send.

## Cadence — how often one family hears from us

The list is rebuilt from the ledger every load, so families who pay drop off by
themselves. What was *not* persisted was the office's own judgement — "this
family pays eventually, don't chase them every few days" — so the same twenty
rows got unticked by hand, every run. Two controls on each row fix that:

| Control | Effect |
|---|---|
| **Cadence** — every run / weekly / fortnightly / monthly / never | Minimum gap before this family may be messaged again |
| **Skip 7d** | A one-tap snooze; they return on their own, nothing to remember |

Three things hold together here:

- **The gap is measured against `whatsapp_reminder_sends.sent_on`,** not a
  "last reminded" column. The send log already knows what actually went out, so
  the cadence cannot drift away from reality. Only rows with `status = 'sent'`
  count — a failed attempt reached nobody and must not delay the next reminder.
- **This is WhatsApp only.** It writes `whatsapp_cadence` and
  `whatsapp_snoozed_until` on `student_collection_flags` and never `no_call`,
  which is what the Defaulters call queue reads. A family set to *monthly* still
  gets called on the usual cadence — that separation is the whole point.
- **`no_call` DEFAULTS TO TRUE on that table.** A row inserted to record a
  cadence must pass `no_call: false` explicitly or it would silently drop the
  family from the call queue. `writeReminderFlags` in `actions.ts` updates first
  and inserts only when there is no row, for exactly this reason. Anything else
  writing that table needs the same care.

The ledger is applied *before* the cadence, so a family who has paid is simply
absent rather than being reported as "held back by your settings".

Anything held back appears in a **"N families are being held back by your
settings"** disclosure with a one-tap undo, because a decision you cannot see is
a decision you cannot reverse.

## Does a discount reach the message?

Yes, and there are two independent reasons — which is the point, because the
figure in that message is what a parent is told they owe.

**The amount is re-derived at send time.** `sendRemindersAction` rebuilds the
audience from the ledger using the submitted student ids and ignores whatever
number was rendered into the page. A family who paid, or had a discount applied,
after the page loaded gets the current figure — or drops off the list entirely.

**The matview is drained before quoting.** `v_workbook_student_financials` is
MATERIALIZED. Fifteen triggers mark it dirty when money changes — including
`student_conventional_discount_assignments` (applying a discount to a student)
and `conventional_discount_policies` (changing RTE / Staff Child / 3rd Child
itself) — and a pg_cron job drains that queue every two minutes.

That left a window, and it was real. Measured on TEST-2026-27: apply a 500
discount and the ledger reads 13,750 while the matview still says **14,250**,
with a refresh queued. Send inside those two minutes and the parent is quoted the
pre-discount amount. So the page and the send action both call
`drainPendingFinancialRefresh()` first. It costs **0ms when nothing is queued**
(it returns false without touching a view) and **~386ms** when a refresh is
actually pending — cheap enough to pay on every send.

**Siblings do not enter into the amount.** `v_workbook_student_financials` does
not read `student_family_members` at all. Sibling links change who is *eligible*
for the 3rd Child Policy; the money moves only when the discount is explicitly
assigned, and that assignment is one of the fifteen triggers. Which matches the
standing rule that conventional discounts are assigned deliberately, never
inferred.

Health check, any time — it should be 0, and was across all 510 students on
2026-08-21:

```sql
select count(*) filter (where f.inst1_pending + f.inst2_pending <> l.live) as disagreeing
from public.v_workbook_student_financials f
join (select student_id,
             sum(case when installment_no in (1,2) then coalesce(pending_amount,0) else 0 end) live
      from public.v_workbook_installment_balances where session_label = '2026-27'
      group by 1) l using (student_id)
where f.session_label = '2026-27';
```

## The template — read this before changing anything about the message

The approved body has **exactly four variables**, confirmed empirically by sending
`P1..P4` markers and reading what arrived. Five params are rejected.

```
*फीस सूचना - किश्त 1 एवं 2*
प्रिय {{1}},                                    <- parent name

श्री वीर पत्ता सीनियर सेकेंडरी स्कूल की ओर से सूचित किया जाता है कि
{{2}} ({{3}}) की सत्र 2026-27 की किश्त 1 एवं किश्त 2 की फीस अभी बकाया है।
                                                <- student name, class
देय राशि: रु. {{4}}                              <- amount, plain grouped
अंतिम तिथि: 25 अगस्त 2026                        digits, no rupee glyph

कृपया 25 अगस्त 2026 तक यह राशि जमा करें। इसके बाद प्रत्येक किश्त पर
रु. 1,000 विलंब शुल्क लागू किया जाएगा।

... UPI link upi://pay?pa=shriveerpattassecsch.68347408@hdfcbank
... office number 9352205884
```

Two hard consequences, both coded and both easy to break:

1. **The deadline is hardcoded.** There is no date variable.
   `FEE_REMINDER_TEMPLATE_DEADLINE` (`src/modules/whatsapp/domain/reminder-template.ts`) is
   `2026-08-25` and `sendRemindersAction` refuses to send after it. Do not weaken
   that guard. `FEE_REMINDER_DEADLINE_LABEL` is the same date as the body prints
   it, kept beside the ISO one so the preview cannot quote a date the guard does
   not enforce. If a replacement template is approved with a `{{5}}` date, update
   the constants, the param order and the preview together.
2. **The wording names installments 1 and 2 in fixed text.** The installment
   filter can be changed on screen, so the page warns when the selection stops
   matching. Keep that warning.

The amount quoted is **installments 1 + 2 of the current session only** — not the
ledger's `overdue_base_amount`, which also folds in last year's carry-forward. For
admission 2241 those read ₹14,750 and ₹34,750. The office has only ever quoted the
smaller figure. Do not "fix" this.

`renderReminderPreview` is built **from** `buildReminderParams`, so the preview and
the message cannot quote different values. Keep it that way.

## The test panel

Its own name and number fields, plus the other three slots, each pre-filled from
the top row of the current list and editable. The preview re-renders on every
keystroke, and the number field resolves live to the exact `+91…` string that will
be posted.

The result is shown raw — HTTP status, the campaign echoed back, the destination,
`submitted_message_id`, the four params as sent, and on failure AiSensy's own error
string verbatim. That is what lets staff tell a rejected campaign name from a bad
number without opening the AiSensy dashboard:

- wrong campaign → `HTTP 400` · `Campaign does not exist.`
- bad number → `HTTP status: never sent` (refused before the provider was called)

The panel is **not** gated on the template deadline, deliberately: a test to a
staff phone after the 25th is exactly what you need while a replacement template is
in approval, and it reaches no parent.

## Mobile

The screen has a real phone layout; there is no `MobileDesktopOnlyNotice`.

`/protected/admin-tools` is in `mobileTakeoverRoutes`, so `MobileBottomNav` renders
**nothing** here. The sticky send bar therefore clears **only the safe area**:

```tsx
style={{ paddingBottom: "calc(var(--mobile-safe-area-bottom, 0px) + 0.75rem)" }}
```

Never `var(--mobile-bottom-nav-offset,0px)` on this route — it would reserve 68px
for a tab bar that is not there. `tests/ui/whatsapp-reminders-screen.test.ts` pins
this, and this file is deliberately **not** in the `NAV_CLEARANCE` list in
`tests/ui/mobile-action-reachability.test.ts`, which asserts the opposite rule.

Other load-bearing details:

- **Both branches live inside the one `<form action={sendFormAction}>`** so the
  hidden `studentId` inputs, the filters and the confirm state are single-sourced.
- **The card checkbox has no `name`.** The selection travels via the hidden inputs;
  a `name` here would post a second, unfiltered copy of it.
- The filters are two separate GET forms sharing one `ReminderFilterFields`
  renderer — collapsed behind a `<details>` on a phone, the five-column grid above
  `md`. The `idPrefix` is required: both copies sit in the DOM at every viewport,
  so without it every `<Label htmlFor>` would point at a duplicated id.
- The confirm step grows the bar in place rather than opening a `Sheet`, which
  would portal out of the form and break `useFormStatus`.

## Configuration

AiSensy Campaign API, Basic plan. The Campaign API is included; the richer
"Project API" with delivery webhooks is Pro-only and **not** available — which is
why nothing reads delivery status back. `submitted_message_id` is an acceptance
receipt, not proof the parent's phone lit up.

```
Endpoint  POST https://backend.aisensy.com/campaign/t1/api/v2
Campaign  Fees Collection August
```

```json
{
  "apiKey": "<key>",
  "campaignName": "Fees Collection August",
  "destination": "+919352205884",
  "userName": "<parent name>",
  "source": "veerpatta-fees-app",
  "templateParams": ["<parentName>", "<studentName>", "<class>", "<amount>"]
}
```

Success is `200` with `{"success":"true","submitted_message_id":"<uuid>"}`.
A wrong parameter count returns `400 {"message":"Template params does not match the campaign"}`
and costs nothing.

`AISENSY_API_KEY` (sensitive) and `AISENSY_CAMPAIGN` are set in Vercel Production
and documented as placeholders in `.env.example`. For local work put both in
`.env.local` — `npx vercel env pull` fetches them. **Never commit the key; this
repo is public.**

Other coordinates: Supabase project `vgqyilgstjvgohrsiwkb` (ap-south-1),
production `https://schoolfees-two.vercel.app`, Vercel plan **Hobby** (60s function
cap, cron once daily).

Owner's own WhatsApp number, safe for testing: **7976199548**.

## Working on this screen

- Test only against **7976199548**. Never send to a row off the live list to
  "check it works".
- To exercise the send path without messaging anyone, point `AISENSY_CAMPAIGN` at
  a wrong name: AiSensy returns a clean `400` and bills nothing.
- A push to `main` deploys to production immediately — there is no staging.
- The screen is English-only with hardcoded strings. It references no message keys,
  which is why it passes `tests/scan/checks/i18n.mjs`. Translating it means doing
  `messages/{en,hi,hi-en}.json` together.

```bash
npm run typecheck && npx eslint src/app/protected/admin-tools/whatsapp-reminders src/modules/whatsapp/ui src/modules/whatsapp && node scripts/audit-money-formatting.mjs && npm run build
```

`npm run scan` additionally catches this feature's signature failure — a value
import of a `server-only` module from something the client bundle reaches.

# WhatsApp fee reminders

`/protected/admin-tools/whatsapp-reminders` — an Admin Tools screen that lists
families with pending fees, lets an admin tick the ones they mean, and sends them
a Meta-approved WhatsApp template through AiSensy's Campaign API. Live in
production since 20 Aug 2026.

There are **three notices in two languages** — six approved templates, six Live
campaigns. Which one goes out is picked on screen, and it changes who is on the
list: fee due (nothing received), balance (part paid, still owing) and previous
session (a carry-forward balance). Measured on the live session, those reach 146,
258 and 51 families respectively.

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
| `src/modules/whatsapp/ui/notice-picker.tsx` | The notice chips, the language toggle and the date field |
| `src/modules/whatsapp/domain/campaigns.ts` | **The registry.** Campaign name, slot order, param builder and preview body for each of the six. **No `server-only`** — the live preview runs in the browser |
| `src/modules/whatsapp/domain/phone.ts` | `toWhatsappDestination`. Pure, client-safe |
| `src/modules/whatsapp/data/aisensy.ts` | Campaign API client. `server-only` |
| `src/modules/whatsapp/domain/fee-reminders.ts` | Audience query and filters. `server-only` — a client component may only `import type` from it |
| `supabase/migrations/20260820140000_whatsapp_reminder_sends.sql` | The send log |
| `supabase/migrations/20260821170000_whatsapp_reminder_sends_per_campaign.sql` | One send per campaign per day, not one per day |
| `docs/modules/whatsapp-campaign-registry.md` | **Ground truth** for the six campaign names, slot orders and bodies |
| `tests/unit/whatsapp-campaigns.test.ts` | Slot counts and order per campaign, no rupee glyph in a slot |
| `tests/ui/whatsapp-reminders-screen.test.ts` | Takeover clearance, one form, the name-less checkbox, client boundary, notice/language/date round-trip |

## Design decisions — preserve these unless asked

- **The audience is never stored.** It is re-derived from
  `v_workbook_student_financials` on every page load, which is what makes
  "families who paid drop off automatically" free. Do not add a candidates table.
- **Nothing is pre-selected**, and Send asks for confirmation naming the count.
- **Amounts are re-derived server-side** in `sendRemindersAction` from the
  submitted student ids. Never trust an amount posted from the client — a family
  who paid since page load must drop out at send time.
- **`whatsapp_reminder_sends` claims the row before the provider call**, so the
  unique `(student_id, session_label, sent_on, campaign_name)` index decides
  races. Already-sent families render greyed and unselectable — for *that notice*
  only, which is the point of `campaign_name` being in the index.
- **The notice, the language and the date live in the query string**, never in
  client state. The notice changes the audience, and `sendRemindersAction`
  re-derives that audience from the very same parser — a choice the action could
  not see would message a different set of families than the office ticked. It
  also makes each notice linkable and the back button work, the same rule the
  Dashboard boards follow.
- **Every GET form on the screen carries all three.** The picker owns the date
  field but the filters are a separate `<form>`; without hidden copies, pressing
  Apply would drop the notice, the language and the deadline out of the URL and
  silently reset them mid-task.
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

## The six notices — read this before changing anything about the message

`src/modules/whatsapp/domain/campaigns.ts` is the registry: campaign name, slot
order, param builder and preview body for each of the six, in one place so they
cannot drift apart. `docs/modules/whatsapp-campaign-registry.md` is the ground
truth it was copied from — the approved bodies and the slot orders as submitted
to Meta.

| Situation | Who it is about | Slots | Campaigns |
|---|---|---|---|
| `fee_due` | Nothing received (`total_paid <= 1100`) and every selected installment pending | 6 | `vpps_app_fee_due_hi` · `vpps_app_fee_due_en` |
| `balance` | Part paid, still owing on installments 1–4 | 6 | `vpps_app_balance_hi` · `vpps_app_balance_en` |
| `prevyear` | A carry-forward balance with something left on it | 5 | `vpps_app_prevyear_hi` · `vpps_app_prevyear_en` |

**The two current-year notices are mutually exclusive by construction, not by a
filter someone has to get right.** `maxTotalPaid` is 1100, the academic fee, so at
or below it nothing real has been received. Measured live, the overlap is zero.

`prevyear` is the opposite: 47 of the 51 families carrying a balance forward also
owe this year. That is why the send log is keyed per campaign — under the old
one-a-day index the current-year notice claimed the day and the previous-session
notice could never reach them at all.

### Four things that are easy to break

1. **The slot COUNT is what costs money.** A wrong count is refused by AiSensy
   with `Template params does not match the campaign` — visible, annoying, free.
   A wrong *order* sends cleanly and a parent reads their child's class where the
   amount should be. `tests/unit/whatsapp-campaigns.test.ts` pins both, and the
   counts were confirmed against the live campaigns by posting one param short to
   each and reading the 400 back.
2. **No rupee glyph in a slot.** Every body prints `रु.` / `Rs.` itself, so a
   glyph in the param arrives doubled. Amounts go through `formatRupeesPlain`.
3. **The class label is stripped.** The bodies already print `कक्षा:` / `Class:`,
   so `shortClassLabel` sends `2`, not `Class 2`. It is a `^Class\s+` strip,
   verified against all 19 live labels: `Nursery`, `JKG`, `SKG`, `11 Science`
   and the rest pass through untouched.
4. **The date is a variable now, and it is the office's choice.** It defaults to
   the next installment due date after today, from the fee policy — deliberately
   **not** `next_due_date`, which lands on the carry-forward row (dated
   `2026-04-01`, before Installment 1's `2026-04-20`) for every CF family and
   would tell them "Previous year tuition balance (2025-26)" inside a
   current-year notice. `prevyear` carries no date at all: that balance has no
   due date and no late fee.

The old `Fees Collection August` campaign hardcoded `25 अगस्त 2026` in its body,
which is why `FEE_REMINDER_TEMPLATE_DEADLINE` existed and why the screen refused
to send from the 26th. Both constants are gone. The guard that replaced them
refuses to send when the **office-picked date is in the past** — same protection,
no expiry date of its own.

The amount `fee_due` quotes is **installments 1 + 2 of the current session only** —
not `overdue_base_amount`, which also folds in last year's carry-forward. For
admission 2241 those read ₹14,750 and ₹34,750. The office has only ever quoted the
smaller figure. Do not "fix" this. `balance` quotes everything still owed on
installments 1–4, and what has been received so far; `prevyear` quotes
`remaining_amount` from `v_student_carry_forward_balances`, never
`original_amount`, which ignores every payment made against it since.

`renderPreview` and `buildParams` sit on the same descriptor and are tested
together, so the preview and the message cannot quote different values. Keep it
that way.

## The test panel

Its own name and number fields, plus **one field per slot the selected campaign
declares, in its order** — so the same panel tests a 6-slot notice and a 5-slot
one without knowing anything about either. Fields are pre-filled from the top row
of the current list, falling back to that campaign's own Meta-submitted sample
when the list is empty. The preview re-renders on every keystroke, and the number
field resolves live to the exact `+91…` string that will be posted.

The result is shown raw — HTTP status, the campaign echoed back, the destination,
`submitted_message_id`, the params as sent, and on failure AiSensy's own error
string verbatim. That is what lets staff tell a rejected campaign name from a bad
number without opening the AiSensy dashboard:

- wrong campaign → `HTTP 400` · `Campaign does not exist.`
- wrong slot count → `HTTP 400` · `Template params does not match the campaign`
- bad number → `HTTP status: never sent` (refused before the provider was called)

The panel is **not** gated on the date guard, deliberately: testing a template
whose date has slipped, on a staff phone, is exactly when you need to.

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
Campaign  one of the six, chosen by the registry from (notice, language)
```

```json
{
  "apiKey": "<key>",
  "campaignName": "vpps_app_fee_due_hi",
  "destination": "+919352205884",
  "userName": "<parent name>",
  "source": "veerpatta-fees-app",
  "templateParams": ["<parentName>", "<studentName>", "<class>", "<installment>", "<amount>", "<lastDate>"]
}
```

Success is `200` with `{"success":"true","submitted_message_id":"<uuid>"}`.
A wrong parameter count returns `400 {"message":"Template params does not match the campaign"}`
and costs nothing.

`AISENSY_API_KEY` (sensitive) is set in Vercel Production and documented as a
placeholder in `.env.example`. For local work put it in `.env.local` —
`npx vercel env pull` fetches it. **Never commit the key; this repo is public.**

There is deliberately **no `AISENSY_CAMPAIGN`** any more. One env var cannot name
six campaigns, and an env fallback would turn a registry miss into a silently
wrong template arriving at a parent. `campaignFor()` throws instead.

Other coordinates: Supabase project `vgqyilgstjvgohrsiwkb` (ap-south-1),
production `https://schoolfees-two.vercel.app`, Vercel plan **Hobby** (60s function
cap, cron once daily).

Owner's own WhatsApp number, safe for testing: **7976199548**.

## Working on this screen

- Test only against **7976199548**. Never send to a row off the live list to
  "check it works".
- To exercise the send path without messaging anyone, post a deliberately wrong
  param count — AiSensy answers `400 Template params does not match the campaign`,
  sends nothing and bills nothing. A wrong campaign name does the same. Both are
  how the six live campaigns were confirmed to expect 6/6/5 slots.
- A push to `main` deploys to production immediately — there is no staging.
- The screen is English-only with hardcoded strings. It references no message keys,
  which is why it passes `tests/scan/checks/i18n.mjs`. Translating it means doing
  `messages/{en,hi,hi-en}.json` together. The *message* language is a separate
  thing entirely — that is the picker, and it changes only which campaign is
  posted, never who is on the list.

```bash
npm run typecheck && npx eslint src/app/protected/admin-tools/whatsapp-reminders src/modules/whatsapp/ui src/modules/whatsapp && node scripts/audit-money-formatting.mjs && npm run build
```

`npm run scan` additionally catches this feature's signature failure — a value
import of a `server-only` module from something the client bundle reaches.

## Open risk: Meta re-categorises silently

`vpps_waiver_offer_hinglish` went UTILITY → MARKETING fourteen minutes after
submission — a 7.5× cost move, with no notification. Nothing in the app can
detect it. The cheap mitigation is that `whatsapp_reminder_sends` already stores
`campaign_name` per row, so a monthly count by campaign checked against the
AiSensy bill is a two-line query rather than a feature.

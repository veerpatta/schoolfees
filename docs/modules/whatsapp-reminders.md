# WhatsApp fee reminders

`/protected/reminders` — a top-level section that lists families with pending
fees, lets an admin tick the ones they mean, and sends them a Meta-approved
WhatsApp template through AiSensy's Campaign API. Live since 20 Aug 2026; moved
out of Admin Tools on 22 Aug, where the old path still redirects.

Three screens:

| Route | What it is |
|---|---|
| `/protected/reminders` | Send. The audience, the notice, the late fee, the list. |
| `/protected/reminders/campaigns` | Saved settings you can apply again, and what each has collected. |
| `/protected/reminders/runs/[runId]` | One press of Send: who it reached, and what came in after. |

There are **seven notices in two languages**. Six templates are approved and
Live, all `_v2`, covering three of them: fee due (nothing received), balance
(part paid, still owing) and previous session (a carry-forward balance).
Measured live on 22 Aug: 146, 171 and 51 families.

The other four — **due soon, final call, late fee applied, promise lapsed** —
are written, in the registry, and marked `approved: false`. Their chips render
disabled with "awaiting Meta approval" and `campaignFor` refuses them, until an
admin turns them on having seen the template Live in AiSensy. The bodies to
submit are in `docs/modules/whatsapp-campaign-registry.md`.

**The calendar decides which installments a notice is about.** It used to be a
hardcoded `[1, 2]`, which was true in August and silently wrong from October:
installment 3 passed its due date with nothing on the screen aware it existed.
`domain/installment-calendar.ts` reads the fee policy's schedule and answers
what today makes of it — what has passed, what falls inside the pre-due window
(10 days, settable per run), and which installment is next. An explicit
installment choice on the screen still wins.

**Every send is a press.** There is no cron, no scheduler and no auto-send, and
that is a decision rather than an omission.

Nothing on this screen sends on its own. Every send is a press, and every press
costs money and reaches a real parent with a child's name and fee balance on it.

## Files

| Path | What it is |
|---|---|
| `src/app/protected/reminders/page.tsx` | Server page: resolves the session, builds the audience, renders warnings |
| `src/app/protected/reminders/actions.ts` | `sendRemindersAction`, `sendTestReminderAction` |
| `src/app/protected/reminders/campaigns/{page,actions}.tsx` | Saved campaigns: list, save, archive |
| `src/app/protected/reminders/runs/[runId]/page.tsx` | One run and its outcome |
| `src/app/protected/admin-tools/whatsapp-reminders/page.tsx` | Query-preserving redirect to the new path |
| `src/modules/whatsapp/domain/late-fee.ts` | The slot-7 phrase composer and the ledger-drift warning. **No `server-only`** |
| `src/modules/whatsapp/data/campaign-store.ts` | Campaign + run reads and writes. `server-only` |
| `src/modules/whatsapp/ui/campaign-manager.tsx` | The campaigns list and its form |
| `src/modules/whatsapp/ui/reminders-workspace.tsx` | Filters, list (cards + table), selection, send |
| `src/modules/whatsapp/ui/test-send-panel.tsx` | The test panel: editable slots, live preview, raw provider result |
| `src/modules/whatsapp/ui/notice-picker.tsx` | The notice chips, the language toggle and the date field |
| `src/modules/whatsapp/domain/campaigns.ts` | **The registry.** Campaign name, slot order, param builder and preview body for each of the six. **No `server-only`** — the live preview runs in the browser |
| `src/modules/whatsapp/domain/phone.ts` | `toWhatsappDestination`. Pure, client-safe |
| `src/modules/whatsapp/data/aisensy.ts` | Campaign API client. `server-only` |
| `src/modules/whatsapp/domain/fee-reminders.ts` | Audience query and filters. `server-only` — a client component may only `import type` from it |
| `src/modules/whatsapp/domain/installment-calendar.ts` | What today makes of the fee calendar, and the per-notice date guard. Pure, **no `server-only`** |
| `src/modules/whatsapp/domain/family-grouping.ts` | One phone, one message: grouping, the children line, the family's language, the second number. Pure |
| `src/modules/whatsapp/domain/campaign-bodies-v3.ts` | The sixteen unapproved bodies. **No `ui/` or `src/app` file may import it** — a test enforces it |
| `src/platform/helpers/phone-responsiveness.ts` | `suggestPhoneLabel`, shared with defaulters. Moved out of that module to avoid a cycle |
| `supabase/migrations/20260903130517_whatsapp_family_language_and_numbers.sql` | Family language, sibling coverage, second numbers |
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
  unique `(student_id, session_label, sent_on, campaign_name, destination_role)`
  index decides races. The role joined it in 20260903130517 so a family who has
  stopped answering on one number can be reached on the other — and no further,
  because a role has exactly two values. Already-sent families render greyed and unselectable — for *that notice*
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
- **One phone gets one message.** The audience is still derived per STUDENT,
  because that is how the ledger stores money and how the send log prevents
  duplicates — but `sendFamily` groups by destination before sending. A parent
  with three children was getting three messages within a few seconds, quoting
  three balances for one debt.

  Every child still gets a send-log row. The siblings who were not messaged
  separately carry `status = 'covered_by_sibling'` and the SAME
  `provider_message_id` as the message that went, so the per-student unique
  index still holds, the cadence gap is still measured per student, and
  `v_whatsapp_run_outcomes` still joins their payments to the run. Without the
  row they would look un-contacted tomorrow and be messaged again.

  The family templates are not approved yet, so what goes today is the
  **spokesperson's** ordinary per-child notice — the largest debt on the phone.
  Approving `vpps_app_family_*` changes what that one message SAYS, not how many
  go out.
- **Language belongs to the family, not the run.** The run's language is a
  DEFAULT; `student_collection_flags.whatsapp_language` overrides it, and
  `whatsapp_reminder_sends.language` records what actually went out. Answering
  "which language did this parent get" from the run record would be a guess.
- **A family is messaged on a second number only after two delivered notices.**
  There is deliberately no separate "and they have not paid" check: the ledger is
  applied before everything else, so a family who paid is ABSENT from the list
  rather than present-and-filtered. Still being here after two sends IS not
  having paid. The ceiling of two numbers is enforced by `destination_role`
  being an enum, not by the code.
- **A late fee is read from the ledger, never derived.** `late_fee_applied`
  quotes `v_workbook_installment_balances.late_fee_pending`, and the amount is
  not editable on that notice — there is nothing to drift from, so
  `describeLateFeeDrift` returns null for it. Fees, the late fee and the total go
  in three separate slots because the ledger keeps them in three separate
  columns.
- **A family inside a promise they have given is held back** from every notice
  except `promise_lapsed`, and appears in the held-back list with the date.
  Chasing a family inside their own promise window is how a promise that was
  going to hold stops holding.
- **The date guard is per notice.** Every forward-looking notice refuses a date
  already gone. `late_fee_applied` carries no date slot at all — its subject is
  that a date has passed — so requiring a future one would block the only notice
  that fits the situation. `describeDateGuard` owns the rule.
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
| `fee_due` | Nothing received (`total_paid <= 1100`) and **every** selected installment pending | 6 | `vpps_app_fee_due_hi` · `vpps_app_fee_due_en` |
| `balance` | Part paid, still owing on **any** selected installment | 6 | `vpps_app_balance_hi` · `vpps_app_balance_en` |
| `prevyear` | A carry-forward balance with something left on it | 5 | `vpps_app_prevyear_hi` · `vpps_app_prevyear_en` |

**The two current-year notices are mutually exclusive by construction, not by a
filter someone has to get right.** `maxTotalPaid` is 1100, the academic fee, so at
or below it nothing real has been received. Measured live, the overlap is zero.

`prevyear` is the opposite: 47 of the 51 families carrying a balance forward also
owe this year. That is why the send log is keyed per campaign — under the old
one-a-day index the current-year notice claimed the day and the previous-session
notice could never reach them at all.

### The eligibility filters are per notice

Ticking, unticking, Select all, Clear, the per-family cadence and the snooze all
work exactly as they did on the single template — they are notice-agnostic and
always were. The **filters** are not: `SITUATION_FILTERS` in
`domain/campaigns.ts` declares which ones each notice honours, and what they are
called there.

| Control | `fee_due` | `balance` | `prevyear` |
|---|---|---|---|
| Paid so far | "at most" — the threshold | "over" — the same threshold, other side | hidden |
| Installments | "Installments pending" — **all** selected | "Still owing on" — **any** selected | hidden |
| Minimum | "Due at least" | "Balance at least" | "Carry-forward at least" |
| Class · Include RTE | yes | yes | yes |

Two rules, both learned the hard way:

- **A control a notice ignores is hidden, not disabled.** The installment
  dropdown used to sit on all three while only `fee_due` honoured it. Measured
  live: 87 of the 258 families on the balance list were fully paid up on
  installments 1 and 2 and owed only 3 and 4 — ₹7,77,075 not due until October
  and January. The office read "Installments pending: 1 and 2" and was chasing
  money nobody owed yet. With the filter applied the list is 171.
- **Hiding a control must never drop its value.** Each hidden one is replaced by
  a hidden input carrying the same name, so an installment choice made on
  `fee_due` survives a trip through `prevyear` and is still there coming back.

`some` on `balance` and `every` on `fee_due` is deliberate: on `fee_due` nothing
has been received, so "1 and 2" means both; on `balance` a family who cleared
installment 1 and still owes 2 is exactly who the notice is for.

The screen says the rule out loud under the filter grid — "Who is on this
list: …" — because a list of exclusion counts only answers "why is this family
missing" if you already know what the notice is looking for.

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

## Campaigns and runs

**A campaign saves the RULE, never the audience.** It is a name plus a settings
set — notice, language, filters, date, late fee. Loading one hands you the send
screen with those applied; the families are worked out from the ledger at that
moment. That is why "automatically drop the ones who have paid" needed nothing
built: they are simply not in the next run.

Every press of Send opens a row in `whatsapp_campaign_runs` and stamps `run_id`
on each send as it is claimed — before the provider call, so a crash halfway
still leaves a record of what was attempted. An ad-hoc send is a run too; it just
has no campaign attached.

`v_whatsapp_run_outcomes` then answers "did it work": messaged, asked for, and
how many of those families paid between the send and the date the message named.
It applies the same two exclusions the dashboard does — `payment_mode <> 'discount'`
and no fully reversed receipts.

**It says "paid after this reminder", never "because of it", and the screen says
so too.** Payments here are spiky: 17 August posted 107 families in one day
against 2-9 on a normal day, which is counter cash entered in a batch. No join
can tell that apart from a response. A real causal answer needs a random
holdout, which means deliberately not chasing some families for money — worth
offering one day, not worth pretending to have now.

Three things in the schema that are load-bearing:

- **`run_id` is not in the unique index.**
  `(student_id, session_label, sent_on, campaign_name)` is what stops a family
  being sent the same notice twice in one day. Adding `run_id` would let a second
  run that same day message every one of them again.
- **`campaign_id` is `on delete set null`.** A run is evidence that parents were
  messaged; deleting the campaign must not erase it. The UI archives rather than
  deletes for the same reason.
- **The 142 sends that predate runs keep `run_id = null`** and show as such,
  rather than being backfilled into a run nobody pressed.

## Mobile

The screen has a real phone layout; there is no `MobileDesktopOnlyNotice`.

**This changed on 22 Aug 2026.** While the screen lived under
`/protected/admin-tools` it was a takeover: `MobileBottomNav` rendered nothing, so
the sticky send bar cleared only the safe area. As a top-level tab the bar is
really there, so the send bar clears it —
`bottom-[var(--mobile-bottom-nav-offset,0px)] md:bottom-0` — and the card list
clears both. `/protected/reminders/` (with the trailing slash) IS in
`mobileTakeoverRoutes`, which makes the sub-pages takeovers while the index stays
a tab screen, exactly as `/protected/students/` does.

The old rule, kept because it explains the shape of the tests:

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

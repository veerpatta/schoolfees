# Continue: WhatsApp fee reminders

You are picking up a feature that is already live in production. Read this whole
file before touching anything.

Repo: `D:\OneDrive - Veer Patta Public School\Documents\New project\veerpatta-fees-app`
Branch `main`, currently at `2a9050d` ("feat(whatsapp): a screen for sending fee
reminders, one press at a time"). Working tree was clean at handoff.

---

## What already exists and works

`/protected/admin-tools/whatsapp-reminders` — an Admin Tools screen that lists
families with pending fees, lets an admin tick the ones they mean, and sends
them a Meta-approved WhatsApp template through AiSensy's Campaign API. It is
deployed, and as of 20 Aug 2026 it renders 150 eligible families correctly.

Files that make it up:

| Path | What it is |
|---|---|
| `app/protected/admin-tools/whatsapp-reminders/page.tsx` | Server page: resolves the session, builds the audience, renders warnings |
| `app/protected/admin-tools/whatsapp-reminders/actions.ts` | `sendRemindersAction`, `sendTestReminderAction` |
| `app/protected/admin-tools/whatsapp-reminders/loading.tsx` | Route skeleton |
| `components/whatsapp-reminders/reminders-workspace.tsx` | The whole client UI — filters, table, selection, send, preview, test box |
| `lib/whatsapp/aisensy.ts` | Campaign API client + `toWhatsappDestination` |
| `lib/whatsapp/fee-reminders.ts` | Audience query, filters, param builder. `server-only` — a client component may only `import type` from it |
| `supabase/migrations/20260820140000_whatsapp_reminder_sends.sql` | The send log |
| `lib/helpers/currency.ts` | Gained `formatRupeesPlain()` — grouped digits, no ₹ glyph |
| `lib/config/navigation.ts` | Admin Tools tile + breadcrumb entry |

Design decisions already made, which you should preserve unless asked:

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

---

## Credentials and configuration

AiSensy Campaign API (Basic plan — the Campaign API is included; the richer
"Project API" with delivery webhooks is Pro-only and is NOT available):

```
Endpoint  POST https://backend.aisensy.com/campaign/t1/api/v2
Campaign  Fees Collection August
API key   <REDACTED — this repo is public. Pull the real value from Vercel: `npx vercel env pull`, or the Cowork chat this doc came from.>
```

Request shape:

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

**Already set in Vercel Production** (project `schoolfees`,
`prj_DFWtf33799S4EBNaPqWeFfoVHXUC`, team `team_dfL3N9HEewBhgmlOp0Y1EOxd`):
`AISENSY_API_KEY` (sensitive), `AISENSY_CAMPAIGN`. `CRON_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY` etc. were already there.

**Not yet in local `.env.local`.** Add these two before running locally:

```
AISENSY_API_KEY=<REDACTED — this repo is public. Pull the real value from Vercel: `npx vercel env pull`, or the Cowork chat this doc came from.>
AISENSY_CAMPAIGN=Fees Collection August
```

Other coordinates: Supabase project `vgqyilgstjvgohrsiwkb` (ap-south-1),
production URL `https://schoolfees-two.vercel.app`, Vercel plan is **Hobby**
(60s function cap, cron limited to once daily with a 1-hour window).

Owner's own WhatsApp number, safe for testing: **7976199548**.

---

## The template — read this before changing anything about the message

The approved body has **exactly four variables**, confirmed empirically by
sending `P1..P4` markers and reading what arrived. Five params are rejected.

```
*फीस सूचना - किश्त 1 एवं 2*
प्रिय {{1}},                                    <- parent name

श्री वीर पत्ता सीनियर सेकेंडरी स्कूल की ओर से सूचित किया जाता है कि
{{2}} ({{3}}) की सत्र 2026-27 की किश्त 1 एवं किश्त 2 की फीस अभी बकाया है।
                                                <- student name, class
देय राशि: रु. {{4}}                              <- amount, plain grouped
अंतिम तिथि: 25 अगस्त 2026                        digits, no ₹ glyph

कृपया 25 अगस्त 2026 तक यह राशि जमा करें। इसके बाद प्रत्येक किश्त पर
रु. 1,000 विलंब शुल्क लागू किया जाएगा।

... UPI link upi://pay?pa=shriveerpattassecsch.68347408@hdfcbank
... office number 9352205884
```

Two hard consequences, both already coded and both easy to break:

1. **The deadline is hardcoded.** There is no date variable. `FEE_REMINDER_TEMPLATE_DEADLINE`
   in `lib/whatsapp/fee-reminders.ts` is `2026-08-25`, and `sendRemindersAction`
   refuses to send after it. Do not weaken that guard. If a replacement template
   is approved with a `{{5}}` date, update the constant, the param order, and the
   preview together.
2. **The wording names installments 1 and 2 in fixed text.** The installment
   filter can be changed on screen, so the page warns when the selection stops
   matching. Keep that warning.

The amount quoted is **installments 1 + 2 of the current session only** — not the
ledger's `overdue_base_amount`, which also folds in last year's carry-forward.
For admission 2241 those read ₹14,750 and ₹34,750 respectively. The office has
only ever quoted the smaller figure. Do not "fix" this.

---

## Task 1 — a proper test section, like AiSensy's

Today there is a single test input at the bottom of the workspace that reuses the
top row's values. Replace it with a real test panel:

- Its own **name** and **number** fields, so a test message can be addressed to
  anyone (e.g. "Ramesh ji" on the owner's own phone).
- Fields for the other three variables too — student name, class, amount — each
  pre-filled from the top row of the current list but editable.
- A **live preview** that re-renders as the fields change, showing exactly what
  will arrive.
- A **Send test** button that posts directly to AiSensy and shows the raw result:
  HTTP status and `submitted_message_id` on success, the provider's own error
  string on failure. Staff should be able to tell a rejected campaign name from a
  bad number without opening the AiSensy dashboard.
- Keep the existing rule: **a test is never written to `whatsapp_reminder_sends`.**
  Logging it would claim that student's day and silently drop them from the real
  send.

Put it in a collapsible `SectionCard` so it does not crowd the list.

## Task 2 — make the screen work on mobile

The page currently renders `MobileDesktopOnlyNotice` and a table that does not
fit a phone. Give it a real mobile layout in the app's existing design language.

The convention in this codebase is **CSS-branched markup inside one component**,
not a separate route: see `components/defaulters/defaulters-workspace.tsx`, which
uses `md:hidden` for the phone layout and `hidden md:block` for the desk. Use
`MobileRecordCard`, `MobileSectionCard`, `MobileNote` and friends from
`components/mobile-app/mobile-kit.tsx` — do not invent new card primitives.

For each family on a phone, one `MobileRecordCard` with the student as title, the
class and parent as subtitle, the amount as `amount`, a "sent today" `status`
when applicable, and the checkbox as an action. Filters should collapse behind a
sheet or a details disclosure rather than sitting in a five-column grid. The
selection count and Send button want to be a sticky bottom bar, the way the
payment desk handles its primary action.

Remove `MobileDesktopOnlyNotice` from this page once the mobile layout lands.

---

## Repo rules you must not trip over

These are enforced by scripts, not by taste. Run them before you commit.

- **Migrations are append-only.** Never edit or rename an applied migration —
  write a new one that corrects it. Apply with `npx supabase db push --linked --yes`,
  and add a one-line entry to `supabase/migrations/README.md` under the right group.
- **No money formatting outside the helpers.** `node scripts/audit-money-formatting.mjs`
  fails on `Intl.NumberFormat("en-IN")`, `toLocaleString("en-IN")`, or a `₹` glyph
  inside a string literal anywhere under `app/` or `components/`. Use `formatInr()`,
  `<Money />`, or `formatRupeesPlain()` for the bare-digits case.
- **i18n parity.** `tests/scan/checks/i18n.mjs` requires every key referenced in
  code to exist in `messages/en.json`, `messages/hi.json` and `messages/hi-en.json`.
  This screen is currently **English-only with hardcoded strings** — that passes,
  because it references no keys. If you translate it, do all three catalogues at once.
- **Never write to session `2026-27` data.** That is live school money. Schema
  changes via migrations are fine; row edits are not. `TEST-2026-27` exists for
  experiments.
- `lib/whatsapp/fee-reminders.ts` is `server-only`. A client component may only
  `import type` from it — anything runtime it needs must be duplicated or moved to
  a shared module.

Verify with:

```
npm run typecheck
npx eslint app/protected/admin-tools/whatsapp-reminders components/whatsapp-reminders lib/whatsapp
node scripts/audit-money-formatting.mjs
npm run build
```

All four pass at `2a9050d`. Keep them passing.

---

## Safety while you work

Every send costs money and reaches a real parent with a child's name and fee
balance on it.

- Test only against **7976199548**. Never send to a row off the live list to
  "check it works".
- The screen is already deployed. A push to `main` deploys to production
  immediately — there is no staging environment.
- If you need to see the send path end to end without messaging anyone, a wrong
  `campaignName` returns a clean `400` from AiSensy and bills nothing.

# whatsapp

Fee reminders and the message templates behind them.

| | |
|---|---|
| Route | /protected/reminders (+ campaigns, runs) · /protected/admin-tools/whatsapp-templates |
| Files | 19 domain · 10 data · 15 ui |

## Owns

- Template storage and rendering, in English and Hindi
- **Who a message goes to** (`domain/audience.ts`), which is a different question
  from **what it says** (`domain/campaigns.ts`)
- Reminder cadence — which families to remind, and how often
- The AiSensy send path
- The fee calendar's read of who is due a reminder today (`domain/installment-calendar.ts`)
- Grouping the audience into families, one message per phone (`domain/family-grouping.ts`)
- Turning the same audience into paper a teacher can carry (`domain/collection-list.ts`)

## Invariants

- **The template does not decide the audience.** Until 2026-09-08 `situation`
  did both jobs: it picked the campaign AND gated the list through
  `qualifies[situation]`, so "Fee due" meant 92 families, "Overdue final" meant
  299, and "send the overdue wording to those 92" was not expressible. The two
  are now separate — `domain/audience.ts` decides who is on the list, the
  situation decides only what is written and which campaign is billed. Do not
  reintroduce a per-situation branch in `loadReminderAudience`; that is the
  shape this replaced.
- **The audience is the installment tiles.** Inst 1 · 2 · 3 · 4 · Last year,
  in `ui/audience-builder.tsx` on `domain/audience.ts`. Whether a tile is due
  or overdue is the CALENDAR's fact (`describeInstallmentTile`), so the tile
  says it and nothing asks for it as a filter. Two or more tiles bring up
  "owing on all of them" (the default — 187 on 1+2 the day it shipped) or "any
  of them" (345). Until 2026-09-10 the card carried nine audience chips, each
  borrowing a TEMPLATE's old audience as a preset, and twelve controls, most of
  them yes/no/either facts nobody could explain without knowing the rule they
  were extracted from; the owner's words were "very confusing". Everything
  that is left sits under "Narrow down": class, paid so far, a late fee on the
  ledger, a minimum, the promise hold-back, RTE. The two cards are numbered
  **1 What it says** and **2 Who gets it** because they used to be one.
- **Per-tile counts are counted after the hold-backs**, under the same
  narrowing controls and class as the list, so with one tile selected and
  nobody hand-picked that tile's number IS the list. `holdBackFor` was
  extracted from the loop for exactly this: a count the hold-backs then shrink
  is a count the office stops trusting.
- **A template is never dimmed for not fitting the audience.** Pointing a
  message at families who cannot fill its slots is the freedom this feature
  exists to give; a greyed chip reads as "unavailable". The ⚠ count says what is
  missing without discouraging it. Only an UNAPPROVED template is held back,
  because Meta really will refuse that one.
- **Every notice states what a parent will read, in one sentence.** The same
  late-fee control means three different things depending on the template —
  typed on nine, taken from the ledger per family on the waiver pair and
  `late_fee_applied`, printed not at all where there is no date slot — and
  nothing on screen used to say which you were looking at. The office must not
  have to work that out from which controls happen to be visible.
- **Every filter applies on every template.** `SITUATION_FILTERS` used to HIDE
  the installment, paid-so-far and minimum controls on a notice whose rule
  ignored them. That was honest while the notice gated the audience and a cage
  the moment it stopped. The table is gone; the audience builder shows them all.
- **There are no presets.** An absent `installments` opens on the calendar's
  passed set (`defaultInstallmentsFor`); every other key opens on
  `DEFAULT_AUDIENCE_FILTERS`. The template supplies nothing about the list.
  Keys from before 2026-09-10 — `maxTotalPaid`, `minTotalPaid`, `overdue`,
  `carryForward`, `quote` — are not in `REMINDER_QUERY_KEYS`, so nothing reads
  them and they vanish on the first navigation; `promise=open|none` falls back
  to `skip_open`. A tile href carries the hand-picked students; the office is
  refining a list, not rebuilding one.
- **The amount is DERIVED from the tiles, never chosen.** `quotedAmountFor` —
  fees still pending on the selected installments, or the carry-forward
  remainder on Last year. The ledger late fee the three account-balance
  notices print is scoped to the same tiles (`lateFeeOnSelected`), so
  "Installment 2 only" for a family late on 1 and 2 quotes installment 2's late
  fee beside installment 2's fees — `loadAppliedLateFees` keeps the figures per
  row for this. Fees only, never fees plus the late fee. It was a six-way
  "quote basis" beside the filters, and before that a `switch` on the
  template; both let the amount and the audience describe different rows.
- **A template pointed at families who cannot fill its slots WARNS, never
  refuses.** `NOTICE_FACTS` says what each message needs from the family reading
  it; `missingFactsFor` counts what is absent, the chips and the rows show it,
  and `notice_fact_gap` is an overridable send guard. The office asked for the
  freedom; the app never lets it happen silently.
- **`upcoming_final`'s three-day window is a guard, not a filter.** It is a fact
  about the RUN, not about a family, so it lives in `evaluateSendGuards` as
  `final_window_closed` where an admin can send early on purpose and the reason
  lands on the run. As an audience gate it emptied the list with no way to say so.
- **A student named by hand joins the list whatever the filters and their
  cadence say** — naming them is the more recent decision. It never gets past
  the three things that mean a family is uncontactable: off the roll having
  never paid, flagged no-call, or no usable number. Include and exclude ride the
  query string, so the send action rebuilds the identical list and the
  collection lists print it.
- **A saved campaign stores no hand-picked students.** It is a standing rule a
  nightly cron replays, and an included student bypasses the cadence, so
  persisting one would message that family every night. `savedAudienceFrom`
  reads every key concretely and has no legacy branch — production held zero
  rows when the tiles shipped on 2026-09-10 — and `savedAudienceParams` emits
  every key, `installments=last_year` included, or a Last-year campaign would
  replay on the calendar's default and chase this year's installments under
  last year's wording.
- **One list of query keys** (`REMINDER_QUERY_KEYS`) and one serialiser
  (`reminderQuery`). There were five hand-written copies — three forms, the
  picker's `hrefWith`, the collection-list links — and a key added to four of the
  five is a key that resets the moment somebody presses Apply.
- **Every form on the send screen renders `CarriedFilterFields`** and declares
  only the keys it owns. The send action rebuilds the audience from what the
  form posts, so a key missing there messages a different set of families than
  the office ticked.
- **`installments` carries the tiles, and the token `last_year` IS the
  Last-year tile.** One key, so Last year and the installments are exclusive by
  construction — no URL can carry both. Absent, blank or garbage
  (`0,9,banana`) opens on the calendar's default: zero tiles is not a state,
  because the quoted amount is derived from them and an empty set would quote
  ₹0. `parseInstallmentsValue` is the one reader, for the URL, the posted form
  and a saved campaign alike. The readers still join a repeated key with a
  comma rather than taking the first — `readerFor` and `filtersFromForm` both.

- **One audience resolution, three callers.** `data/reminder-context.ts` is the only place the drain, the policy read and the filter parse happen. The send screen, the collection lists and the lists export all go through it, because two copies of this feature's parsing have already disagreed in production.
- **The collection lists are per STUDENT.** Family grouping is for messages; a class teacher collects from children, and siblings sit in different classes.
- **The send screen gains no client JavaScript.** `/protected/reminders` has ~800 gzip bytes of headroom; every download, share and copy control lives on `/protected/reminders/lists`.
- Cadence decides who is due a reminder. It exists so staff stop unticking the same families by hand every day.
- **The calendar decides the installments, not a constant.** `defaultInstallmentsFor(calendar)` — every installment past its due date, else the next, else 1 — is resolved once, in `parseReminderFilters`, so the filter, the quoted amount and the slot {{4}} phrase cannot disagree. Slot {{4}} names the selected tiles on EVERY notice (the previous session on Last year); the per-notice `contextInstallments` and `TEMPLATE_INSTALLMENTS` are gone.
- **A late fee is read, never derived.** `late_fee_applied` quotes `v_workbook_installment_balances.late_fee_pending`. The view is the only thing that knows about waivers and the accrual rule at once — recomputing it in TypeScript is the trap `waive_late_fee` fell into from the other side.
- **Fees and the late fee reach the message in separate slots.** `pending_amount` is fees, `late_fee_pending` is the late fee, and only `total_pending` adds them. A message folding the first two together would be the first place "a late fee is not a fee" broke.
- **One phone, one message.** The audience is derived per student because the ledger and the send log are keyed that way, but `sendFamily` groups by destination. Siblings get `covered_by_sibling` rows carrying the messaged sibling's `provider_message_id`, so the unique index, the cadence gap and the run outcomes all still work per student. Since 2026-09-04 a phone with siblings gets the family template on fee_due, balance and upcoming (`domain/family-notice.ts` decides; `late_fee_applied` stays per-child until its date and total slots have a source), and every row carries the name of the message that went — so "already messaged today" reads BOTH names a notice can log under. `app_settings.whatsapp_one_message_per_family = 'false'` switches the grouping off (one message per child, as before 2026-09-05); both the Send button and the cron read it through `data/reminder-settings.ts`.
- **Language belongs to the family.** The run's language is a default; `student_collection_flags.whatsapp_language` overrides it, and the send row records what actually went out.
- **`approved` is explicit on every descriptor.** `campaignFor` refuses an unapproved campaign, and the picker shows the chip disabled rather than hiding it. All eighteen `_v3` campaigns have been approved and Live since 2026-09-04; the ten `_v4` (waiver window, waiver last call, overdue final, promise due, exam clearance) went Live on 2026-09-08, the day they were submitted. Approval is changed in code and deployed, never from a screen or a settings row.
- **The late fee has TWO MODES, on every notice, and the office picks.**
  `LateFeeSource` in `domain/late-fee.ts`. `ledger` quotes the real number —
  each family's own `late_fee_pending` where the ledger has charged one, the
  school's policy rate where it has not yet, because a forward-looking notice is
  warning about a fee that has not accrued and quoting their own ₹0 would say
  the opposite. `custom` quotes one typed amount to everybody. Which mode you
  got used to be decided by the TEMPLATE, so neither half was reachable from the
  other: the waiver notices could not be made firmer and the fee-due notices
  could not quote the real rate without somebody typing it. An absent
  `lateFeeSource` still means "whatever this template did before", so every
  pre-2026-09-10 link and saved campaign lands on what it always did.
- **Custom mode on the three account-balance notices is warned about in its own
  words.** `late_fee_applied` and the waiver pair say "the late fee on your
  account is ₹X". Everywhere else a typed figure is a lever; there it is a claim
  about the ledger, and the counter will ask for something different.
  `describeLateFeeDrift` takes `statesAccountBalance` for exactly that, and it
  still warns rather than blocks — it is the owner's school and the owner's call.
- **The ledger-quoted notices never take a late fee from the screen.** `late_fee_applied` and the two waiver notices quote `late_fee_pending` per family (`LEDGER_QUOTED_SITUATIONS`); the control is replaced by hidden inputs. `promise_due` prints each family's own promised date (`RUN_DATE_FREE_SITUATIONS`), so the run's date is neither shown nor guarded on it.

## Never

- Put a `situation` branch back into `loadReminderAudience`. It is the shape
  the audience/template split removed, and it is how the two grow back together.
- Import `domain/campaign-bodies` or `domain/campaign-bodies-v3` from `ui/` or from a client file under `src/app`. They hold every template body — per-student, family and receipt — and only the server renders one: the page's preview is a server-rendered prop and the test panel asks `previewNoticeAction`. Every byte of them in the client bundle is unreachable text against a ceiling that only ratchets down. `tests/ui/whatsapp-reminders-screen.test.ts` enforces it.
- Send to a family that has asked not to be called. Respect the no-call flag.
- Insert into `student_collection_flags` without passing `no_call: false` explicitly. Its default is TRUE, so a row written to record a cadence or a language would silently drop the family out of the call queue.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.

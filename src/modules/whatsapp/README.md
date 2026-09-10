# whatsapp

Fee reminders and the message templates behind them.

| | |
|---|---|
| Route | /protected/reminders (+ campaigns, runs) · /protected/admin-tools/whatsapp-templates |
| Files | 20 domain · 10 data · 15 ui |

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
- **The audience chips are named for the AUDIENCE, never for a notice.**
  `AUDIENCE_SHORTCUTS` in `domain/audience.ts`. For one day they carried the
  twelve NOTICE names and sat directly under twelve template chips carrying the
  same twelve names, so "Fee due" appeared twice on one screen meaning two
  different things and nothing said which row changed the message and which
  changed the list. Naming them for who they describe also deduplicates them —
  the waiver pair and `late_fee_applied` are one audience, `upcoming` and
  `upcoming_final` are another. There are **five** of them since 2026-09-10,
  down from nine: two of the nine ("Promised, due now", "Promise broken") could
  not match a single family because the live session holds no promises at all,
  and "Everyone who owes" was the 479-family audience a reminder must never
  mean. Each dropped audience is still one Fine-tune control away, and the chip
  row and that disclosure share ONE state — Custom ⇔ open — so a list somebody
  narrowed by hand never hides the controls that narrowed it. The two cards are
  numbered **1 What it says** and **2 Who gets it** for the same reason.
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
  the moment it stopped. The table is gone; the audience builder shows them all
  — five on top, the other nine under **Fine-tune**, none of them removed. A
  collapsed `<details>` still submits its inputs, which is what lets the panel
  fold without a second form or a byte of client state.
- **A reminder is about money that is OVERDUE, and overdue is `due_date < today`.**
  `presetFor`'s base carries `overdue: "yes"` and `quote: "overdue"`. An
  installment filter has no notion of time — "1 and 2 are pending" is as true
  the day they are set as the day they are late — which is why it was the wrong
  lever. Measured live: 479 families owed ₹85,59,066 while 345 were overdue for
  ₹27,85,517. Use `calendar.overdue` (`daysUntilDue < 0`), **never**
  `calendar.passed` (`<= 0`, which counts the row due TODAY and exists for
  `active` and `isFinalNoticeWindow`). The ledger, Defaulters, the dashboard and
  the late-fee rule all draw the line where `calendar.overdue` does, and the
  flat ₹1,000 starts the day AFTER the due date. `MONEY_GLOSSARY.overdue` is the
  canonical wording. The boundary is written twice — here and in
  `loadAppliedLateFees` — so edit both.
- **Three presets must keep `overdue: "any"`, and each breaks silently without
  it.** `prevyear` goes EMPTY: a carry-forward balance is an `installments` row
  with `installment_no = 99`, outside the 1-4 range `pendingFor` reads, so it
  can never make a family overdue. `promise_due`/`promise_lapsed` would drop a
  family who promised about a row not yet due. `exam_clearance` would defeat
  itself. None of the three fails loudly — the audience just comes back smaller.
- **The two chip rows wrap in OPPOSITE directions, and it is measured, not
  taste.** At 390px this card has 298px of inner width. The five AUDIENCE chips
  wrap at every width, because the office retunes them on every run and five
  counts are only comparable when all five are on screen. The twelve TEMPLATE
  chips stay on one snapping row with an edge fade and a "swipe for all 12"
  line, because wrapping them measured six rows and 304px — 35% of the card —
  and pushed "Who gets it" from 890px to 1156px on an 844px screen. Both were
  scrolling with `no-scrollbar` and no affordance until 2026-09-10, which hid
  1265px and 453px of them respectively. Chips are `h-11 md:h-9`: the panel's
  rule is 44px on a phone and chips were the one exception.
- **One sentence describes the list.** `describeAudience` replaced two
  hand-rolled summaries of the same filters, in two files, either of which could
  drift from the other. Do not add a second.
- **The notices keep their audiences as PRESETS** (`presetFor`), and an absent
  query parameter falls back to the selected notice's preset. That is what makes
  every link, bookmark and saved campaign written before the split still name
  the same families. A preset button DROPS the audience keys; switching template
  keeps them. Getting that backwards rebuilds the list under the office's hands.
- **The amount is a chosen basis, not a consequence of the template.**
  `filters.quote` decides which figure the message quotes; it was a
  `switch (filters.situation)`, which is precisely why the two could not be
  separated. `ledger_fees` still quotes FEES only — never fees plus the late fee.
- **A fact is only "missing" if a SLOT would actually come out empty.**
  `NOTICE_FACTS` listed `next_due` and `overdue` for one day and should not
  have: `upcoming` renders through `feeDueParams` so there is no next-installment
  slot, and `overdue_final`'s context line falls back to the run's installments
  rather than rendering blank. Together they reported 89 of 89 families broken on
  a list where nothing was. `missingFactsFor` also takes the LATE-FEE MODE —
  in `custom` the message prints the typed amount and never reads the ledger, so
  a family with no charged fee is not a problem that message has. A warning that
  always fires is one nobody reads.
- **Two different failures hide behind that warning, and the message must tell
  them apart.** A missing late fee or amount renders **₹0** — odd, but
  delivered. A missing promised date or carry-forward session renders an **empty
  template parameter**, and WhatsApp REFUSES those: the message does not go out
  looking strange, it does not go out. `NOTICE_FACT_CONSEQUENCE` carries the
  effect and the fix per fact, and the guard emits one finding per fact rather
  than one sentence listing every fact the app knows about.
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
  persisting one would message that family every night. `savedAudienceFrom` also
  reads a pre-split row the way its own engine did — `maxTotalPaid` was a
  ceiling on `fee_due`, a floor on `balance` and inert on the other ten — or a
  scheduled run that has gone out untouched for weeks would quietly narrow.
- **One list of query keys** (`REMINDER_QUERY_KEYS`) and one serialiser
  (`reminderQuery`). There were five hand-written copies — three forms, the
  picker's `hrefWith`, the collection-list links — and a key added to four of the
  five is a key that resets the moment somebody presses Apply.
- **Every form on the send screen renders `CarriedFilterFields`** and declares
  only the keys it owns. The send action rebuilds the audience from what the
  form posts, so a key missing there messages a different set of families than
  the office ticked.
- **`installments=` (present, empty) means "no installment constraint";
  an absent key means "take the preset".** The four checkboxes share one name,
  so the readers join a repeated key with a comma rather than taking the first —
  `readerFor` and `filtersFromForm` both, or ticking 1 and 2 reads as 1 alone.
  Garbage (`0,9,banana`) falls back rather than widening to everybody.

- **One audience resolution, three callers.** `data/reminder-context.ts` is the only place the drain, the policy read and the filter parse happen. The send screen, the collection lists and the lists export all go through it, because two copies of this feature's parsing have already disagreed in production.
- **The collection lists are per STUDENT.** Family grouping is for messages; a class teacher collects from children, and siblings sit in different classes.
- **The send screen gains no client JavaScript.** `/protected/reminders` has ~800 gzip bytes of headroom; every download, share and copy control lives on `/protected/reminders/lists`.
- Cadence decides who is due a reminder. It exists so staff stop unticking the same families by hand every day.
- **The calendar decides the installments, not a constant.** `TEMPLATE_INSTALLMENTS` is the last-resort fallback for a session with no readable schedule; the default comes from `buildInstallmentCalendar` and is resolved once, in `parseReminderFilters`, so the filter and the slot {{4}} phrase cannot disagree.
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

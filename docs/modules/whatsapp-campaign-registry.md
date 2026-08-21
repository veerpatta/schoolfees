# WhatsApp campaign registry

Six Meta-approved templates and six Live AiSensy API campaigns, created
21 Aug 2026, covering three fee situations in Hindi and English. They replaced
the single hardcoded `Fees Collection August` campaign on 21 Aug 2026.

**This document is ground truth for the slot orders and the bodies.**
`src/modules/whatsapp/domain/campaigns.ts` is the code copy, and
`tests/unit/whatsapp-campaigns.test.ts` reads this file to assert the six names
still agree. When a template changes in Meta, change it here first.

## Why these exist

The campaign the screen sends today, `Fees Collection August`, has two faults
that no code change can fix:

- **The deadline is fixed text.** Its body reads `अंतिम तिथि: 25 अगस्त 2026`
  with no date variable, which is why `FEE_REMINDER_TEMPLATE_DEADLINE` existed
  and why the screen refused to send from the 26th. Every template below takes
  the date as a variable instead, so none of them expires.
- **It only says one thing.** A family who has paid something and a family
  carrying a previous-session balance both get a message about installments
  1 and 2 being unpaid, which is wrong for both.

The account also holds ~20 older fee templates from earlier experiments. Ignore
them. The `vpps_app_` prefix marks the set the app is allowed to use.

## The six campaigns

Campaign name equals template name in every case, so one string drives both.

| Campaign | Language | Situation | Slots |
|---|---|---|---|
| `vpps_app_fee_due_hi` | Hindi | Nothing received for installments 1–2 | 6 |
| `vpps_app_fee_due_en` | English | same | 6 |
| `vpps_app_balance_hi` | Hindi | Part paid, balance outstanding | 6 |
| `vpps_app_balance_en` | English | same | 6 |
| `vpps_app_prevyear_hi` | Hindi | Carry-forward from the previous session | 5 |
| `vpps_app_prevyear_en` | English | same | 5 |

All six are category **UTILITY** and were still UTILITY after Meta's review —
worth re-checking before each billing cycle, because Meta re-categorises
silently. `vpps_waiver_offer_hinglish` was submitted as UTILITY on 10 June and
flipped to MARKETING fourteen minutes later, taking its cost from ₹0.145 to
₹1.09 per message. The trigger was promotional wording ("Good news",
"is mauke ka labh zaroor uthayein"). None of the six below sells anything.

## Slot order

### `vpps_app_fee_due_*` — 6 slots

| Slot | Contents | Sample |
|---|---|---|
| `{{1}}` | Parent name | `Ramesh Lal Gurjar` |
| `{{2}}` | Student name | `Aaradhya Gurjar` |
| `{{3}}` | Class label, **`Class ` prefix stripped** | `2` |
| `{{4}}` | Installment phrase | `Installment 1 and 2` |
| `{{5}}` | Amount due, grouped digits, no `₹` | `18,250` |
| `{{6}}` | Last date, `DD-MM-YYYY` | `25-08-2026` |

### `vpps_app_balance_*` — 6 slots

| Slot | Contents | Sample |
|---|---|---|
| `{{1}}` | Parent name | `Ramesh Lal Gurjar` |
| `{{2}}` | Student name | `Aaradhya Gurjar` |
| `{{3}}` | Class label, prefix stripped | `2` |
| `{{4}}` | Received so far | `6,500` |
| `{{5}}` | Balance due | `11,750` |
| `{{6}}` | Next date, `DD-MM-YYYY` | `20-10-2026` |

### `vpps_app_prevyear_*` — 5 slots

| Slot | Contents | Sample |
|---|---|---|
| `{{1}}` | Parent name | `Pintu Singh Chundawat` |
| `{{2}}` | Student name | `Bhavydeep Singh Chundawat` |
| `{{3}}` | Class label, prefix stripped | `Nursery` |
| `{{4}}` | Session label | `2025-26` |
| `{{5}}` | Balance | `20,000` |

Sending the wrong number of params is rejected with
`Template params does not match the campaign` — the same error that established
the four-slot count of the old campaign.

## Class labels

The templates print `कक्षा: {{3}}` / `Class: {{3}}`. App class labels are
`"Class 2"`, so passing them through yields "Class: Class 2". Strip a leading
`Class ` before filling the slot. `11 Science` and `Nursery` pass through
unchanged and must not be rewritten.

## Amounts

`{{5}}` on the due template is installment 1 pending + installment 2 pending —
**not** `overdue_base_amount`, which folds in previous-session carry-forward.
On admission 2241 the two differ by ₹20,000 (₹14,750 vs ₹34,750). The
carry-forward is what `vpps_app_prevyear_*` is for, and saying it twice would
overstate what the family owes this year.

Format with `formatRupeesPlain` — grouped digits, no symbol. The template
supplies `रु.` / `Rs.` itself.

## Bodies as approved

Reproduced so a body change is visible in a diff. WhatsApp sends what Meta
approved, not this text.

### `vpps_app_fee_due_en`

```
*Fee Notice — Shri Veer Patta Sr. Sec. School*

Dear {{1}},

Student: {{2}}
Class: {{3}}
Installment: {{4}}
Amount due: Rs. {{5}}
Last date: {{6}}

The above fees have not yet been received. You may pay at the school fee counter, or directly using this UPI link:
upi://pay?pa=shriveerpattassecsch.68347408@hdfcbank

Please write the student's name with the payment and collect a receipt from the office. If you have already paid, kindly ignore this message.

For any query, call the office on 9352205884.
```

### `vpps_app_fee_due_hi`

```
*फीस सूचना — श्री वीर पत्ता सी. सै. स्कूल*

प्रिय {{1}},

विद्यार्थी: {{2}}
कक्षा: {{3}}
किश्त: {{4}}
देय राशि: रु. {{5}}
अंतिम तिथि: {{6}}

उपरोक्त फीस अभी जमा नहीं हुई है। आप विद्यालय के फीस काउंटर पर जमा कर सकते हैं, अथवा इस UPI लिंक से सीधे भुगतान कर सकते हैं:
upi://pay?pa=shriveerpattassecsch.68347408@hdfcbank

भुगतान करते समय विद्यार्थी का नाम अवश्य लिखें तथा कार्यालय से रसीद प्राप्त करें। यदि आपने भुगतान कर दिया है तो इस संदेश को अनदेखा करें।

जानकारी हेतु कार्यालय 9352205884 पर संपर्क करें।
```

### `vpps_app_balance_en`

```
*Fee Balance — Shri Veer Patta Sr. Sec. School*

Dear {{1}},

Student: {{2}}
Class: {{3}}
Received so far: Rs. {{4}}
Balance due: Rs. {{5}}
Next date: {{6}}

Thank you for the payment received. The balance may be paid at the fee counter or using this UPI link:
upi://pay?pa=shriveerpattassecsch.68347408@hdfcbank

If this differs from your own record, please call the office on 9352205884.
```

### `vpps_app_balance_hi`

```
*फीस शेष विवरण — श्री वीर पत्ता सी. सै. स्कूल*

प्रिय {{1}},

विद्यार्थी: {{2}}
कक्षा: {{3}}
अब तक प्राप्त: रु. {{4}}
शेष बकाया: रु. {{5}}
अगली तिथि: {{6}}

प्राप्त भुगतान के लिए धन्यवाद। शेष राशि फीस काउंटर पर अथवा इस UPI लिंक से जमा की जा सकती है:
upi://pay?pa=shriveerpattassecsch.68347408@hdfcbank

यदि यह विवरण आपके रिकॉर्ड से भिन्न है तो कृपया कार्यालय 9352205884 पर संपर्क करें।
```

### `vpps_app_prevyear_en`

```
*Previous Session Balance — Shri Veer Patta Sr. Sec. School*

Dear {{1}},

Student: {{2}}
Class: {{3}}
Session: {{4}}
Balance: Rs. {{5}}

This amount is from the previous session and is separate from this year's installments. No late fee is charged on it.

To settle it, visit the fee counter or use this UPI link:
upi://pay?pa=shriveerpattassecsch.68347408@hdfcbank

For a full statement, call the office on 9352205884.
```

### `vpps_app_prevyear_hi`

```
*पिछले सत्र का शेष — श्री वीर पत्ता सी. सै. स्कूल*

प्रिय {{1}},

विद्यार्थी: {{2}}
कक्षा: {{3}}
सत्र: {{4}}
शेष राशि: रु. {{5}}

यह राशि पिछले सत्र की है और इस वर्ष की किश्तों से अलग है। इस पर कोई विलंब शुल्क नहीं लगता।

निपटान हेतु फीस काउंटर पर आएं अथवा इस UPI लिंक का उपयोग करें:
upi://pay?pa=shriveerpattassecsch.68347408@hdfcbank

पूरा विवरण देखने हेतु कार्यालय 9352205884 पर संपर्क करें।
```

## Authoring notes, for whoever adds the seventh

- **The AiSensy body editor auto-pairs braces.** Typing `({{3}})` produces
  `{{{3}}}`, and unmatched brackets are an automatic Meta rejection. Every
  template above is written as a labelled block — `विद्यार्थी: {{2}}` on its own
  line — with no bracket adjacent to a brace. Keep that shape.
- Variables are numbered by order of appearance, and the count must match the
  campaign exactly.
- Meta rejects bodies that near-duplicate an existing approved one, which is why
  the three situations are worded differently rather than parameterised.
- Template Type is TEXT with the header left empty; the title is the first line
  of the body, bolded with asterisks. Interactive Actions: None.

## What shipped, 21 Aug 2026

- `src/modules/whatsapp/domain/campaigns.ts` maps situation × language onto
  campaign name, slot order, param builder and preview body.
  `configuredCampaignName()` and `AISENSY_CAMPAIGN` are **gone**, not demoted to
  a fallback: one env var cannot name six campaigns, and a fallback would turn a
  registry miss into a silently wrong template arriving at a parent.
- A notice picker and a language picker on the reminders screen, both driven by
  the query string so the audience stays linkable and the action re-derives it
  from the same values.
- Audience rules per situation, sized against the live session on 21 Aug:
  fee due 146 families, balance 258, previous session 51. Two planned templates
  were cut for having no audience at all (EMI: 0 students; left-owing: 2).
- `whatsapp_reminder_sends` keyed per campaign per day
  (`20260821170000`), because 47 of the 51 carry-forward families also owe this
  year and the old index let the current-year notice claim their day.

All six were confirmed against the live campaigns by posting one param short to
each and reading back `400 Template params does not match the campaign` — which
sends nothing and bills nothing.

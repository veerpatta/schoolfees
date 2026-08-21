# Hindi & Hinglish Dictionary — Translation Status

Snapshot of how much of each namespace in `src/messages/hi.json` and
`src/messages/hi-en.json` has a real translation vs. silently falling back to the
English source string.

Strings without a Hindi/Hinglish translation are **no longer prefixed with
`[HI]`** — the fallback now shows the English source, which is far less
confusing for non-technical staff than seeing a placeholder marker. To finish
the dictionary, add entries to the `T` map in
[`scripts/translate-placeholders.mjs`](../../scripts/translate-placeholders.mjs)
keyed by the dotted path (e.g. `AdminTools.title`) and re-run the script.

The script also re-translates leaves whose current value still matches the
English source, so the `T` map is grow-only — you cannot accidentally clobber
real translations by re-running.

## Coverage (per namespace)

| Namespace      | Translated | Total | %    | Priority |
|----------------|------------|-------|------|----------|
| Activity       |     11     |    11 | 100% | done |
| AdminTools     |     13     |   191 |   7% | high |
| Common         |     43     |    43 | 100% | done |
| Dashboard      |    157     |   159 |  99% | low |
| Defaulters     |    380     |   393 |  97% | low |
| Exports        |     29     |    31 |  94% | low |
| FeeSetup       |    259     |   259 | 100% | done |
| Locale         |      4     |     6 |  67% | low |
| MobileApp      |    219     |   220 | 100% | done |
| Navigation     |     19     |    19 | 100% | done |
| Payments       |     79     |    83 |  95% | low |
| Receipts       |    162     |   163 |  99% | low |
| Roles          |      5     |     5 | 100% | done |
| Segments       |     33     |    34 |  97% | low |
| Students       |    105     |   107 |  98% | low |
| Toasts         |     20     |    20 | 100% | done |
| Transactions   |    124     |   126 |  98% | low |

**Total: 1,662 / 1,870 strings (89%)** across 17 namespaces. Verified 2026-08-12 by
comparing every leaf key in `src/messages/hi.json` against `src/messages/en.json`; a key whose
Hindi value is identical to the English source counts as untranslated.

All three dictionaries carry the same 1,870 keys — `hi-en.json` included. **They move
together:** a key present in one and missing from another takes the route down, which is
why the student-page rebuild deliberately added no new keys.

Of the 208 strings still showing English, **178 are in `AdminTools`** — the least
parent-facing surface in the app, and the reason it is the only namespace still marked
high priority.

An interpolated message must be called with its params: `t("lateFeeSeparate")` without
`{amount}` threw a next-intl `FORMATTING_ERROR` on every dashboard render.
`tests/ui/dashboard-intl-placeholders.test.ts` guards that.

## Tone guidelines

- Target reader: Class-10-educated office staff.
- Avoid literal translation of developer jargon. Prefer the word a staff
  member would actually say at the counter ("बकाया फीस" not "अनुवर्ती राशि",
  "रसीद कटी" not "रसीद पोस्ट हुई").
- Numbers and dates stay in English/`en-IN` everywhere — `Intl.NumberFormat`
  and `Intl.DateTimeFormat` calls are not localised.
- Hindi mode uses Devanagari script. Hinglish uses Roman script with everyday
  Hindi words mixed in (e.g. `Bachhe ke baaki dekho`, not `View student dues`).
- Keep ICU placeholders intact (`{count, plural, ...}`, `{amount}`, `{when}`).

## Verification

After each batch:

- `npx vitest run tests/unit/locale-config.test.ts` — confirms key parity.
- `grep -c '"\[HI\]' src/messages/hi.json` — must stay 0.
- Open `/protected/dashboard` with `vpps_locale=hi` cookie and visually scan
  the labels.

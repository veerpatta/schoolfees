# Hindi & Hinglish Dictionary — Translation Status

Snapshot of how much of each namespace in `messages/hi.json` and
`messages/hi-en.json` has a real translation vs. silently falling back to the
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
| Activity       |   9        |   9   | 100% | done |
| Common         |  43        |  43   | 100% | done |
| Dashboard      | 102        | 103   |  99% | done |
| Defaulters     | 251        | 260   |  97% | done |
| Exports        |  21        |  23   |  91% | done |
| FeeSetup       | 235        | 235   | 100% | done |
| Navigation     |  16        |  16   | 100% | done |
| Payments       |  69        |  73   |  95% | done |
| Receipts       | 132        | 133   |  99% | done |
| Roles          |   5        |   5   | 100% | done |
| Students       |  92        |  94   |  98% | done |
| Transactions   | 108        | 110   |  98% | done |
| Locale         |   4        |   6   |  67% | low |
| AdminTools     |   2        | 180   |   1% | low — admin-only |

**Total: 1,089 / 1,290 strings (84%)** translated to plain everyday Hindi /
Hinglish. The remaining 201 strings fall back to English source text — almost
all of them in `AdminTools`, which is admin-only and rarely touched by
non-technical staff.

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
- `grep -c '"\[HI\]' messages/hi.json` — must stay 0.
- Open `/protected/dashboard` with `vpps_locale=hi` cookie and visually scan
  the labels.

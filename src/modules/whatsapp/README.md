# whatsapp

Fee reminders and the message templates behind them.

| | |
|---|---|
| Route | /protected/admin-tools/whatsapp-templates · .../whatsapp-reminders |
| Files | 6 domain · 2 data · 6 ui |

## Owns

- Template storage and rendering, in English and Hindi
- Reminder cadence — which families to remind, and how often
- The AiSensy send path

## Invariants

- Cadence decides who is due a reminder. It exists so staff stop unticking the same families by hand every day.

## Never

- Send to a family that has asked not to be called. Respect the no-call flag.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.

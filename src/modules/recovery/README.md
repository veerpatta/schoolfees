# recovery

Students who have left and still owe. The non-active complement to defaulters.

| | |
|---|---|
| Route | /protected/admin-tools/recovery |
| Files | 1 domain · 1 data |

## Owns

- The left-student recovery queue and write-offs

## Invariants

- These students are excluded from headcount and included in money, because a student who left owing money still owes it (`20260808210000`).

## Never

- Fold this list into the defaulter count. They are different populations answering different questions.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.

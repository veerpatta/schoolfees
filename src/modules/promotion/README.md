# promotion

Year-end rollover: copy the policy, promote the students, carry the credit.

| | |
|---|---|
| Route | /protected/admin-tools/promotion |
| Files | 1 data |

## Owns

- Copying classes, fee policy and discount policies into the next session
- Promoting students and carrying credit balances

## Invariants

- A session with any payment in it, or older than 30 days, cannot be deleted. Rollover is additive.

## Never

- Move a payment or receipt between sessions. Money stays in the year it was taken.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.

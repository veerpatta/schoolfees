# prev-year-dues

Carry-forward: what a family still owed when the year turned over.

| | |
|---|---|
| Route | /protected/admin-tools/prev-year-dues |
| Files | 6 domain · 1 data |

## Owns

- Matching last year's outstanding rows to this year's students
- The carry-forward installment row itself

## Invariants

- A carry-forward row carries a late-fee rate of **0**, deliberately. Last year's debt does not start accruing this year's penalty.

## Never

- Match on name alone. The dry run exists so a person approves the matches first.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.

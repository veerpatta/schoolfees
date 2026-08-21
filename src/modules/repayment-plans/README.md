# repayment-plans

EMI plans: a schedule a family agreed to, kept on file.

| | |
|---|---|
| Route | Student detail → repayment plan card |
| Files | 3 domain · 1 data |

## Owns

- Plan creation, the schedule, and rescheduling

## Invariants

- **A plan is never edited in place.** Rescheduling writes a replacement and supersedes the old one, so the schedule a parent was shown stays on file.
- The repayment-plan functions want `pending_amount`, not `total_pending`. They used to subtract the late fee by hand; doing that now subtracts it twice.

## Never

- Change an active plan's rows. Supersede it.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.

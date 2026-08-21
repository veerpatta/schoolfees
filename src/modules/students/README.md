# students

The student master. With Fee Setup, one of the two sources of truth.

| | |
|---|---|
| Route | /protected/students |
| Files | 19 domain · 5 data · 60 ui |

## Owns

- Student records, contacts, photos, siblings and family groups
- Student-level fee exceptions and bulk update
- The 24 filter segments

## Invariants

- **Students + Fee Setup are canonical.** Dues, dashboards, defaulters, exports and the desk all derive from them with no manual sync step.
- **Headcount and money count different students, on purpose.** Headcount is `record_status = 'active'`. Money is `active OR total_paid > 0`. Letting one rule drift onto the other's question hid ₹17,250 of live collectable dues.
- Siblings are confirmed-only. Phone-match detection was dropped in August 2026.
- `enrollment.status` says whether a child is enrolled. `feeTier` (New / Old) only picks which academic fee applies — it is not an enrollment status.

## Never

- Match students by name alone in a bulk operation.
- Let a student edit rewrite posted money.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.

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
- **Leaving is a dated act.** Marking a student left writes `students.left_on`, and the fee
  engine cancels only the installments due strictly after it — so fees stop from the day they
  left and what accrued before it stays owed. A row already carrying money is never cancelled
  (the settlement pool ignores cancelled rows, so the money would vanish from `total_paid`);
  those are reported back so the remainder can be written off deliberately. Reversible.
- **A write-off is not a discount.** The sheet in `ui/close-due-as-discount-sheet.tsx` posts a
  `payment_mode = 'discount'` receipt and says "written off" everywhere a person can read it.
  It is reachable for a leaver on purpose — it used to be gated on `status === "active"`,
  which hid it from exactly the students who need it.
- **The reminder sends through the existing pipeline, never a second one.**
  `ui/send-reminder-sheet.tsx` posts to `sendRemindersAction`, the same action the bulk send
  screen uses, so the guards, the family grouping, the no-call flag, the claim-before-send and
  the run log all apply. The action arrives as a prop because `src/modules` may not import
  `src/app`.
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

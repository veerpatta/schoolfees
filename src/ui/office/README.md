# Office Components

**The split this file used to describe as upcoming has happened.** Transactions,
Defaulters and Receipts have their own folders now; Exports renders from
`app/protected/exports/page.tsx` and never needed one.

What remains here is shared office chrome — `office-ui.tsx` and `auto-submit-form.tsx`.

Paired domain libs: `lib/office`, `lib/reports`, `lib/ledger`, `lib/defaulters`.
(There is no `lib/exports`; earlier versions of this file named one.)

Keep these surfaces read-only unless the owning workflow explicitly allows a
safe action such as export/download.

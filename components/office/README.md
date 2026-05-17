# Office Components

Routes served: `/protected/transactions`, `/protected/defaulters`, and
`/protected/exports`.

Paired domain libs include `lib/office`, `lib/reports`, `lib/ledger`,
`lib/defaulters`, and `lib/exports` where present.

This folder currently holds Transactions, Defaulters, and Exports UI. Tier 2
will split those into more precise module folders.

Keep these surfaces read-only unless the owning workflow explicitly allows a
safe action such as export/download.

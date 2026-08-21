# `src/modules` — one folder per feature

Each module owns its rules, its queries and its screens together. Open one
folder and the whole feature is in front of you; its README says what it owns,
what must hold, and what must never happen.

| Module | What it is | Route |
|---|---|---|
| [`activity`](activity/README.md) | The audit feed: who did what, when, and to which record. | /protected/admin-tools/activity |
| [`dashboard`](dashboard/README.md) | Five read-only boards over one money band. Analytics, never a write. | `/protected/dashboard?view=overview\|collection\|recovery\|classes\|latefee` |
| [`defaulters`](defaulters/README.md) | The daily follow-up list, and the contact log behind it. | /protected/defaulters |
| [`fees`](fees/README.md) | The fee engine and the policy that drives it. The most load-bearing module in the repo. | /protected/fee-setup · /protected/fee-structure |
| [`finance-controls`](finance-controls/README.md) | Day close, refunds, and the correction review queue. | /protected/finance-controls |
| [`imports`](imports/README.md) | The staged student import: upload, map, dry run, review, commit only what is valid. | /protected/imports |
| [`master-data`](master-data/README.md) | The school's own lists: sessions, classes, routes. | /protected/master-data |
| [`payments`](payments/README.md) | The Payment Desk. The only place in this application that posts money. | /protected/payments · /protected/payments/bulk |
| [`prev-year-dues`](prev-year-dues/README.md) | Carry-forward: what a family still owed when the year turned over. | /protected/admin-tools/prev-year-dues |
| [`promotion`](promotion/README.md) | Year-end rollover: copy the policy, promote the students, carry the credit. | /protected/admin-tools/promotion |
| [`receipts`](receipts/README.md) | Receipt lookup, reprint, share, and the reversal that money corrections run through. | /protected/receipts · /r/[code] |
| [`recovery`](recovery/README.md) | Students who have left and still owe. The non-active complement to defaulters. | /protected/admin-tools/recovery |
| [`repayment-plans`](repayment-plans/README.md) | EMI plans: a schedule a family agreed to, kept on file. | Student detail → repayment plan card |
| [`reports`](reports/README.md) | Read-only reporting and the per-student ledger. | /protected/reports · /protected/ledger |
| [`staff`](staff/README.md) | Staff accounts, roles, and password change. | /protected/staff · /protected/password |
| [`students`](students/README.md) | The student master. With Fee Setup, one of the two sources of truth. | /protected/students |
| [`system-sync`](system-sync/README.md) | Cache invalidation and financial revalidation. Small, and every money path depends on it. | — |
| [`transactions`](transactions/README.md) | The read-only financial record centre. | /protected/transactions |
| [`whatsapp`](whatsapp/README.md) | Fee reminders and the message templates behind them. | /protected/admin-tools/whatsapp-templates · .../whatsapp-reminders |

## The shape

```
src/modules/<name>/
  domain/   pure rules — no Supabase client, no fetch, unit-testable alone
  data/     the reads and writes
  ui/       this feature's components
```

## Why there is no index.ts

The obvious design — one public `index.ts` per module, everything else private
— cannot work here. Every substantial module mixes `server-only` data files
with `"use client"` components (students: 10 and 35). A barrel re-exporting
both means a client component importing the module pulls `server-only` code
into the browser bundle, which is a build error, not a style problem. And with
no `sideEffects: false` in package.json, webpack must assume every re-export
matters, so a barrel would drag whole modules into routes that use one function
— against ceilings that only ratchet down.

So the public surface is per **layer**, not per module: a module's `domain/`
and `data/` are its API, its `ui/` is private. That is a rule a file cannot
enforce, so `scripts/check-architecture.mjs` does, and CI runs it.

## What is not a module

- `src/platform/` — infrastructure that knows nothing about fees
- `src/ui/` — the design system, which may never import a module
- `src/app/` — routes, which compose modules and may reach anything

A route that only assembles other modules' screens does not need a module of
its own. `/protected/exports`, `/protected/settings` and the redirect aliases
are all thin pages for exactly that reason.

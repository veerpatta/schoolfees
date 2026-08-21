# `src/components` — a holding area, not a home

**This folder is mid-migration and is meant to empty.** Each module folder here
moves into `src/modules/<name>/ui/` alongside the domain and data code it
renders, so a feature stops being three folders in three trees.

Nothing new should be added here. A new feature's components start in its module.

## What is still waiting

`dashboard` · `payments` · `students` · `transactions` · `defaulters` ·
`receipts` · `reports` · `imports` · `fees` · `ledger` · `master-data` ·
`finance-controls` · `staff` · `whatsapp-reminders` · `whatsapp-templates`

## What has already left

Everything that was never module-specific is now `src/ui/`: the primitives
(was `components/ui`), the workspace shell (was `components/admin`), the phone
primitives (was `components/mobile-app`), plus `forms`, `data-table`, `shared`,
`command`, `auth`, `branding`, `trust`, `system`, `office` and the telemetry
reporters. See `src/ui/README.md` for the rule that keeps them reusable.

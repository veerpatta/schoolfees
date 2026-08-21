# `src/lib` — a holding area, not a home

**This folder is mid-migration and is meant to empty.** Every domain in here
becomes `src/modules/<name>/` — with its own `README.md`, a public `index.ts`,
and its code split into `domain/` (pure rules), `data/` (server-only reads and
writes) and `ui/`. Its paired components are in `src/components/` today and
move at the same time.

Nothing new should be added here. A new domain starts as a module.

## What is still waiting

Money and the fee engine: `fees` · `workbook` · `payments` · `receipts` ·
`finance` · `finance-controls` · `ledger` · `prev-year-dues` · `repayment-plans`

Roll and follow-up: `students` · `segments` · `defaulters` · `recovery` ·
`promotion` · `import` · `master-data` · `transport`

Workspace: `dashboard` · `reports` · `transactions` · `activity` · `setup` ·
`staff-management` · `whatsapp` · `whatsapp-templates` · `system-sync` · `office`

## What has already left

The platform layer (`supabase`, `auth`, `config`, `db`, `session`, `helpers`,
`money`, `pdf`, `excel`, `i18n`, `env.ts`, …) is now `src/platform/`. The design
system (`design`, `command`, `data-table`, `system`) is now `src/ui/`. Both have
READMEs stating what may import what.

## What has not changed

The rules that make this app correct are unaffected by where the files sit:

- **Students + Fee Setup are canonical.** Dues, dashboards, defaulters, exports
  and the Payment Desk all derive from them with no manual sync step.
- **A late fee is not a fee.** `pending_amount` never contains one, and a family
  whose only debt is a late fee is not a defaulter. The rule is written twice, in
  `v_workbook_installment_balances` and `private.workbook_installment_snapshot`,
  and the two are edited together or not at all.
- **Money records are append-only.** Corrections are reverse-and-repost through
  `payment_adjustments`, never an edit.

# OPERATIONS_GUIDE.md

> **Day close is automatic.** A nightly cron (`/api/cron/auto-day-close`) closes the day;
> the Finance Controls close view is read-only. Manual approval and cash/bank
> reconciliation were removed. A second cron takes a nightly backup. Both authenticate on
> `CRON_SECRET`.
>
> Other daily surfaces added since this guide was written: the **defaulter recovery desk**
> (contact log, heat ranking, call queue, voice notes), **refunds and 10-minute undo**,
> **EMI plan setup**, **previous-year dues carry-forward**, and **promotion runs** for
> year-end rollover.
>
> Exports are now ten types, not four — see `docs/modules/exports.md`.

## Daily Office Workflow

1. Open **Dashboard** for daily situation.
2. Maintain student records in **Students**.
3. Maintain policy/defaults in **Fee Setup**.
4. Collect fees from **Payment Desk**.
5. Verify history in **Transactions**.
6. Do follow-up from **Defaulters**.
7. Download files from **Exports**.
8. Use **Admin Tools** only for rare setup/troubleshooting work.

## Add Student

- add basic student info
- SR may be blank (pending SR generated)
- class/route/session should be set correctly
- dues preparation should run after save

## Bulk Add / Bulk Update

- use template from import/export flow
- run dry-run validation
- approve valid rows only
- keep batch trail for audit

## Fee Setup Publish

- update year defaults (dates, late fee, tuition, transport, academic fee)
- preview impact first
- publish after review
- protected rows (paid/partial/adjusted) require manual review handling

## Collect Payment

- class first -> student select
- verify due rows
- choose amount and mode
- reference optional
- confirm and post
- open/print receipt

## Print Receipt

- use receipt print action
- verify A4 fit, branding, and signature area

## Follow Defaulters

- rank and filter by due/overdue/class/route
- use daily phone-ready list for follow-up actions

## Export Reports

Use Exports for office-ready XLSX outputs:

- students
- dues/defaulters
- receipt register
- conventional discount students

## Withdraw/Delete Rules

- do not delete posted payment or receipt history
- use explicit correction records where needed
- keep actions auditable

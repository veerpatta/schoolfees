# Shri Veer Patta Senior Secondary School Fee Management App

Internal fee-management web app for one school:
**Shri Veer Patta Senior Secondary School (VPPS / Veer Patta School)**.

## 1) What this app is

This is an **internal office/accounts/admin** system for daily fee work:

- student master maintenance
- fee setup by academic year
- automated dues/installment projections
- quick payment collection and receipt printing
- defaulters follow-up
- exports for office reporting

It is built to gradually replace workbook/Excel operations with safer, faster,
audit-ready workflows.

## 2) What this app is not

- not a parent portal
- not a public self-service fee app
- not a multi-school SaaS platform

## 3) Core product philosophy

### Source of truth

**Students + Fee Setup are the operational source of truth.**

Everything else (Dashboard, pending dues, Payment Desk, Defaulters, Exports,
Transactions) should update from those two areas without staff doing manual
syncs.

### Accounting safety

- posted **payments and receipts are permanent records**
- do not directly edit/delete posted payments or receipts
- corrections should be explicit via adjustments/refunds/credits/withdraw style
  entries
- fee setup changes after payment must not rewrite paid history; they should
  surface pending impact or credit/refund impact instead

## 4) Main navigation (current)

Top-level daily areas:

- `Dashboard`
- `Students`
- `Fee Setup`
- `Payment Desk`
- `Transactions`
- `Defaulters`
- `Exports`
- `Admin Tools`

Role landing defaults:

- `admin` -> `Dashboard`
- `accountant` -> `Payment Desk`
- `read_only_staff` -> `Dashboard`

## 5) Current feature summary

### Dashboard

Analytics-first overview with collection and follow-up signals:

- expected / collected / pending / collection percentage
- active student count
- refund/credit due snapshot (where available)
- receipts today/month
- class-wise pending analysis
- top defaulters, recent payments, and attention cards

### Students

- student master list, add, edit, detail
- automatic pending SR generation when SR is blank
- session-aware class filtering
- automatic dues preparation after add/edit/import
- route changes refresh dues scope
- new vs existing academic fee behavior
- student-specific fee exceptions/overrides
- conventional discount assignment support
- bulk add and bulk update import workflow
- return-to-filter behavior from detail/edit pages

### Fee Setup

- academic year setup
- class-wise annual tuition
- route-wise annual transport fees
- installment due dates
- flat late fee
- new/existing academic fee
- Preview Changes + Publish Fee Setup workflow
- applies safe updates to unpaid/future rows
- paid/partial/adjusted rows are protected and surfaced for review

### Conventional discount policies (implemented)

- `RTE`: tuition becomes `₹0`
- `Staff Child`: tuition becomes `50%`
- `3rd Child Policy`: tuition becomes `₹6000`

Rules documented and enforced by current model:

- applies to tuition only
- other fee heads remain unchanged unless explicitly configured later
- max **2 active conventional policies** per student per academic year
- if multiple policies apply, compute candidate tuition values and use the
  lowest
- assignments are academic-year scoped and auditable
- family/sibling grouping exists for 3rd-child support
- policy assignment after payment can create pending or credit/refund impact

### Payment Desk

Cashier-speed payment flow:

- class-first filtering
- student selection with SR support
- selected-student dues view
- quick amount options + manual amount
- payment confirmation and receipt success
- print/open receipt and “Collect Another Payment” flow
- idempotency + locking safeguards on posting
- reference number is optional for all modes (soft reminder where relevant)
- missing-dues fallback preparation + diagnostics
- pending vs credit/refund impact visibility from student financial state

### Transactions

Read-only record center:

- receipts
- student dues
- class register
- installment/dues tracking
- compact filters and context-preserving back-links

### Defaulters

Daily follow-up workspace:

- ranking by pending amount and overdue behavior
- current working scoring direction: `pending_amount + days_overdue * 100`
- phone-ready list with class/route/search filters
- auto-updates based on current date context

### Exports

Top-level XLSX download center:

- students exports
- fees/dues exports
- payments exports
- conventional discount student export
- office-friendly file labels and headers

### Receipts / print

- school branding-aware receipt page
- A4 print layout support
- transaction return links where applicable

### Admin Tools

Rare setup/troubleshooting/configuration area:

- first-time setup
- school lists/master data
- staff and permissions
- day close/corrections and finance controls
- system checks and import history

## 6) Active AY 2026-27 values (current live policy intent)

- active session: `2026-27`
- late fee: `₹1000` (flat)
- due dates:
  - `20-04-2026`
  - `20-07-2026`
  - `20-10-2026`
  - `20-01-2027`
- new student academic fee: `₹1100`
- existing/old student academic fee: `₹500`
- Class 12 Science annual tuition default: `₹38000`
- receipt prefix: `SVP`
- books excluded from workbook-mode calculation unless explicitly changed

## 7) Important safety/accounting rules

- never rewrite posted payment/receipt history
- keep append-only chronology for receipts, payments, payment adjustments,
  audit logs
- use explicit correction records, not silent edits
- keep technical complexity hidden from day-to-day office screens where possible

## 8) Quick local setup

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## 9) Environment variables

Required runtime env:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `NEXT_PUBLIC_SCHOOL_NAME`
- `NEXT_PUBLIC_APP_MODE`
- `OPENAI_MODEL` (optional, defaults to `gpt-5.5` in `lib/config/openai.ts`)

Bootstrap script env (staff seeding):

- `BOOTSTRAP_MAIN_ADMIN_PASSWORD`
- `BOOTSTRAP_ACCOUNTS_PASSWORD`
- `BOOTSTRAP_STAFF_PASSWORD`

## 10) Supabase migrations

Run schema changes through `supabase/migrations/*`.

Recent notable migrations in this branch history include:

- `20260425090000_payment_date_workbook_preview.sql`
- `20260425100000_workbook_preview_function_grants.sql`
- `20260425120000_student_financial_state_projection.sql`
- `20260425170000_conventional_discount_policies.sql`
- `20260425143000_payment_desk_idempotency_and_locking.sql`
- `20260425072007_fix_post_student_payment_receipt_number_ambiguity.sql`

## 11) Common commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
```

## 12) Testing / UAT rules

- do not reset/overwrite real AY `2026-27` data
- use `TEST-2026-27` (or staging/local) for UAT
- use dummy names/SR values only:
  - `Test Student 001`
  - `Test Student 002`
  - `TEST-SR-001`
  - `TEST-SR-002`
- do not post test payments against real students
- rotate shared admin passwords after UAT
- do not store real passwords in repo/docs/prompts

Detailed guides:

- `UAT_CHECKLIST.md`
- `docs/uat-test-plan.md`
- `docs/test-data-setup.md`
- `docs/before-real-data-checklist.md`

## 13) Current roadmap / pivot

See `ROADMAP.md`.

Short version:

- current pivot: automation-first, office-friendly daily modules, faster Payment
  Desk, stronger analytics, top-level Defaulters + Exports, conventional
  discount support
- next: browser/UAT verification hardening, UI polish, richer exports,
  follow-up notes, print tuning, role-specific hardening

## 14) Known operational notes

Implemented in current branch:

- `/protected` role redirect now resolves by role and avoids self-loop behavior
- academic session parser accepts `2026-27`, `TEST-2026-27`, `UAT-2026-27`,
  `DEMO-2026-27`
- import row upsert requires `batch_id`, avoiding null batch inserts
- dashboard student counting is not limited to workbook row presence
- class activity logic uses `classes.status` instead of legacy `is_active`
- payment preview and posting now align on date-aware workbook snapshot
- payment posting includes idempotency/locking protections
- receipt number ambiguity in `post_student_payment` addressed
- `v_student_financial_state` supports pending vs credit/refund projection
- conventional discount policy tables + assignment model added

Pending browser/UAT verification in some environments:

- print layout tuning per printer/browser combination
- full end-to-end role-by-role smoke checks after every migration batch

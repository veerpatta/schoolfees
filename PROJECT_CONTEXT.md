# PROJECT_CONTEXT.md

## Product Context (Current)

This repo is the internal fee-management system for **one school**:
Shri Veer Patta Senior Secondary School (VPPS / Veer Patta School).

Audience:

- office staff
- accounts team
- school admins

Not targeted:

- parent self-service
- public portal use
- multi-tenant SaaS use cases

## Product Direction: Automation-First Office Workflow

The current pivot is to make the app behave like a safer, faster workbook
replacement.

Operational principle:

- **Students + Fee Setup are the source of truth**
- dues/installments/pending/credit-refund/defaulters/dashboard/exports should
  refresh from those sources
- normal staff should not need manual ledger sync or database terms

## Workspace Structure (Daily)

Primary top-level modules:

1. `Dashboard`
2. `Students`
3. `Fee Setup`
4. `Payment Desk`
5. `Transactions`
6. `Defaulters`
7. `Exports`
8. `Admin Tools`

Role landing defaults:

- `admin` -> `Dashboard`
- `accountant` -> `Payment Desk`
- `read_only_staff` -> `Dashboard`

## Module Responsibilities

### Dashboard

Read-only analytics and attention hub:

- expected/collected/pending/collection %
- active students
- receipts today/month
- class analysis
- top defaulters/recent payments/attention cards

### Students

Student master and student-level fee logic:

- add/edit/detail
- pending SR auto-generation when SR blank
- class/route/session-aware behavior
- student-specific overrides and discount assignments
- bulk add/update import entry points
- dues preparation trigger after student changes/import

### Fee Setup

Canonical policy/default editor by academic year:

- installment dates
- late fee
- new/existing academic fee
- class tuition
- transport annual fees
- preview then publish
- protects paid/partial/adjusted rows during downstream update

### Payment Desk

Only posting surface for collections:

- class-first + student selection
- amount preview and posting
- receipt generation and print links
- duplicate prevention/idempotency and lock-aware posting
- missing-dues diagnostics with fallback prep
- pending vs credit/refund indicators where projected

### Transactions

Read-only financial records:

- receipts
- dues/installments
- class register
- history views
- exports links and context-preserving back paths

### Defaulters

Daily follow-up list:

- rank by pending and overdue pressure
- filter by class/route/days/search

### Exports

Top-level office XLSX center:

- students
- dues
- payments
- conventional discount reports

### Admin Tools

Rare/config-only area:

- first-time setup
- master data
- staff and permissions
- day close/corrections
- settings/system checks
- import history

## Active AY 2026-27 Policy Values

- session: `2026-27`
- late fee: `₹1000` (flat)
- installment due dates:
  - `20-04-2026`
  - `20-07-2026`
  - `20-10-2026`
  - `20-01-2027`
- new student academic fee: `₹1100`
- existing student academic fee: `₹500`
- class 12 science annual tuition default: `₹38000`
- receipt prefix: `SVP`
- books excluded from workbook-mode fee calculation by default

## Conventional Discount Policies (Current)

Current policy set:

- RTE -> tuition = 0
- Staff Child -> tuition = 50%
- 3rd Child Policy -> tuition = 6000

Rules:

- tuition-only impact
- max 2 active conventional policies/student/year
- lowest candidate tuition wins
- manual override remains separate
- year-scoped + auditable assignments
- family grouping support for sibling logic

## Architecture Decisions (Current)

- Next.js App Router + TypeScript + React 19
- Supabase auth + Postgres + RLS
- append-only financial chronology for posted transactions
- policy/default management via explicit preview/apply workflow
- RBAC enforced in app + DB layer

Key implementation assets:

- `lib/config/navigation.ts` (top-level workspace/nav + default landing)
- `lib/config/fee-rules.ts` (session parsing, default schedules, core labels)
- `lib/fees/policy.ts` (canonical active policy source)
- `lib/fees/regeneration.ts` (safe dues recalculation)
- `app/protected/*` (daily module routes)
- `supabase/schema.sql` + `supabase/migrations/*`

## Important Database Objects

Core tables/views/functions in active docs and workflows:

- `fee_policy_configs`
- `fee_settings`
- `students`
- `classes`
- `transport_routes`
- `installments`
- `receipts`
- `payments`
- `payment_adjustments`
- `refund_requests`
- `student_fee_overrides`
- `conventional_discount_policies`
- `student_conventional_discount_assignments`
- `student_family_groups`
- `student_family_members`
- `import_batches`
- `import_rows`
- `v_workbook_student_financials`
- `v_workbook_installment_balances`
- `v_student_financial_state`
- `preview_workbook_payment_allocation`
- `post_student_payment`
- `private.workbook_installment_snapshot`

## Recent Major Technical Changes (Documented)

Implemented in branch history:

- protected root redirect flow hardened to avoid self-loop behavior
- session parser accepts canonical and prefixed test labels
- import row upsert path fixed for required `batch_id`
- dashboard student count logic decoupled from workbook-row-only assumptions
- class active filter shifted to `classes.status`
- payment desk dues prep + diagnostics improved
- `post_student_payment` receipt number ambiguity fixed
- payment preview/posting aligned with payment-date workbook snapshot
- student financial state projection view introduced for pending vs credit/refund
- conventional discount policy system added
- Defaulters + Exports promoted to top-level daily navigation

## Known Pitfalls / Operational Cautions

- do not test on real students/payments inside live AY `2026-27`
- use `TEST-2026-27` or staging/local for UAT
- avoid hidden alternative editing paths outside Students/Fee Setup/Payment Desk
- keep technical wording collapsed on staff-facing pages
- preserve append-only payment/receipt behavior in every change

## Current Verification Status Language

Use these labels in docs/tasks:

- **Implemented in current branch**: confirmed by code/schema/migration presence
- **Pending browser/UAT verification**: implemented but needs environment run-through
- **Planned next**: not shipped yet

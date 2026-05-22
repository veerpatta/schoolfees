# 🗂️ Module Guide

## 📊 Dashboard

Purpose: read-only analytics and attention hub.

Shows:

- expected / collected / pending
- collection percentage
- active students
- receipts today/month
- class analysis
- top defaulters
- recent payments
- attention cards

Implementation:

- `app/protected/dashboard/page.tsx`
- `lib/dashboard/data.ts`
- `lib/dashboard/summary.ts`

## 👥 Students

Purpose: student master and student-level fee logic.

Owns:

- add/edit/detail
- pending SR auto-generation
- class/route/session-aware behavior
- student-specific overrides
- conventional discount assignments
- family/sibling grouping
- bulk add/update entry points
- dues preparation trigger after changes

Implementation:

- `app/protected/students/*`
- `components/students/*`
- `lib/students/*`

## 🧾 Fee Setup

Purpose: canonical policy/default editor by academic year.

Owns:

- installment dates
- late fee
- new/existing academic fee
- class tuition
- transport annual fees
- preview then publish
- protected paid/partial/adjusted row handling

Implementation:

- `app/protected/fee-setup/*`
- `components/fees/*`
- `lib/fees/*`
- `lib/setup/*`

## 💸 Payment Desk

Purpose: only posting surface for collections.

Owns:

- class-first student selection
- amount preview
- payment posting
- receipt generation
- print links
- duplicate prevention
- missing-dues diagnostics
- pending vs credit/refund indicators

Implementation:

- `app/protected/payments/*`
- `components/payments/*`
- `lib/payments/*`

## 📚 Transactions

Purpose: read-only financial record center.

Owns:

- receipts
- dues/installments
- class register
- payment history
- context-preserving links

Implementation:

- `app/protected/transactions/*`
- `lib/transactions/*`
- `lib/ledger/*`
- `lib/reports/*`

## 📞 Defaulters

Purpose: daily follow-up list.

Owns:

- pending/overdue ranking
- class filters
- route filters
- search
- follow-up-ready view

Implementation:

- `app/protected/defaulters/page.tsx`
- `lib/defaulters/*`

## 📤 Exports

Purpose: top-level XLSX center for office operations.

Exports:

- students
- dues
- payments
- defaulters
- conventional discount reports

Implementation:

- `app/protected/exports/*`
- `lib/reports/*`

## 🛠️ Admin Tools

Purpose: rare setup, config, troubleshooting, and corrections.

Contains:

- first-time setup
- master data
- staff and permissions
- day close/corrections
- session health
- import history

Implementation:

- `app/protected/admin-tools/*`
- `lib/system-sync/*`
- `lib/config/*`


# ROADMAP.md

## Current Pivot (Active)

- automation-first office workflow
- students + fee setup as source of truth
- cashier-speed payment desk
- analytics-first dashboard
- defaulters + exports as top-level daily modules
- conventional discount policy support with auditability

## Implemented (Shipped)

Foundational:

- top-level daily nav aligned to office workflow
- payment-date-aware preview/posting alignment
- student financial state projection for pending vs credit/refund
- conventional discount policy data model and limits (RTE, Staff Child, 3rd Child)
- payment desk idempotency/locking guardrails
- receipt-number ambiguity fix in payment posting path

Recent (post go-live):

- bilingual UI: instant Hindi / Hinglish / English language switching (i18n)
- money-clarity pass: single canonical currency formatter, glossary, per-installment
  breakdown, payment allocation snapshot
- dashboard analytics revamp + mobile UX overhaul across hot pages
- richer A4 receipt + WhatsApp fee-PDF share; student mobile overhaul; sibling
  link/delink
- defaulters follow-up: multi-number call learning, behavior segments, no-call flag
- 5-role RBAC matrix rebalanced; financial-risk/UX/workflow audit findings closed

Admin Tools revamp + launch hardening:

- single **Transfer to Next Session** flow (creates next session, copies classes +
  fee policy + discount policies, promotes students, carries credit, rollback)
- ≤30-day, zero-payment **safe session delete** (`delete_academic_session_safe`)
- **fully automatic day close** via nightly cron (no manual approval); cash/bank
  reconciliation retired
- **refunds wired to the ledger** (`process_refund_with_adjustment` posts a
  reversal adjustment, with cumulative over-refund guard)
- consolidated **School Settings** hub; first-time setup wizard removed (redirects)
- Admin Tools hub regrouped into task-named sections (no dead/hidden cards)
- **self-healing materialized-view refresh** backstop (write-time refresh + 2-min
  cron catch-up)
- exports stream **all rows** (no page caps); **AI context bundle** export with
  README + Adjustments/Refunds sheets
- clean lint (0 errors/warnings); 777 tests green

## Live Production (Current)

- App is live with real 2026-27 student and fee data.
- All core workflows operational: Students, Fee Setup, Payment Desk,
  Transactions, Defaulters, Exports.
- Automated dues sync runs on student add/edit, fee setup save, and
  dashboard load.
- Dashboard shows real collection totals, no manual sync required.
- TEST-2026-27 session maintained for ongoing testing.

## Planned Next

0. Monitor production stability and address any live-data edge cases.
1. richer exports and report packaging
2. continued dashboard chart polish and readability improvements
3. role-specific hardening of admin/config screens
4. staging deployment and release checklist refinement

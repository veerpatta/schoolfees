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
- clean lint (0 errors/warnings); **291 test files / 1,777 tests** green

### Since 2026-05 (the last time this list was updated)

- **EMI repayment plans** — interest-free monthly instalments for families clearing an old
  balance, three scopes, plan-aware desk and defaulters, plans superseded rather than edited.
- **Previous-year dues carry-forward** — unpaid prior-session dues carried in as their own
  installment line with a full import audit trail, plus an Admin Tools screen.
- **The late fee became a separate charge** — fees and late fee have their own columns in
  both engines; a late fee no longer makes anyone a defaulter, and 385 installments that
  could never charge one were repaired.
- **Dashboard rebuilt** into five URL-driven boards under a money band, on one analytics
  query cached against the session tag.
- **Segment facets** — 24 filter chips with live counts on Students and Transactions, from
  one queryable view rather than post-hoc filtering.
- **Custom conventional discount policies** beyond the three built-ins, plus a drift-repair
  script that will lower a bill in bulk but never raise one.
- **Refunds, undo and reversal honesty** — refunds post ledger reversals, a 10-minute admin
  undo exists, and a reversed receipt is visible, marked and excluded from every total.
- **Student page and edit form rebuilt** around payment history; nothing collapsed.
- **Recovery desk** — contact log, heat ranking, call queue, plus a read model for students
  who left still owing.
- **Bulk payment entry** and a resumable, chunked student import.
- **Automatic day close** and nightly backup on cron; Finance Controls close view is read-only.
- **Suspected-sibling detection removed** — it guessed families from shared phone numbers,
  got them wrong, and was the slowest read in the app. Confirmed family groups stay.
- **RBAC hardening** — a missing or inactive staff row now yields no role at all, where it
  used to fall back to `view_only`.
- **Performance** — RLS `has_permission()` wrapped in scalar subqueries (per-statement, not
  per-row), materialized financial views with a queued concurrent refresh, route bundle
  ceilings that ratchet down.

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
2. role-specific hardening of admin/config screens
3. staging deployment and release checklist refinement
4. regenerate `supabase/schema.sql` from the live catalog — it is knowingly stale
5. decide the **₹8.5 lakh of automatically waived late fee**: the 08-08 rule change and the
   rate backfill grandfathered it rather than billing families. It is visible and voidable
   on the dashboard's Late fee board; nobody has decided whether to collect it.
6. ~₹4.5 lakh of late fee accrues on **20-10-2026** when Instalment 3 falls due, unless
   paid or waived first. Nothing is pre-waived for it.

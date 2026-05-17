# ROADMAP.md

## Current Pivot (Active)

- automation-first office workflow
- students + fee setup as source of truth
- cashier-speed payment desk
- analytics-first dashboard
- defaulters + exports as top-level daily modules
- conventional discount policy support with auditability

## Implemented in Current Branch

- top-level daily nav aligned to office workflow
- payment-date-aware preview/posting alignment
- student financial state projection for pending vs credit/refund
- conventional discount policy data model and limits
- payment desk idempotency/locking guardrails
- receipt-number ambiguity fix in payment posting path

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
1. dashboard chart polish and readability improvements
2. richer exports and report packaging
3. follow-up/call notes flow for defaulters
4. role-specific hardening of advanced screens
5. staging deployment and release checklist refinement

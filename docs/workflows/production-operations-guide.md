# Production Operations Guide

The app is live with real AY 2026-27 data for Shri Veer Patta Senior Secondary School.

## Live Session

- Session: 2026-27
- Receipt prefix: SVP
- Late fee: ₹1,000 flat
- Installment due dates: 20 Apr, 20 Jul, 20 Oct, 20 Jan
- New student academic fee: ₹1,100
- Existing student academic fee: ₹500

## Test Session (Permanent)

- Session: TEST-2026-27
- Used for all debugging, import testing, and feature verification.
- Test students have TEST- prefix on admission numbers.
- Never use real student names or contact numbers in TEST-2026-27.

## Key Operational Flows

Adding a student -> dues prepare automatically via background sync.
Editing fee setup -> dues sync automatically on save.
Posting a payment -> receipt generated, append-only.
Import (bulk add/update) -> validate dry-run first, commit valid rows only.

## Security

- Admin passwords must not be stored in docs, prompts, or repo files.
- Rotate shared credentials when staff changes.
- Service role key must never appear in browser code.
- Public signup must remain disabled.

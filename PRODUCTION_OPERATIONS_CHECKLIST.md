# PRODUCTION_OPERATIONS_CHECKLIST.md

## Purpose

Standing operations checklist for the SVP school fee management app.
UAT is complete. The app is live with real 2026-27 data.

## Live Session Guard

- 2026-27 is the live session. Real student records and receipts are in it.
- TEST-2026-27 is the permanent test session for debugging and feature testing.
- Admission numbers prefixed with TEST- are test students. They should never
  appear in live operations.

## Daily Operations Reminders

- Dashboard loads current collection totals and outstanding dues automatically.
- Adding or editing a student triggers dues preparation automatically.
- Fee Setup changes sync dues automatically on save.
- Payment Desk is the only surface for posting receipts.
- Transactions and Exports are read-only.

## If Something Looks Wrong

- Check Admin Tools -> Fee Data Troubleshooting for sync health.
- If a student's dues are missing, open the student record and save — auto-prepare fires.
- If a class is missing from Payment Desk, check Fee Setup -> class defaults.
- If the dashboard KPIs look stale, check the "Updated at" timestamp near the header.

## Testing a New Feature or Fix

- Always use TEST-2026-27 session.
- Use students with TEST- prefix admission numbers.
- Never post payments against real students (non-TEST- admission numbers).
- Verify the change in TEST-2026-27 before considering impact on live data.

## Financial Safety (Permanent Rules)

- Posted receipts and payments are append-only — they cannot be edited or deleted.
- Corrections use the explicit adjustment/reversal workflow.
- Fee Setup changes apply to unpaid/future rows only. Paid rows are never rewritten.
- Audit logs are always preserved.

## Export and Backup Reminders

- Download XLSX exports periodically from Exports for office records.
- Supabase automatic backups protect the database.

## Infrastructure Reference

| Item | Value |
|---|---|
| Supabase project | `vgqyilgstjvgohrsiwkb` — ap-south-1 (Mumbai) |
| Project URL | `https://vgqyilgstjvgohrsiwkb.supabase.co` |
| Vercel project | `veerpattas-projects/schoolfees` |
| Production URL | `schoolfees-two.vercel.app` |
| Backend policy | Mumbai-only; no legacy rollback project is kept |

If you ever need to check DB health, migrations, or logs: Supabase dashboard
→ project `vgqyilgstjvgohrsiwkb` → Database / Logs / Advisors.

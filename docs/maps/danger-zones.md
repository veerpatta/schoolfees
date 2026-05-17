# Danger Zones

These files and records must never be touched casually.

- `app/protected/payments/actions.ts` - only payment-posting surface.
- `lib/payments/*` - posting and preview logic for Payment Desk.
- `supabase/migrations/*` - append-only schema history; never rename or reorder.
- `lib/fees/regeneration.ts` - protects paid, partial, and adjusted rows.
- `lib/fees/policy.ts` - canonical fee policy resolver.
- `lib/supabase/admin.ts` - service-role client; never import in `components/` or in any file reachable from the browser bundle.
- `lib/config/fee-rules.ts` - authoritative when docs conflict.
- `academic_sessions` row `2026-27` - live production academic session.

Use `TEST-2026-27` for ongoing verification and debugging. Do not add test
students, test payments, or experimental fee changes to `2026-27`.

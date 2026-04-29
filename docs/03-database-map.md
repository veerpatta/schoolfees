# Database Map (Supabase)

Primary schema: `supabase/schema.sql`.
Migrations: `supabase/migrations/*`.

## Core tables
- `students`: student master records and enrollment/session scoping.
- `classes`: class catalogue used by student and fee setup flows.
- `transport_routes`: transport metadata used in dues/workbook projection.
- `fee_settings`: class-level fee definitions.
- `fee_policy_configs`: academic-year policy defaults and operational settings.
- `installments`: installment schedule/due dates per session/policy.
- `payments`: posted payment ledger entries (append-only behavior preserved).
- `receipts`: receipt records and numbering metadata.
- `payment_adjustments`: post-payment adjustments with audit trail.
- `refund_requests`: refund workflow state and references.
- `student_fee_overrides`: student-level fee exceptions.
- `conventional_discount_policies`: reusable discount policy definitions.
- `student_conventional_discount_assignments`: year-scoped assignment/audit of conventional discounts.
- `import_batches`: import batch headers (including mode/session scope).
- `import_rows`: row-level import data and review status (with `batch_id`).

## Key views
- `v_workbook_student_financials`: workbook-derived per-student financial projection.
- `v_workbook_installment_balances`: workbook-derived installment-level balances.
- `v_student_financial_state`: pending vs credit/refund projection surface.

## Key functions
- `preview_workbook_payment_allocation`: date-aware preview allocation based on workbook snapshot.
- `post_student_payment`: posting RPC with idempotency/locking and receipt linkage.

# Database Map (Supabase)

Authoritative: `supabase/migrations/*`, applied in filename order.

`supabase/schema.sql` is a **readable snapshot, not the source of truth**, and it is
currently stale — it was last regenerated on 2026-08-10 and its own header lists the
objects that have moved since. When the two disagree, the migrations are right.

Counts below verified against the live catalog on **2026-08-12**: 58 tables, 17 views,
3 materialized views, 33 `public` functions, 23 `private` functions.

---

## The money path

`students` → `classes` → `fee_settings` / `fee_policy_configs` → `installments` →
`payments` → `receipts`.

- **`installments`** — one row per student per instalment. `amount_due` is a GENERATED
  column and cannot be assigned. `late_fee_flat_amount` is the per-row late-fee rate,
  stamped at generation; **0 on carry-forward rows on purpose**. `is_carry_forward` and
  `is_emi_late_fee` mark the two synthetic kinds.
- **`payments`, `receipts`** — append-only. Never updated, never deleted.
- **`payment_adjustments`** — every correction: reversals, write-offs, refunds, undo. This
  is the only way money moves after posting.
- **`receipt_adjustments`, `receipt_finance_adjustments`, `payment_adjustment_reviews`,
  `refund_requests`** — the refund and correction-review workflow.

## Fee engine (`workbook_v1`)

Two engines compute the same thing and **must be edited together** — both carry a
`>>> SHARED LATE FEE RULE <<<` marker and, since `20260905090000`, a
`>>> SHARED POOLED SETTLEMENT RULE <<<` block: money settles the installments oldest-first at
read time, `applied_amount` is the receipt pin and `settled_amount` is where the money sits.

| Object | Kind | Role |
|---|---|---|
| `v_workbook_installment_balances` | matview | per-installment position — the read model |
| `private.workbook_installment_snapshot` | function | the same, live, for posting and waivers |
| `v_workbook_student_financials` | matview | per-student rollup |
| `v_student_financial_state` | matview | pending vs credit / refund |

Since `20260812120000` the balance columns are:

- `pending_amount` — **fees only**, never a late fee
- `late_fee_pending` — the late fee still owed
- `total_pending` — the two added; what a cashier can collect
- `balance_status` (`paid` once fees are clear) and `late_fee_status` separately

Refreshing: the matviews are refreshed CONCURRENTLY off the posting transaction with a 2s
`lock_timeout`. When a refresh is skipped it **marks `workbook_materialized_view_refresh_queue`
pending** so the every-2-minutes cron drains it — without that backstop the queue and the
cron were dead code and dashboards drifted silently.

## Late fee

- `student_late_fee_waivers` — one row per waiver, per installment, with a reason and who
  approved it. **Voided, never deleted.** `source` ∈ `manual | payment_desk | migration |
  grandfather | repayment_plan`.
- `v_effective_late_fee_waivers` — the single thing the engines join.
- `v_student_manual_late_fee_waivers` — staff decisions only, excluding automatic ones.
- `late_fee_rule_change_snapshot`, `late_fee_waiver_pool_snapshot` — immutable records of
  the 2026-08-08 rule change, used by `scripts/verify-late-fee-health.mjs`.

## EMI / repayment plans

`student_repayment_plans` · `student_repayment_plan_items` · `student_repayment_schedule` ·
`student_repayment_receipt_links` · `student_repayment_emi_late_fees`

**`v_student_repayment_plan_status` is the one view** Student, Payment Desk, Dashboard,
Defaulters and Exports all read, so a family cannot be "behind" on one screen and "on
track" on another. A plan is never edited in place — rescheduling writes a replacement and
supersedes the old one.

## Previous-year dues

`student_carry_forward_balances` · `prev_year_import_batches` · `prev_year_import_rows` ·
`v_student_carry_forward_balances`

## Roll, segments and follow-up

- `v_student_directory` — one filterable row per student per session; backs the 24 segment
  chips. `v_student_installment_facets` supplies the per-student installment rollups.
- `student_family_groups`, `student_family_members` — **confirmed** families only, one
  family per student per session. Phone-derived sibling guessing was removed in
  `20260811090000`; do not reintroduce it.
- `student_conventional_discount_assignments`, `conventional_discount_policies`,
  `v_student_conventional_discounts` — RTE / Staff Child / 3rd Child and custom policies.
- `defaulter_contacts`, `defaulter_recovery_state`, `student_collection_flags` — the
  recovery desk.
- `student_fee_overrides` — per-student exceptions. RLS here is **narrower than `students`**,
  so a role without `fees:view` gets a NULL join, not a `false`.
- `students` also carries 25 optional information columns (gender, blood group, category,
  religion, caste, nationality, mother tongue, `aadhaar_no`, `jan_aadhaar_no`, `apaar_id`,
  house, roll no, previous school, TC number, board registration no, village/city, tehsil,
  district, state, pincode, guardian name/relation/phone, emergency contact name/phone)
  from `20260813090000`. All nullable text. The column list is mirrored in
  `src/modules/students/domain/info-fields.ts`, which is the only place a field is named — add to both.
  `aadhaar_no` has a partial unique index (`idx_students_aadhaar_no_unique`); `jan_aadhaar_no`
  deliberately does not, because siblings share a Jan Aadhaar. Section lives on `classes`,
  not here, and admission date is the pre-existing `joined_on`.

## Imports, sessions, ops

`import_batches` / `import_rows` · `payment_import_batches` / `payment_import_rows` ·
`academic_sessions` · `app_settings` (`active_session_label` = `2026-27`) ·
`promotion_runs` / `promotion_run_entries` · `session_reconcile_log` ·
`student_session_reanchor_log` · `collection_closures` · `audit_logs` ·
`user_activity_events` · `office_sync_events` · `whatsapp_templates` ·
`student_share_links` · `notion_sync_log` · `setup_progress` ·
`config_change_batches` / `config_change_blocked_installments` ·
`ledger_regeneration_batches` / `ledger_regeneration_rows`

## RPCs worth knowing

| Function | Notes |
|---|---|
| `post_student_payment_with_adjustments` | **The** posting RPC. Idempotent on `client_request_id`, per-student advisory lock, allocates against `total_pending`. |
| `post_student_payment` | Older, narrower. |
| `preview_workbook_payment_allocation` | The desk's read model. |
| `waive_late_fee` / `void_late_fee_waiver` | Caps on `late_fee_pending`; a paid late fee cannot be waived. Voiding bills the installment again. |
| `undo_recent_payment` | 10-minute admin undo; inserts reversals, touches nothing. |
| `reverse_receipt_admin` | Reversal at any age, for a wrong fee entry. `payments:reverse_any` OR service role, mandatory reason, no time window. Reverses the REMAINING headroom per payment row, so a partly-refunded receipt still clears. Tag `admin_reversal:`. |
| `post_corrected_payment` | Reposts a receipt with an EXPLICIT allocation, for the CLI correction harness. **service_role only** — no staff permission, so the Payment Desk stays the only human posting surface. Prices off `private.workbook_installment_snapshot`, never the matview. |
| `process_refund_with_adjustment` | Refunds post a `reversal` adjustment. |
| `get_dashboard_summary`, `get_dashboard_fee_split`, `get_dashboard_analytics` | The three dashboard reads. |
| `get_student_directory_summary`, `get_student_segment_counts` | Students list totals and chip counts. |
| `create_/preview_/reschedule_/cancel_student_repayment_plan` | EMI lifecycle, gated on `fees:repayment_plan`. |
| `sync_repayment_plan_late_fees` | Nightly; the only thing that ADDS a late fee as a row. |
| `delete_academic_session_safe` | ≤30-day zero-payment session delete. |
| `has_permission`, `has_any_permission`, `private.current_staff_role` | RBAC. |

**Two rules about calling these:**

1. **An RPC that gates on `has_permission(...)` must be called with the user-JWT client**
   (`createClient()` from `src/platform/supabase/server.ts`), never the service-role admin client —
   `has_permission` needs `auth.uid()`, which is null under service role.
2. **A SECURITY DEFINER function bypasses RLS, so it needs its own guard.**
   `get_dashboard_summary` and `get_dashboard_fee_split` shipped without one.

## RLS

`private.current_staff_role()` returns **NULL** when there is no active staff row — it used
to fall back to `view_only`, which meant "deactivate this person" silently demoted them
instead of removing them.

**Every policy expression must wrap `has_permission()` in a scalar subquery** — `(select
public.has_permission('x'))` — so Postgres evaluates it once per statement as an InitPlan
rather than once per row. 96 policies were fixed in `20260710060616`; a 560-row students
select went from 168ms of policy evaluation to 2.6ms.

## Reading data from the app

PostgREST **silently caps a plain request at 1,000 rows.** Page every read that can exceed
that — `src/platform/helpers/chunk.ts` provides `fetchAllPages` and `fetchInChunks`. Scope by a
**join**, not by `.in()` on a large id array: 507 UUIDs is ~19 KB of URL and fails at the
transport with `TypeError: fetch failed`, not as a query error.

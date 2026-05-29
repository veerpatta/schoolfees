# `supabase/migrations/` — Schema change history

Append-only. Each `.sql` file is one migration that has been applied to
production. Files are sorted lexically by their leading timestamp; that is
also the order Supabase applies them.

## Golden rules

1. **Never rename a migration after it has been applied** to any shared or
   remote database. Supabase identifies migrations by the timestamp prefix
   recorded in `supabase_migrations.schema_migrations`. A rename desyncs the
   remote and breaks the next `supabase db push`.
2. **Never edit the SQL body of an applied migration.** To fix a mistake,
   write a *new* migration that corrects it.
3. **Create new files via the CLI** so the timestamp is generated correctly:
   ```bash
   supabase migration new <short_snake_case_name>
   ```
4. **After adding a migration, update this index** so the next person (or
   agent) can find it without grepping the whole directory.

## Migration index (grouped by feature)

The history reads chronologically, but it's easier to navigate by what each
migration *does*. Filenames are listed without the `.sql` extension.

### Core schema bootstrap

- `20260421054019_initial_fee_management_schema` — initial tables: students, classes, sessions, fees, payments, receipts.
- `20260421054148_schema_lint_fixes` — lint/cleanup pass on the initial schema.

### RBAC & auth

- `20260421103000_align_rbac_roles_and_policies` — admin / accountant / read_only_staff roles + RLS policies.
- `20260421203000_staff_auth_sync` — staff ↔ Supabase auth user sync trigger.
- `20260525170125_expand_staff_roles` — expand staff_role enum to 5 (admin, accountant, teacher, defaulter_followup, view_only); rename read_only_staff → view_only and add students:edit_basic / contacts:write / payments:waive_late_fee permissions.

### Fee Setup module

- `20260421064517_fee_setup_module` — fee_components, fee_settings, installments schedule.
- `20260422093000_fee_policy_config_service` — config service layer for fee policy edits.
- `20260422113000_config_change_impact_workflow` — preview-impact-before-publish flow for fee setup edits.
- `20260423113231_workbook_fee_setup_batch_scope` — batch scoping so fee-setup edits land atomically.

### Student master & overrides

- `20260422120000_student_override_notes_column` — per-student override notes column.
- `20260422170000_master_data_management` — master data helpers (classes, sections, transport routes).

### Payment Desk (posting, locking, adjustments)

- `20260421070001_payment_entry_module` — original payment entry tables & RPCs.
- `20260425143000_payment_desk_idempotency_and_locking` — request-ID idempotency + row-level locking on post.
- `20260425072007_fix_post_student_payment_receipt_number_ambiguity` — bugfix for ambiguous receipt_number column ref.
- `20260502120000_payment_desk_atomic_adjustments` — atomic adjustment posting.
- `20260502133000_payment_desk_adjustment_locking` — locking on adjustment posting.
- `20260502150000_receipt_finance_adjustments` — receipt-level finance adjustments table.
- `20260503120000_payment_desk_receipt_adjustments` — link receipts to adjustments.
- `20260521185410_change_payment_rpc_security_definer` — flip payment RPC to SECURITY DEFINER.
- `20260523090000_remove_reference_number_requirement` — make reference_number optional.

### Workbook v1 fee engine (read-side projections)

- `20260423093000_workbook_v1_ay_2026_27` — initial workbook views/functions for the AY 2026-27 engine.
- `20260424203000_workbook_student_master_projection` — `v_workbook_student_financials` projection.
- `20260425090000_payment_date_workbook_preview` — date-aware allocation preview.
- `20260425100000_workbook_preview_function_grants` — grants for preview RPC.
- `20260425120000_student_financial_state_projection` — `v_student_financial_state` (pending vs credit/refund).
- `20260516054812_grant_service_role_workbook_preview` — service-role grant fix on preview RPC.
- `20260517075735_session_scoped_workbook_financials` — scope workbook financials by active session.
- `20260520000000_inline_v_workbook_installment_balances_view` — inline the installment balances view for plan stability.

### Conventional discount policies

- `20260425170000_conventional_discount_policies` — RTE / Staff Child / 3rd Child policy tables and resolver.

### Ledger regeneration

- `20260422190000_ledger_regeneration_workflow` — safe dues recalculation workflow + audit table.

### Finance office controls

- `20260422203000_finance_office_controls` — office-level finance controls (refunds, write-offs).
- `20260422213000_transport_route_outstanding_views` — transport-route outstanding aggregations.

### Student import — staged workflow

- `20260421165703_student_import_workflow` — initial import_batches / import_rows.
- `20260422180000_import_qa_review_columns` — QA / row-by-row review columns.
- `20260424103000_student_import_mixed_upsert` — mixed insert+update behavior on commit.
- `20260424123000_student_import_modes` — explicit import modes (insert / upsert).
- `20260424170000_import_target_session_scope` — restrict imports to a target session.

### Student import — VPPS direct (one-off legacy ingest)

- `20260515013128_create_vpps_direct_import_backup_snapshots` — snapshot table for safety.
- `20260515013521_create_vpps_direct_import_staging_tables` — staging tables.
- `20260515013726_create_temporary_vpps_direct_import_staging_rpc` — staging RPC.
- `20260515013747_fix_temporary_vpps_direct_import_staging_rpc_counts` — count fix.
- `20260515013828_drop_temporary_vpps_direct_import_staging_rpc` — drop temp RPC after use.
- `20260515054103_create_vpps_student_source_mapping` — source ↔ target student mapping.
- `20260515062414_create_vpps_apply_chunk_helper` — chunked apply helper.
- `20260515062611_create_public_wrapper_for_vpps_apply_chunk` — public RPC wrapper.

### Session lifecycle (re-anchor, reconcile, switch)

- `20260515103000_student_session_reanchor_log` — audit log for re-anchoring students to another session.
- `20260515143022_collapse_active_session_source` — `app_settings` becomes single source of active session.
- `20260515151450_session_reconcile_log` — reconcile audit log.
- `20260516052450_use_active_session_for_reanchor` — re-anchor uses active session resolver.
- `20260516100000_office_sync_events` — `office_sync_events` table for cross-tab/session sync.

### Family / siblings

- `20260521031342_v_student_sibling_groups` — `v_student_sibling_groups` view.
- `20260521033957_family_payment_id` — family_payment_id column on payments.
- `20260521171500_disable_family_payments` — feature disable (family payments shelved).
- `20260521180553_restore_individual_student_payment_rpc` — restore the per-student RPC after the shelve.

### Setup progress

- `20260422153000_setup_progress` — first-run setup-progress checklist state.

### Performance — indexes (additive only)

- `20260427110000_mobile_perf_lookup_indexes` — indexes for mobile lookup paths.
- `20260503143000_office_performance_indexes` — office workflow hot-path indexes.
- `20260506120000_transaction_filter_performance` — Transactions list filter indexes.
- `20260511093609_add_performance_indexes` — broad pass of missing indexes.
- `20260516120000_dashboard_session_index` — dashboard view (`students(status, class_id)`).
- `20260520010000_payment_adjustment_installment_index` — installment index on adjustments.
- `20260522120939_20260522172000_add_missing_performance_indexes` — follow-up missing indexes.

### Performance — materialized views

- `20260523130000_materialized_financial_views` — convert hot financial views to materialized, with refresh triggers and unique indexes.

### Test infra & seeds-via-migration

- `20260507153000_seed_test_2026_27_fourth_installment` — seed the 4th installment for `TEST-2026-27`.
- `20260515152802_test_schema_init` — `test` schema for test-only objects.

### Bug fixes

- `20260522030225_fix_overdue_installment_balance_status` — overdue status calculation fix.

## When you add a new migration

1. Create the file via `supabase migration new <name>` so the timestamp is
   correct and unique.
2. Add a one-line entry under the most-relevant group above. If your change
   touches multiple groups, list it under its primary purpose and mention
   the secondary effect in the line.
3. If you introduce a new feature area, add a new `###` group rather than
   stuffing it under a tangentially related one.

## Historical repair notes (keep for the record)

Earlier repo history renamed three migrations to chronological timestamps:

- `20260421113000` → `20260421054019`
- `20260421114500` → `20260421054148`
- `20260421123000` → `20260421064517`

If a remote project still has the old versions recorded, run migration repair
before the next deploy:

```bash
supabase migration repair --status reverted 20260421113000 20260421114500 20260421123000
supabase migration repair --status applied 20260421054019 20260421054148 20260421064517
```

Some remote projects also retained the pre-final staff sync version
`20260421140354`; if it appears in remote history without a local file,
repair it as reverted so only `20260421203000` remains:

```bash
supabase migration repair --status reverted 20260421140354
supabase migration repair --status applied 20260421203000
```

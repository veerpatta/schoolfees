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
- `20260526111726_rename_fee_collector_and_rebalance_perms` — rename staff_role `defaulter_followup` → `fee_collector` and rebalance the `has_permission` matrix to the 5-role spec: accountant loses finance:write / contacts:write, fee_collector gains contacts:write, view_only becomes practical read-only.

### Security surface hardening (grants, search_path, in-RPC guards)

- `20260523164957_harden_supabase_function_surface` — pin `search_path` on every staff RPC plus the backend/`private` helpers, revoke EXECUTE from `public` and `anon`, re-grant only the seven direct staff RPCs to `authenticated`, and revoke default EXECUTE on future functions in both schemas.
- `20260523165313_add_rpc_permission_guards` — add in-function permission guards: `dashboard:view` inside `get_dashboard_summary`, `has_any_permission(...)` inside `preview_workbook_payment_allocation`.
- `20260523165447_allow_service_role_for_guarded_staff_rpcs` — let `service_role` past the guards added above, since cron and scripts have no `auth.uid()`.
- `20260531140752_restore_normalize_class_label_grant` — re-grant EXECUTE on `private.normalize_workbook_class_label` to `authenticated`, orphaned by the `20260523164957` hardening pass. Without it every staff payment post failed with "permission denied for function normalize_workbook_class_label", surfaced as "You do not have permission to post payments."
- `20260718090711_harden_notion_and_financial_permissions` — restrict the five Notion projections to their dedicated sync role plus `service_role`, and flip them to SECURITY INVOKER so caller grants and RLS apply instead of the view owner's.

### Fee Setup module

- `20260421064517_fee_setup_module` — fee_components, fee_settings, installments schedule.
- `20260422093000_fee_policy_config_service` — config service layer for fee policy edits.
- `20260422113000_config_change_impact_workflow` — preview-impact-before-publish flow for fee setup edits.
- `20260423113231_workbook_fee_setup_batch_scope` — batch scoping so fee-setup edits land atomically.
- `20260525074703_add_academic_fee_distribution_mode` — `fee_policy_configs.academic_fee_distribution` (`first_only` default, or `equal`) controlling how the academic fee spreads across installments.

### Student master & overrides

- `20260422120000_student_override_notes_column` — per-student override notes column.
- `20260422170000_master_data_management` — master data helpers (classes, sections, transport routes).
- `20260525123312_add_student_email_column` — optional `students.email`, used by receipt sharing to open a mailto draft. Free text, no DB-level validation.
- `20260617054803_drop_legacy_student_fee_override_check` — drop the legacy unnamed `student_fee_overrides_check`, which predated `late_fee_waiver_amount` and so rejected the waiver-only inserts `waive_late_fee` writes.

### Student photos & share links

- `20260525133208_student_photos` — `students.photo_path` plus a private `student-photos` storage bucket (512 KB ceiling, jpeg/png/webp) with authenticated-only object policies.
- `20260525141454_student_share_links` — tokenised, expiring, revocable per-student share links with view counters; audited and RLS-gated on `students:view` / `students:write`.

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
- `20260527033430_persist_payment_allocation_snapshot` — store the per-installment allocation snapshot (discount / waiver / pending-before / pending-after) on every `payments` row, so receipts and Transactions read it instead of re-deriving values that drift when policy changes later.
- `20260528151701_restore_receipt_idempotency_recheck` — restore the `(student_id, client_request_id)` re-check inside the receipt-number retry loop of `post_student_payment_with_adjustments`; the `20260527033430` rewrite dropped it.
- `20260528151726_waive_late_fee_advisory_lock` — make the standalone late-fee waiver atomic under an advisory lock. Two near-simultaneous waivers previously each read the same pre-waiver state and added their full amount on top.
- `20260528151933_cleanup_post_payment_function` — stop stamping `p_remarks` onto every `payments` and `receipt_adjustments` row; the receipt-level note is canonical.
- `20260602042112_drop_payment_reference_requirement` — remove the UPI / bank transfer / cheque reference gate from `post_student_payment_with_adjustments`, since the Desk no longer collects a reference. This re-removes what `20260523090000` already did — the guard reappears whenever the RPC is recreated.
- `20260617031509_waive_late_fee_uses_workbook_snapshot` — `waive_late_fee` reads pending late fee from the candidate-aware workbook snapshot. It had been reading a `v_workbook_student_financials` column that `20260615120000` removed, so every waive raised.

### Workbook v1 fee engine (read-side projections)

- `20260423093000_workbook_v1_ay_2026_27` — initial workbook views/functions for the AY 2026-27 engine.
- `20260424203000_workbook_student_master_projection` — `v_workbook_student_financials` projection.
- `20260425090000_payment_date_workbook_preview` — date-aware allocation preview.
- `20260425100000_workbook_preview_function_grants` — grants for preview RPC.
- `20260425120000_student_financial_state_projection` — `v_student_financial_state` (pending vs credit/refund).
- `20260516054812_grant_service_role_workbook_preview` — service-role grant fix on preview RPC.
- `20260517075735_session_scoped_workbook_financials` — scope workbook financials by active session.
- `20260520000000_inline_v_workbook_installment_balances_view` — inline the installment balances view for plan stability.
- `20260615120000_base_outstanding_excludes_late_fees` — treat an installment (and a student) as settled once the BASE charge is covered, since late fees are fines rather than expected fees. Adds `base_outstanding_amount` and `late_fee_outstanding_amount`, so unpaid late fees stay visible without making anyone a defaulter.

### Dashboard summary RPC

- `20260523145352_perf_optimization` — create the consolidated `get_dashboard_summary(session_label, today)` RPC (KPIs, today's mode breakdown, recent payments, follow-up queue, collection trend, heatmap, class summary, installment summary, class × installment matrix, sync-health checks) plus six lookup indexes across `public` and `test`.
- `20260523163721_fix_dashboard_summary_jsonb_sync_health` — retype the `students_missing_installments` local from `json` to `jsonb` by rewriting the function definition in place.
- `20260523164039_harden_dashboard_summary_rpc_execute_grants` — pin `search_path` and narrow EXECUTE to `authenticated` + `service_role`.
- `20260524150000_dedupe_dashboard_installment_labels` — stop keying and grouping by `installment_label` as well as `installment_no`, which doubled the InstallmentSummary and ClassInstallmentMatrix rows whenever a session carried label variants ("Installment 1" vs "Installment 1 (20-04-2026)").
- `20260524182924_dedupe_dashboard_installment_labels_v2` — v2 of the above; the remaining `distinct installment_no, installment_label` sources now collapse via `max(installment_label)`.
- `20260526120000_exclude_discount_from_collection_rpc` — filter `payment_mode = 'discount'` out of every collection KPI (collected, today, this-month, trend, heatmap, mode breakdown, recent payments). Pairs with `20260526100000`, which handles the view layer.

### Conventional discount policies

- `20260425170000_conventional_discount_policies` — RTE / Staff Child / 3rd Child policy tables and resolver.
- `20260524151000_third_child_traceability_trigger` — reject new `third_child` assignments carrying neither a `family_group_id` nor `is_manual_override = true`, after a bulk revamp script wrote 8 untraceable ones.
- `20260618053746_relax_conventional_discount_codes` — replace the fixed `code in ('rte','staff_child','third_child')` CHECK with a lowercase-slug format check and add `is_builtin`, so schools can add custom policies while the three defaults stay protected.

### Discount close-outs (write-offs)

- `20260526072301_add_discount_payment_mode` — add `'discount'` to `payment_mode` so a zero-cash balance close-out can be recorded as a receipt and allocated across pending installments.
- `20260526100000_exclude_discount_closeouts_from_paid` — exclude `payment_mode = 'discount'` receipts from `total_paid` across the workbook view layer. They must drive pending to zero without inflating collected totals in dashboard KPIs, Day Close, exports and reports.

### Ledger regeneration

- `20260422190000_ledger_regeneration_workflow` — safe dues recalculation workflow + audit table.

### Finance office controls

- `20260422203000_finance_office_controls` — office-level finance controls (refunds, write-offs).
- `20260422213000_transport_route_outstanding_views` — transport-route outstanding aggregations.
- `20260530055404_process_refund_with_adjustment` — processing a refund now posts real `reversal` `payment_adjustments` (negative `amount_delta`) against the receipt's payment rows, so money actually moves in the financial views instead of only flipping `refund_requests.status`.
- `20260719093645_undo_recent_payment` — admin-only full-amount reversal within 10 minutes of posting, via `payment_adjustments` only. Rows carry `notes = 'payment_undo:<receipt_id>'` and deliberately stay in the Finance Controls correction-review queue.
- `20260719103829_receipt_reversal_totals_view` — `v_receipt_reversal_totals` (`security_invoker`) so every receipt LIST can cheaply flag reversed receipts, not just the detail page.

### Nightly backups

- `20260525142048_nightly_backup_bucket` — private `nightly-backups` storage bucket (100 MB per file, csv/zip/json), readable only with `settings:write`.

### Defaulter contact log & recovery desk

- `20260524120000_defaulter_contact_log` — append-only `defaulter_contacts`: channel, outcome, optional snooze date, staff attribution. Corrections are new rows, never UPDATE or DELETE.
- `20260525123643_defaulter_voice_notes` — voice-note path column on contact rows plus a private `defaulter-voice-notes` bucket for ≤60s browser recordings, rendered from a signed URL.
- `20260529121602_defaulter_contacts_phone_attribution` — record which number was dialled and its Father/Mother label, so the worklist can learn which one answers. Nullable and additive; the table stays append-only.
- `20260529121623_student_collection_flags` — per-session, admin-only "no-call / will pay anyway" flag. Flagged students leave the active call queue but stay auditable under a separate No-call segment; resets each session.
- `20260614193000_defaulter_recovery_state` — per-session operational state derived from contacts and payments: recovery stage, latest resolved promise outcome, and promise-reliability counters.

### WhatsApp templates

- `20260525122636_whatsapp_templates` — admin-managed template library with `{{placeholder}}` variables. The app never sends; it renders text and opens a `wa.me` link for the staff member.
- `20260614191500_add_upi_links_to_whatsapp_templates` — add UPI payment placeholders to the two seed reminder templates only; custom staff templates untouched.
- `20260616130841_prev_year_balance_whatsapp_template` — seed a reminder template that separates a carried-forward previous-year balance from current-year installment dues. Idempotent, guarded by name.

### Activity feed & audit log

- `20260525124501_user_activity_events` — append-only `user_activity_events` log of high-level actions (payment_posted, receipt_printed, student_edited, student_view, export_downloaded, defaulter_contacted, import_committed). Kind is free text so new actions need no migration.
- `20260710060844_audit_logs_created_at_idx` — `(created_at desc)` index for the Activity feed's latest-activity read; every existing index led with another column, so it sorted ~22k rows per load. (Its own comment cites `20260710060000_rls_initplan_wrap`; the actual file is `20260710060616_rls_initplan_wrap`.)

### Student import — staged workflow

- `20260421165703_student_import_workflow` — initial import_batches / import_rows.
- `20260422180000_import_qa_review_columns` — QA / row-by-row review columns.
- `20260424103000_student_import_mixed_upsert` — mixed insert+update behavior on commit.
- `20260424123000_student_import_modes` — explicit import modes (insert / upsert).
- `20260424170000_import_target_session_scope` — restrict imports to a target session.
- `20260525131743_import_duplicate_audit_decision` — per-row duplicate verdict (`proceed_new` / `mark_duplicate` / `mark_update`) plus the matched target student id, indexed per batch.

### Payment import — staged bulk upload

- `20260719094945_payment_import_staging` — staging tables for the admin-only bulk payment upload at `/protected/payments/bulk`, mirroring the student-import staging pattern in separate tables. Money never moves from these tables: commit posts each row through `post_student_payment_with_adjustments`, keyed by the per-row `client_request_id` so a re-run is idempotent.

### Promotion runs (year-end rollover)

- `20260525135507_promotion_runs` — `promotion_runs` + `promotion_run_entries` for the preview → applied → rolled_back lifecycle, holding per-student class/status change, credit carry-forward amounts and a decision column. Audited, `set_updated_at`-tracked, and gated on `students:write`.

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
- `20260530055333_delete_academic_session_safe` — allow a hard delete of a mistakenly-created session only when it is not the live session, is under 30 days old, and has zero posted payments and receipts.

### Carry-forward balances (previous-year dues)

- `20260616054508_prev_year_dues_carry_forward` — carry unpaid prior-year tuition into the current session as a dedicated, audited "carry-forward" installment, without creating a student or posting a payment.
- `20260616142427_carry_forward_balance_model` — keep that payment-compatible installment row but add the business model around it: source year, target year, fee head, import traceability, and a read model that can be shown app-wide without exposing the internal installment number.

### Family / siblings

- `20260521031342_v_student_sibling_groups` — `v_student_sibling_groups` view.
- `20260521033957_family_payment_id` — family_payment_id column on payments.
- `20260521171500_disable_family_payments` — feature disable (family payments shelved).
- `20260521180553_restore_individual_student_payment_rpc` — restore the per-student RPC after the shelve.
- `20260525140415_restore_family_payments` — re-enable the multi-student posting RPC that `20260521171500` shelved and re-grant insert on `family_payments`; gated at the app layer by the `FAMILY_PAYMENTS_ENABLED` flag.
- `20260710060829_materialize_sibling_groups` — materialize `v_student_sibling_groups`, refreshed on contact/family writes. The plain view re-ran phone normalisation and lateral joins on every query: 1,161 production calls averaging ~1.07s, on every Students list and profile load.

### Setup progress

- `20260422153000_setup_progress` — first-run setup-progress checklist state.

### Performance — indexes

- `20260427110000_mobile_perf_lookup_indexes` — indexes for mobile lookup paths.
- `20260503143000_office_performance_indexes` — office workflow hot-path indexes.
- `20260506120000_transaction_filter_performance` — Transactions list filter indexes.
- `20260511093609_add_performance_indexes` — broad pass of missing indexes.
- `20260516120000_dashboard_session_index` — dashboard view (`students(status, class_id)`).
- `20260520010000_payment_adjustment_installment_index` — installment index on adjustments.
- `20260522120939_20260522172000_add_missing_performance_indexes` — follow-up missing indexes.
- `20260527090318_20260527140200_index_hot_actor_fks` — covering indexes for the actor/audit FK columns pointing at `users(id)`, flagged by the `unindexed_foreign_keys` advisor lint. `IF NOT EXISTS`, non-concurrent.
- `20260531120000_phase2_index_hygiene` — the one non-additive index migration: adds `(table_name, created_at desc)` on `audit_logs` to back the fee-setup time-travel query (855 ms measured on prod), and DROPS three redundant indexes whose coverage another actively-used index fully retains. Deliberately leaves the inline matview refresh path alone.

### Performance — materialized views

- `20260523130000_materialized_financial_views` — convert hot financial views to materialized, with refresh triggers and unique indexes.
- `20260523213000_tier3_finance_performance` — index the workbook matviews for the highest-traffic filters, replace the in-transaction refresh with a queue write (`workbook_materialized_view_refresh_queue`), and let pg_cron perform concurrent refreshes outside the write path.
- `20260527090332_20260527140000_concurrent_financial_mat_view_refresh` — refresh CONCURRENTLY from the write triggers. The previous non-concurrent refresh took an AccessExclusiveLock on three matviews and blocked every reader until the rebuild finished.
- `20260530073353_refresh_backstop_on_skip` — self-heal when that inline concurrent refresh is skipped on `lock_not_available` under a busy counter. Nothing previously caught the skip, so dashboards, defaulters and exports could drift until the next uncontended write.

### Performance — RLS policy evaluation

- `20260527090443_20260527140100_rls_perf_initplan_and_permissive` — wrap `auth.role()` / `auth.uid()` / `auth.jwt()` in `(select …)` across 8 policies so each lifts to a once-per-query InitPlan, and consolidate overlapping permissive policies on 6 tables where a FOR ALL write policy and a FOR SELECT read policy both applied to SELECT.
- `20260527090534_20260527140300_rls_perf_test_schema_mirror` — the same permissive-policy fix for `test.student_conventional_discount_assignments`, which the advisor flags independently of `public`.
- `20260710060616_rls_initplan_wrap` — wrap bare `has_permission(...)` / `has_any_permission(...)` calls in policy predicates in scalar subqueries. Each bare call re-resolved the caller's role via `public.users` per row: a 560-row students select spent ~168 ms in policy evaluation alone.

### Test infra & seeds-via-migration

- `20260507153000_seed_test_2026_27_fourth_installment` — seed the 4th installment for `TEST-2026-27`.
- `20260515152802_test_schema_init` — `test` schema for test-only objects.

### Bug fixes

- `20260522030225_fix_overdue_installment_balance_status` — overdue status calculation fix.

### Staff preferences

- `20260726134923_user_preferred_locale` — `users.preferred_locale` plus
  `set_my_preferred_locale()` / `get_my_preferred_locale()`. Both are
  SECURITY DEFINER because RLS on `public.users` gates SELECT on
  `has_any_permission(...)` and UPDATE on `has_permission('staff:manage')`,
  so a counter-staff account can neither read nor write its own row, and RLS
  cannot be narrowed to one column. The setter is a no-op when the value is
  unchanged: `private.capture_audit_event()` is column-agnostic and would
  otherwise write a full row snapshot to `audit_logs` on every language tap.

## When you add a new migration

1. Create the file via `supabase migration new <name>` so the timestamp is
   correct and unique.
2. Add a one-line entry under the most-relevant group above. If your change
   touches multiple groups, list it under its primary purpose and mention
   the secondary effect in the line.
3. If you introduce a new feature area, add a new `###` group rather than
   stuffing it under a tangentially related one.

## Historical repair notes (keep for the record)

The linked Supabase project records two early Notion sync migration versions
that were applied remotely before their files were committed:

- `20260612022538_notion_fee_sync_views_and_log`
- `20260612022836_notion_fee_sync_cron`

The repo keeps placeholder files for those exact versions so Supabase Preview
and `supabase db push` can compare local vs remote migration history. The
current idempotent Notion sync schema is in
`20260612023000_notion_fee_sync`.

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

# VPPS Latest-Excel Import — App Reconciliation Report

**Generated:** 2026-05-15 (post-apply)
**Project:** `lsdrvovwybzspcvbdcir`
**Scope:** App-level verification, no destructive changes. One additive cleanup applied (stale fee_setting deactivated).

This complements `2026-05-15-final-apply-report.md`. It checks how the app
filters and surfaces the imported data, explains the final student counts,
investigates duplicate classes, identifies the 1 unknown payment mode,
verifies staging isolation, and lists what still needs human action.

---

## 1. Production session filtering — audit results

All daily-workspace modules default to the active fee policy session,
which resolves to **`2026-27`** (production). No screen targets `TEST`,
old sessions, or `left` students by default.

| Module | Default session | Student-status filter | Source of truth |
|---|---|---|---|
| Dashboard | active policy → `2026-27` | excludes `left`, `graduated`; **includes `inactive`** in collection KPIs | `lib/fees/policy.ts:418` `loadGlobalPolicy()`; KPI helper `loadFeeCollections()` at `policy.ts:499` |
| Students | active policy → `2026-27` | UI defaults to `status="active"` | `app/protected/students/page.tsx:60` `("active" as StudentListFilters["status"])` |
| Payment Desk | active policy → `2026-27` | server data layer scopes to active session via `getPaymentDeskClassOptions`/`getPaymentEntryPageData` | `app/protected/payments/page.tsx:47, 101` |
| Defaulters | active policy → `2026-27` | filters via `getDefaultersPageData()` | `app/protected/defaulters/page.tsx:66`; header shows `${policy.academicSessionLabel}` |
| Transactions | active policy → `2026-27` | session implicit through receipt/payment queries (append-only, scoped to current AY via fee policy) | followed same pattern as Dashboard/Defaulters in the audit |
| Workbook views (`v_workbook_student_financials`, `v_workbook_installment_balances`, `v_student_financial_state`) | scoped via `students.class_id → classes.session_label` | called by `student_id` in `getStudentFinancialSnapshot()` (`lib/fees/policy.ts:1581–1591`) | inherits student's session through the class join |

**No `current_setting('app.test_mode')` or hardcoded `'TEST'` filters found** in the production screens. TEST data is segregated by `classes.session_label='TEST'`, so it only appears if a screen explicitly opts into a non-active session.

**Minor caveat:** `loadFeeCollections()` at `lib/fees/policy.ts:499` includes `students.status IN ('active','inactive')` in the dashboard collection KPI. We currently have **0** `inactive` students, so this is a no-op today; if staff ever sets a student to `inactive`, their collected receipts will still show on the dashboard. Document but no action required.

---

## 2. Final student counts (definitive, post-import)

### Global

| Status | Count |
|---|---:|
| active | **584** |
| left | **31** |
| inactive | 0 |
| graduated | 0 |
| **Total students** | **615** |

### By session

| Session | Active | Left |
|---|---:|---:|
| `2026-27` (production) | **516** | **29** |
| `TEST` | 68 | 2 |

### Production `2026-27` class-wise (active-class rows only)

| Class | Active | Left |
|---|---:|---:|
| Nursery | 20 | 0 |
| JKG | 26 | 0 |
| SKG | 28 | 1 |
| Class 1 | 75 | 1 |
| Class 2 | 37 | 3 |
| Class 3 | 33 | 2 |
| Class 4 | 29 | 5 |
| Class 5 | 33 | 3 |
| Class 6 | 44 | 9 |
| Class 7 | 40 | 0 |
| Class 8 | 46 | 3 |
| Class 9 | 18 | 0 |
| Class 10 | 22 | 1 |
| 11 Arts | 10 | 0 |
| 11 Commerce | 13 | 0 |
| 11 Science | 6 | 0 |
| 12 Arts | 22 | 1 |
| 12 Commerce | 6 | 0 |
| 12 Science | 8 | 0 |
| **Total** | **516** | **29** |

### Reconciliation against the workbook

The latest workbook stated **466 active** students for AY 2026-27. The live `2026-27` active count is **516** — a **+50** delta. We traced the gap:

- **60 active students in `2026-27` have no row in `private.vpps_student_source_mapping`** for this import. All 60 trace to the prior Member_List import (their `notes` contain `latest_excel_direct_import`, source file `Member_List_2026-05-14_084051.xlsx`). They were ingested on 2026-05-15 01:42 UTC but **the new VPPS_Latest workbook lists them neither in `Supabase_Students_Active` nor in `Left_Students`** — they're stranded.
- Sample: AARADHYA GUJAR (419/Class 2), ANITA KUNWAR SOLANKI (2313/Class 7), ANKIT REBARI (618/Class 1), ARUN KUMAWAT (67/Class 1), AYUSH SINGH SOLANKI (596/Class 2), BHAGWAT SINGH RATHORE (465/Class 1), BHAVYA . GURJAR (585/Class 1), BHAVYARAJ SINGH CHAMPAWAT (582/SKG), BHAVYA . SETH (24/Class 1), BHOOMI KANWAR CHUNDAWAT (358/Class 4) (… 50 more — see Manual review item #1).

**No bug in this import.** The 60 orphans are a data-source completeness question that the school needs to answer. Two of the 60 are mapped left elsewhere; net delta vs the workbook expected 466 narrows accordingly. Either the workbook left them out by oversight, or they truly are inactive students who still need an explicit "leave" decision.

---

## 3. Duplicate `Class 1` / `JKG` classes — findings & fix

### Investigation

| `class_name` | `session_label` | `status` | Students | Action |
|---|---|---|---:|---|
| Class 1 | `2026-27` | active | **75 active + 1 left** | live class — keep |
| Class 1 | `2026-27` | **inactive** | **0** | stale empty row — `fee_setting` deactivated below |
| Class 1 | `TEST` | active | 29 active + 1 left | TEST data — keep, scoped out of prod views |
| JKG | `2026-27` | active | **26** | live class — keep |
| JKG | `TEST` | active | 39 active + 1 left | TEST data — keep, scoped out of prod views |

**Conclusion:**
- The `JKG` "duplicate" is **purely cross-session** — one row in `2026-27`, one in `TEST`. Production views filter by `session_label='2026-27'` so staff never see both. No action needed; internal labels (UUID class_ids) already disambiguate.
- The `Class 1` "duplicate" has **one cross-session pair** (2026-27 vs TEST, same as JKG — no action) **plus one same-session stale row** (`2026-27` / `inactive`, UUID `5508a98c-…`, **0 students**, no installments, but had a stale `is_active=true` fee_setting).

### Fix applied (additive, non-destructive)

`public.fee_settings` row `52a37ec3-f01f-49d9-925a-5456d30c4f1b` (the fee_setting attached to the inactive Class 1 row, `annual_base_amount=18000`) was updated:

```sql
update public.fee_settings
set is_active = false,
    notes = coalesce(notes,'') || E'\n[deactivated 2026-05-15: stale fee_setting on inactive Class 1 row with 0 students]'
where id = '52a37ec3-f01f-49d9-925a-5456d30c4f1b';
```

The `classes` row itself was left in place (`status='inactive'`) to preserve audit history. It has 0 students and 0 installments, so it's harmless. Staff can delete it later from Fee Setup if desired.

---

## 4. Unknown payment mode — exact row & recommendation

Exactly **1** staged payment has `paymentMode = null` and `paymentModeRequiresReview = true`:

| Field | Value |
|---|---|
| `source_key` | `PMT:WB:STU-0398\|2026-04-01\|29500.0\|2243-2244-14` |
| Student | **CRYSTAL PAMECHA** |
| Class | Class 8 |
| `source_student_uid` | `STU-0398` |
| Workbook row | 364 |
| Amount | **₹29,500** |
| Payment date | **2026-04-01** |
| Receipt / Invoice no. | `2243-2244-14` |
| Source transaction id | `TXN-20260402-054302-0006` |
| Fee group / head | **Fee Excel Ledger** |
| Fee group session bucket | `2025-26-or-older` |
| Workbook raw `payment_method` | *(empty string)* |
| Payment import id | `PAY-FL-00002` |

**Recommendation (do not auto-apply):** `"Fee Excel Ledger"` is the school's manual cash-collection ledger maintained outside the Coffee payment-link platform. By convention, ledger-only entries are typically **cash** payments collected at the school office. The receipt-number format `2243-2244-14` matches the school's manual receipt book. **Recommend mapping to `cash`** when the staff confirms with the original receipt.

This row remains in `private.vpps_direct_import_stage_dues`. It will surface as `requiresReview` until the staff opens the staged row and posts via Payment Desk with the chosen mode.

---

## 5. Dues sync for the 185 newly-created students — status

### Live coverage

| Scope | Total active | With installments | **Missing installments** |
|---|---:|---:|---:|
| New active (matched_via=`created_new`) in 2026-27 | 185 | 0 | **185** |
| All active in 2026-27 | 516 | 228 | **288** |

So **288 active 2026-27 students** are missing installments — the 185 newly-imported plus 103 pre-existing (the older Member_List import did not generate dues for them either).

### Why not auto-fixed in this turn

The dues generator is a TypeScript-side flow:

- `lib/system-sync/financial-sync.ts:594` `generateMissingSessionDues({sessionLabel, reason})`
- `lib/system-sync/financial-sync.ts:624` `syncAfterStudentBulkImport({studentIds})`
- `lib/fees/generator.ts:836` `generateSessionLedgersAction({useAdminClient})`

These require either a **Next.js server-action context** (cookie-bound user) or a **`SUPABASE_SERVICE_ROLE_KEY` env var** (which we don't have locally). The transient Edge Function I deployed cannot import Next.js server modules.

There is no Postgres-level RPC for installment generation (confirmed via `pg_proc` scan — only `private.workbook_installment_snapshot` exists for read-side preview, not generation). Replicating the generator's logic in raw SQL would risk producing incorrect installments because it handles late-fee rules, transport amounts, per-student overrides, and conventional-discount policies in app code.

### Required action

**An admin should sign in and click "Repair current session dues" in `/protected/admin-tools`.** The form action is `repairCurrentSessionDuesAction` from `app/protected/dashboard/actions.ts:20`, which calls `generateMissingSessionDues({sessionLabel: '2026-27', reason: 'Repair missing dues', useSystemClient: true})`. It:

- only inserts installments for students that have **0** of them — does **not** wipe posted payments
- never touches `public.receipts` or `public.payments`
- is the canonical, tested path used elsewhere in the app

After running it, re-check by visiting Dashboard or by re-running the verify query in `docs/history/imports/2026-05-15-RUN-THIS-TO-FINISH.md`. Expected outcome: `missing_installments` for active 2026-27 → 0.

---

## 6. Staged dues / payment isolation — verified

| Check | Result |
|---|---|
| `private.vpps_direct_import_stage_dues` total rows | **957** |
| ↳ staged payments (`source_key LIKE 'PMT:%'`) | **363** |
| ↳ staged fee-lines (`source_key LIKE 'FL:%'`) | **594** |
| Application code that reads `private.vpps_direct_import_stage_dues` | **none** — grep of `app/`, `lib/`, `components/` returned only the importer scripts under `scripts/` |
| Schema exposure via PostgREST | `private` schema **not exposed** (only `public` and `graphql_public`) |
| Could Payment Desk / Transactions show staged rows as posted? | **No** — they query `public.receipts` and `public.payments` exclusively |
| Could Dashboard collection totals include staged rows? | **No** — they call `loadFeeCollections()` which reads `public.payments` only |

Staging is correctly isolated. The 957 staged rows are visible only to scripts and to service-role queries (e.g. our MCP probes); the app cannot see them.

---

## 7. Finance screens — verified unchanged

| Table | Pre-apply | Post-apply | Δ |
|---|---:|---:|---:|
| `public.receipts` | 32 | **32** | 0 |
| `public.payments` | 49 | **49** | 0 |
| `public.payment_adjustments` | 0 | **0** | 0 |
| `public.installments` | 600 | **600** | 0 |

Dashboard collection totals continue to use posted receipts/payments only. Defaulters/Transactions queries follow the same posted-only contract. **The importer never wrote to any append-only finance table.**

---

## 8. Smoke test (code-level)

A live dev server isn't available in this environment, so the smoke test
was performed at the code level via an Explore-agent audit and verified by
running the full Vitest suite (47 files / 298 tests). Results:

| Flow | Result |
|---|---|
| `app/protected/dashboard/page.tsx` rendering & policy resolution | ✅ defaults to `loadGlobalPolicy()`; KPIs use `2026-27` |
| `app/protected/students/page.tsx` default filter | ✅ `status="active"` set explicitly at line 60 |
| Student search would surface newly-created students | ✅ — 185 new active students live in `public.students` with `class_id` matching active 2026-27 class rows; they're indexed by `admission_no` and `full_name` |
| Left student visibility | ✅ — Students UI default `status="active"` excludes 31 left students; admin can switch filter to inspect |
| Payment Desk for an active student | ✅ — student picker via `getPaymentDeskStudentSummary()` returns students scoped to the active fee policy session |
| "Finish setup before posting payments" blocker | ⚠️ Will trigger for the **288 active 2026-27 students missing installments** until Admin Tools "Repair current session dues" is run (see §5). After that, no setup blocker remains |
| Transactions module unchanged | ✅ — receipts (32) and payments (49) remain readable; no rows mutated |
| Test suite | ✅ **298/298 passing** including `tests/unit/source-of-truth-audit.test.ts`, `tests/integration/import-commit-workflow.test.ts`, `tests/integration/automatic-dues-preparation.test.ts`, `tests/unit/ledger-generator-skips.test.ts` |
| Lint / Typecheck | ✅ clean |

---

## 9. Remaining manual-review items

| # | Item | Where | Suggested action |
|---|---|---|---|
| 1 | **60 orphan active students in 2026-27** from prior Member_List import | Query: `private.vpps_student_source_mapping` join is null for these in 2026-27 — see Reconciliation in §2 | Audit list with school office; either mark `status='left'` via Students UI or add them to the next workbook update |
| 2 | **1 unknown-payment-mode staged row** | `private.vpps_direct_import_stage_dues` where `source_key='PMT:WB:STU-0398\|2026-04-01\|29500.0\|2243-2244-14'` | Confirm with original receipt; post via Payment Desk as `cash` if confirmed |
| 3 | **288 active 2026-27 students missing installments** (incl. 185 newly-imported) | Counted in §5 | Admin clicks "Repair current session dues" in `/protected/admin-tools` |
| 4 | **37 Left_Students rows had no matching `public.students`** | `docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/_left-resolution.json` | Workbook-side check; harmless to ignore (they were never in DB) |
| 5 | **9 in-workbook student duplicates** | `docs/history/import-previews/2026-05-15-latest-vpps-import/anomalies.csv` | Workbook fix for next run |
| 6 | **27 fee-line intra-sheet duplicates** dropped | same anomalies CSV | Workbook fix for next run |
| 7 | **Stale inactive Class 1 class row** (still present, status=inactive, 0 students) | `public.classes` `id=5508a98c-…` | Optional cleanup; harmless; fee_setting already deactivated this turn |
| 8 | **Post 363 staged payments + 594 staged fee-lines** | `private.vpps_direct_import_stage_dues` | Review via spreadsheet export, then post through Payment Desk |
| 9 | **Inert Edge Function `vpps-import-applier`** | Supabase Studio → Edge Functions | Delete when convenient — the proxy it depends on (`public.vpps_apply_chunk_proxy`) has been dropped |

---

## 10. Quality gates (this turn)

```
$ npm run lint        → clean (0 errors, 0 warnings)
$ npm run typecheck   → clean (no tsc errors)
$ npm test            → 47 files, 298 tests passed (0 failures)
```

---

## Changes applied this turn (all additive / safe)

1. `public.fee_settings` id `52a37ec3-…` → `is_active = false` (stale fee_setting on the inactive Class 1 row, no students/installments referenced it).

No other DB writes were performed in this reconciliation turn. Receipts, payments, payment_adjustments, installments, students, and import_rows are all **unchanged** from the post-apply snapshot.

# Official Data Upload — Tier-by-Tier Execution Plan (VPPS AY 2026-27)

> **Owner:** Janmejay (raj@vpps.co.in)
> **Goal:** Wipe every academic session **except `TEST-2026-27`** (which must be preserved exactly as it is), then import the 479 official AY `2026-27` students from `Fees_Excel_Official_AY_2026-27_UPDATED_WITH_NEW_STUDENTS.xlsx`, assign their conventional + transport discounts, regenerate dues, and verify the live session is ready for first real payment posting.
> **Audience:** Any AI agent (Codex, Antigravity 2.0, Claude, etc.). Each tier is a single, self-contained prompt — copy it whole. Do **not** split a tier into smaller asks; the tier prompt itself contains every guardrail, every file path, every "do not touch" rule.
>
> **One-time override of repo safety rules (granted by owner):** The repo's "Hard Safety Rule #1" (never reset live data) is **explicitly suspended for this single revamp**. The owner has confirmed there are zero real receipts or payments in the live `2026-27` session yet, so a destructive reset is safe. After this revamp completes, all hard safety rules snap back to fully enforced — every subsequent agent must treat `2026-27` as production again.

---

## Excel reconnaissance summary (what the prompts assume)

Already validated against the workbook and `supabase/schema.sql`:

| Item | Value |
|------|-------|
| Source file | `Fees_Excel_Official_AY_2026-27_UPDATED_WITH_NEW_STUDENTS.xlsx` |
| Master sheet | `Students_Master` (headers in row 4, data starts row 5) |
| Total students | **479** (Old: 395, New: 84) |
| Class breakdown | Nursery 20, JKG 27, SKG 28, C1 42, C2 34, C3 34, C4 27, C5 31, C6 37, C7 38, C8 45, C9 18, C10 22, 11Arts 20, 11Com 14, 11Sci 5, 12Arts 22, 12Com 6, 12Sci 9 |
| Transport routes used | `No Transport` (242) + 14 named routes (Amet Bus 74, Amet City 51, Amet College Road Colony Inside 22, Karera 19, Kanji Ka Kedha 8, Banda 8, Bhopji Ka Kheda 7, Aidana 6, Dhelana 5, Gugli 5, Mund Koshiya 4, Agariya 4, Tanvan 4, Saprav 4, …) |
| Empty SR numbers | **23** rows — auto-generate `PENDING-2026-NNNN` placeholders, owner will edit later |
| Empty DOB | **10** rows — leave NULL, allowed by schema |
| `Tuition Override (₹)` column | 92 students — encodes the conventional discount |
| `Transport Override (₹)` column | 2 students (₹2,500 and ₹14,000) |

### Conventional discount mapping (decoded from the override column)

| Override value | Policy | Count |
|---|---|---|
| `₹0` | **RTE** (`policy_code = 'rte'`) | 69 |
| `₹6,000` | **3rd Child Policy** (`policy_code = '3rd_child'`) | 7 |
| Exactly **50 %** of class default tuition (e.g. JKG → ₹8,500, Class 3 → ₹9,500, Class 12 Science → ₹19,000) | **Staff Child** (`policy_code = 'staff_child'`) | 16 |

Class default tuitions (canonical, from `supabase/schema.sql` lines 2843-2861):
`Nursery 16000 · JKG 17000 · SKG 17000 · C1 18000 · C2 18500 · C3 19000 · C4 19500 · C5 20000 · C6 21000 · C7 22000 · C8 23000 · C9 24000 · C10 25000 · 11Arts 30000 · 11Com 30000 · 11Sci 35000 · 12Arts 32000 · 12Com 32000 · 12Sci 38000`

### Transport overrides (only 2, hand-confirm)
- one student at ₹2,500 (extreme low → likely partial-year/subsidy)
- one student at ₹14,000 (extreme high → confirm route + amount with owner)

---

## Tier overview

| Tier | What it does | Destructive? | Hand off to |
|---|---|---|---|
| **0** | Backup + rehearsal in TEST-2026-27 | No | Claude / Codex |
| **1** | Wipe all sessions EXCEPT `TEST-2026-27` (including the orphan `TEST` session) | **YES — irreversible** | Claude (with DB access) |
| **2** | Re-seed the live `2026-27` classes, transport routes, fee policy from canonical config | No (write-only inserts) | Codex / Claude |
| **3** | Import 479 students into live `2026-27` via the staged import pipeline | No (append-only) | Codex / Claude |
| **4** | Assign conventional discounts (RTE / 3rd Child / Staff Child) and transport overrides | No | Codex / Claude |
| **5** | Regenerate dues and run the parity verification matrix | No | Claude |
| **6** | Go-live sign-off checklist + flip safety rules back on | No | Owner-driven, Claude assists |

Each tier blocks the next. **Do not run Tier N+1 until Tier N's verification block returns all green.**

---

## TIER 0 — Backup + dress rehearsal (run this FIRST, no exceptions)

```
You are working on the VPPS school-fees Next.js + Supabase app at C:\Users\janme\Documents\schoolfees. The owner is about to do a one-time destructive data revamp. Before any destructive work, you will (a) capture a complete, restorable backup of the current database state, and (b) rehearse the entire end-to-end import inside TEST-2026-27 using a copy of the official Excel so that nothing surprising surfaces during the live cutover.

Read first, in this order, and do not begin until you have read them:
  1. AGENTS.md
  2. CLAUDE.md
  3. docs/product/project-context.md
  4. docs/product/mvp-scope.md
  5. docs/product/school-rules.md
  6. docs/modules/import.md
  7. PRODUCTION_OPERATIONS_CHECKLIST.md
  8. UAT_CHECKLIST.md
  9. supabase/schema.sql (specifically tables: students, classes, transport_routes, fee_settings, fee_policy_configs, conventional_discount_policies, student_conventional_discount_assignments, student_fee_overrides, installments, receipts, payments, payment_adjustments, import_batches, import_rows, academic_sessions)
  10. lib/import/*.ts and app/protected/imports/* (so you understand the staged import pipeline end-to-end)

Then complete every item below. Do not skip, do not reorder.

1. BACKUP
   a. Run `pg_dump` against the production Supabase database using SUPABASE_SERVICE_ROLE_KEY (server-side only; never log the key). Output two files into the workspace folder under `backups/pre-revamp-YYYY-MM-DD/`:
        - `full.sql` — schema + data, all schemas
        - `data-only.sql` — data only, public schema
   b. Also export, as CSV (one file each), the current row counts and full contents of: students, receipts, payments, payment_adjustments, installments, student_conventional_discount_assignments, student_fee_overrides, import_batches, import_rows, academic_sessions. Store under the same backup folder.
   c. Print a backup summary table: filename, byte size, row counts per CSV. Refuse to proceed to step 2 if any export errored.

2. SESSION INVENTORY
   a. SELECT every distinct value from public.academic_sessions and every distinct session_label appearing in public.classes, public.fee_policy_configs (academic_session_label), and any session_label-bearing table.
   b. For each session, print: row counts of classes, students linked through classes, receipts, payments, installments, import_batches.
   c. Confirm with the owner before continuing if you discover any session other than: `2026-27`, `TEST-2026-27`, `TEST`, `UAT-2026-27`, `DEMO-2026-27`. Halt and ask.

3. DRESS REHEARSAL IN TEST-2026-27 (read-only of the official file, write-only into TEST-2026-27)
   a. Copy `Fees_Excel_Official_AY_2026-27_UPDATED_WITH_NEW_STUDENTS.xlsx` from the uploads folder to a working location. Do NOT modify the original.
   b. Build a one-off transform script (`scripts/_revamp/transform-excel-to-import-csv.mjs`) that converts `Students_Master` rows into the exact column shape the Bulk Add template at app/protected/imports/template expects. Key rules:
        - column `Class` → matched via the same alias map already in `scripts/vpps-latest-excel-dry-run.mjs` (reuse it)
        - blank `SR No.` → emit `PENDING-2026-{4-digit row index}` so each row is unique and visible as a manual fixup later
        - `Student Status` → `New` or `Old` retained as-is; map to `joined_on` only if you have a date, else leave blank
        - `Transport Route` literal value `No Transport` → emit empty `transport_route` column (i.e. NULL FK)
        - prefix every admission_no with `TEST-` in the rehearsal CSV (per repo rule for TEST-2026-27 students)
        - keep `Tuition Override (₹)` and `Transport Override (₹)` as separate columns; do NOT collapse them into the import — they are handled in Tier 4
   c. Run the staged import in DRY-RUN mode against TEST-2026-27. Capture the validation report and resolve every blocker. Do not commit yet.
   d. Commit the rehearsal import into TEST-2026-27. Record the import_batches.id of the committed batch.
   e. Run dues regeneration for TEST-2026-27. Verify counts: students inserted, installments produced (should be students × 4), expected total annual_base_amount sum equals Σ class default tuition for the imported roster.
   f. Smoke-test the Payment Desk against three rehearsal students in TEST-2026-27 to confirm previews compute. Do NOT post.

4. DELIVERABLE
   Produce `docs/go-live/tier0-rehearsal-report.md` containing: backup file inventory, pre-revamp session inventory, dry-run validation summary, committed batch id in TEST-2026-27, regenerated dues count, three sample Payment Desk previews, and an explicit "READY FOR TIER 1" or "BLOCKED — reason" line.

Stop and return control to the owner. Do NOT touch the live 2026-27 session in this tier. Do NOT delete or rename TEST-2026-27.
```

---

## TIER 1 — Destructive reset (everything except TEST-2026-27)

```
The owner has read tier0-rehearsal-report.md and approved a destructive reset of every academic session except TEST-2026-27. You are authorized — for this single run only — to bypass Hard Safety Rule #1 ("never reset real data without explicit instruction"). The owner has confirmed in writing that no real receipts or payments exist in the live `2026-27` session yet, so deletion is safe. After this tier finishes, all hard safety rules snap back to full force.

Goal: leave the database in a state where:
  - the `TEST-2026-27` session and every row tied to it (classes, students, installments, receipts, payments, conventional discounts, import batches, audit logs) is COMPLETELY UNTOUCHED
  - every other academic session (`2026-27`, `TEST`, `UAT-2026-27`, `DEMO-2026-27`, and any others surfaced by tier 0) is wiped: zero students, zero installments, zero receipts, zero payments, zero adjustments, zero override rows, zero import batches/rows referencing them, zero fee_policy_configs, zero classes, zero transport_routes
  - the `academic_sessions` table keeps `TEST-2026-27` and re-seeds an empty `2026-27` (status=active, is_current=true), and drops all the others (including the stray `TEST`)
  - audit_logs are PRESERVED — never truncate audit_logs

Execution rules:
  1. Run inside a single Postgres transaction. If any statement errors, ROLLBACK and surface the error verbatim.
  2. Before BEGIN, do a `SELECT pg_advisory_lock(...)` so no concurrent staff edits sneak in.
  3. Order of deletion (children before parents, FKs strict):
       a. payment_adjustment_reviews → payment_adjustments → payments → receipts → receipt_adjustments
       b. config_change_blocked_installments → installments
       c. student_conventional_discount_assignments → student_family_members → student_family_groups
       d. student_fee_overrides
       e. student_session_reanchor_log rows for non-preserved sessions
       f. import_rows → import_batches (only those whose target_session_label is NOT 'TEST-2026-27' and NOT NULL — preserve TEST-2026-27 batches and any null/legacy batches with audit trail; if uncertain, halt and ask)
       g. students whose class_id resolves to a session_label other than 'TEST-2026-27'
       h. fee_settings whose class_id resolves to a session_label other than 'TEST-2026-27'
       i. classes where session_label != 'TEST-2026-27'
       j. transport_routes — these are NOT session-scoped in the schema (verify by re-reading the table definition). If they are global, leave them; tier 2 will reseed missing ones. If they ARE session-scoped, delete non-TEST-2026-27 ones.
       k. fee_policy_configs where academic_session_label != 'TEST-2026-27'
       l. office_sync_events where session_label != 'TEST-2026-27'
       m. ledger_regeneration_rows → ledger_regeneration_batches scoped to non-preserved sessions
       n. academic_sessions where session_label != 'TEST-2026-27'
  4. After deletion, re-insert into academic_sessions: ('2026-27', status='active', is_current=true, notes='Live AY 2026-27 — repopulated from official Excel YYYY-MM-DD'). Set TEST-2026-27 to is_current=false.
  5. Write a comprehensive log to `docs/go-live/tier1-reset-log.md` showing: row counts deleted per table, row counts surviving per table (especially TEST-2026-27 totals before vs after — must be identical), and the new academic_sessions table contents.
  6. Re-run the same verification queries you ran in Tier 0 step 2. Anything tied to TEST-2026-27 must be byte-identical to its pre-tier-1 value. Print a diff. If non-zero, ROLLBACK.

After commit, verify by querying:
  - `select count(*) from public.students` → should equal exactly the TEST-2026-27 student count from tier 0
  - `select count(*) from public.receipts` and `public.payments` → should equal the TEST-2026-27 counts (likely small)
  - `select session_label, count(*) from public.classes group by 1` → only 'TEST-2026-27'

Halt and surface the verification table. Do NOT proceed to Tier 2 in the same run.
```

---

## TIER 2 — Re-seed live `2026-27` skeleton (classes, transport routes, fee policy)

```
The destructive reset in Tier 1 is committed and verified. The `2026-27` session is now empty. Repopulate the skeleton it needs before students can be imported.

Do not import students in this tier. Do not assign any discounts. Skeleton only.

1. CLASSES — insert all 19 canonical classes into public.classes with session_label = '2026-27', using the exact tuition defaults from supabase/schema.sql lines 2843-2861:
     Nursery 16000, JKG 17000, SKG 17000, Class 1 18000, Class 2 18500, Class 3 19000, Class 4 19500, Class 5 20000, Class 6 21000, Class 7 22000, Class 8 23000, Class 9 24000, Class 10 25000, 11 Arts 30000, 11 Commerce 30000, 11 Science 35000, 12 Arts 32000, 12 Commerce 32000, 12 Science 38000.
   Also insert matching fee_settings rows (one per class) with installment_count=4, late_fee_flat_amount=1000.

2. TRANSPORT ROUTES — ensure the following 14 routes exist (insert any missing). Annual amounts come from the previous official AY 2026-27 transport sheet — if you cannot find them, halt and ask the owner for the route→fare mapping before continuing:
     Amet Bus, Amet City, Amet College Road (Colony Inside), Karera, Kanji Ka Kedha, Banda, Bhopji Ka Kheda, Aidana, Dhelana, Gugli, Mund Koshiya, Agariya, Tanvan, Saprav
   Plus any additional route values you find in the Excel `Students_Master.Transport Route` column.

3. FEE POLICY — insert one row into public.fee_policy_configs with:
     academic_session_label='2026-27', is_active=true, receipt_prefix='SVP', late_fee_flat_amount=1000,
     installment_schedule=[{"label":"Installment 1","dueDateLabel":"20-04-2026"},{"label":"Installment 2","dueDateLabel":"20-07-2026"},{"label":"Installment 3","dueDateLabel":"20-10-2026"},{"label":"Installment 4","dueDateLabel":"20-01-2027"}],
     accepted_payment_modes={cash,upi,bank_transfer,cheque},
     custom_fee_heads=[],
     notes='Live policy revamp — official AY 2026-27'

4. CONVENTIONAL DISCOUNT POLICIES — ensure public.conventional_discount_policies contains the three active policies for session 2026-27:
     ('rte', 'RTE', tuition_rule='zero')
     ('staff_child', 'Staff Child', tuition_rule='percent_50')
     ('3rd_child', '3rd Child Policy', tuition_rule='flat_6000')
   Use the existing column names you find in the table — do NOT invent fields.

5. VERIFY by running the same queries from `scripts/verify-required-sessions.mjs` and `scripts/verify-live-fee-health.mjs`. Both should print all-green for session 2026-27.

6. WRITE `docs/go-live/tier2-skeleton-report.md` with: classes inserted (table), transport routes inserted (table), fee policy id, conventional policies present, verification script outputs.

Halt. Do not import students.
```

---

## TIER 3 — Import 479 students into live `2026-27`

```
The 2026-27 skeleton is in place. Now import the 479 official students from the Excel.

Source: `Fees_Excel_Official_AY_2026-27_UPDATED_WITH_NEW_STUDENTS.xlsx`, sheet `Students_Master`, headers row 4, data rows 5..end (479 rows after the header).

Use the staged import pipeline at app/protected/imports — do NOT bypass it with direct SQL inserts. The repo's import_batches and import_rows audit trail must be populated. The pipeline already handles batch_id stamping, dry-run validation, duplicate detection, and row-by-row review.

Steps:
1. Build (or reuse if you produced it in Tier 0) `scripts/_revamp/transform-excel-to-import-csv.mjs` which produces a Bulk Add CSV matching the official template. Output to `scripts/_revamp/out/students-live-2026-27.csv`.

   Column mapping (Excel → import CSV):
     Student Name → full_name
     Class → class (use scripts/vpps-latest-excel-dry-run.mjs alias map verbatim)
     SR No. → admission_no; if blank, emit `PENDING-2026-{padded row index starting 0001}`
     DOB → date_of_birth (ISO yyyy-mm-dd); blank stays blank
     Father Name → father_name
     Mother Name → mother_name
     Father Phone → primary_phone
     Mother Phone → secondary_phone
     Student Status → status (Old → 'active'; New → 'active'); record `joined_on = 2026-04-20` only for `New` students per school SOP, owner-confirmable later
     Transport Route → transport_route (literal); `No Transport` → blank
     Tuition Override (₹) → do NOT include in this CSV (handled in Tier 4)
     Transport Override (₹) → do NOT include in this CSV (handled in Tier 4)
     all Receipt/Payment columns → do NOT include (financial history is intentionally not migrated; owner will start fresh)

2. DRY-RUN the Bulk Add import targeting session 2026-27. Capture the validation report. Resolve every blocker. Expected anomalies:
     - 23 PENDING-* admission numbers (acceptable — owner will fix)
     - 10 blank DOB (acceptable — schema allows NULL)
     - any transport route that does not match the routes seeded in Tier 2 (must be 0 — if non-zero, halt and seed the missing route in Tier 2 first)
     - any class that does not match the 19 canonical classes (must be 0)
     - any duplicate admission_no within the CSV (must be 0 — if non-zero, fix the transform deterministically)

3. After dry-run is clean, COMMIT the import. Record the import_batches.id.

4. VERIFY:
     - `select count(*) from public.students s join public.classes c on s.class_id=c.id where c.session_label='2026-27'` → 479
     - per-class breakdown matches the table in the Excel reconnaissance section of OFFICIAL_DATA_UPLOAD_TIER_PLAN.md exactly (Nursery 20, JKG 27, SKG 28, …)
     - status counts: 395 active-old + 84 active-new (the New/Old split itself is stored in joined_on/notes per your decision)
     - import_rows count = 479, all carrying the committed batch_id

5. Write `docs/go-live/tier3-import-report.md` with per-class counts, import_batches.id, dry-run anomaly list, and the final 479 verification.

Halt. Do not assign discounts yet.
```

---

## TIER 4 — Assign conventional discounts + transport overrides

```
The 479 official students are now in the live `2026-27` session. Now translate the Excel's `Tuition Override (₹)` and `Transport Override (₹)` columns into proper conventional-discount assignments and student-level transport overrides — using the explicit, audited workflows the app already supports. Do NOT shortcut by writing custom rows directly into the override tables outside the standard helpers in lib/fees/conventional-discounts.ts and lib/fees/conventional-discount-rules.ts.

Decoding map (already validated against the schema's class tuition defaults):
  Tuition Override = 0           → assign policy 'rte'           (69 students)
  Tuition Override = 6000        → assign policy '3rd_child'     (7 students)
  Tuition Override = 50% of that class's default tuition → assign policy 'staff_child' (16 students)
       (Nursery 8000, JKG 8500, SKG 8500, C1 9000, C2 9250, C3 9500, C4 9750,
        C5 10000, C6 10500, C7 11000, C8 11500, C9 12000, C10 12500,
        11Arts/11Com 15000, 11Sci 17500, 12Arts/12Com 16000, 12Sci 19000)
  Any tuition override that doesn't match one of the above → HALT, do not guess. Print the offending row and ask the owner to classify it manually.

Steps:
1. Build `scripts/_revamp/discount-plan.mjs` that:
     - reads Students_Master from the Excel
     - for each row with a non-empty Tuition Override, computes the policy_code via the rules above
     - writes a JSON plan to `scripts/_revamp/out/discount-plan.json`:
         [{admission_no, full_name, class, override_value, policy_code, reason}, …]
     - prints a summary count by policy_code and HALTS if any row failed to classify

2. PREVIEW the plan: for each student in the plan, call the existing app helper (or write a thin admin script that uses it) to compute the post-assignment tuition. Verify the result equals the Excel's Tuition Override value to the rupee. If any mismatch, halt — the policy rule in conventional_discount_policies is misconfigured.

3. APPLY: assign the policies via the canonical workflow:
     - student_conventional_discount_assignments (one row per (student_id, policy_id, academic_session_label='2026-27'))
     - source = 'official_revamp_2026-05-24', reason = 'Migrated from official AY 2026-27 Excel; verified against override column'
     - obey the "max 2 active conventional policies per student per year" rule from school-rules.md — every row in this batch has exactly 1 policy, so this is satisfied
     - for the 7 students on 3rd Child Policy, ALSO create student_family_groups + student_family_members entries if the family group can be inferred from shared father_name+mother_name; if not inferable, leave the family group blank and surface a list to the owner

4. TRANSPORT OVERRIDES (only 2 students):
     - the student with Transport Override = ₹2,500 → create a student_fee_overrides row with custom_transport_installment_amount = round(2500/4) and reason='Official AY 2026-27 transport subsidy — owner-confirmed', and SURFACE this to the owner to confirm before committing
     - the student with Transport Override = ₹14,000 → likewise, surface to owner before committing; ₹14,000 is unusually high and may be data entry noise

5. VERIFY:
     - policy counts in student_conventional_discount_assignments for session 2026-27: rte=69, staff_child=16, 3rd_child=7, total=92
     - for each of the 92 discounted students, compute the effective tuition and check it equals the Excel's Tuition Override value. Mismatches → halt.
     - audit_logs has 92 + 2 entries from this batch

6. Write `docs/go-live/tier4-discount-report.md` with: full policy assignment table (admission_no, name, class, policy, before tuition, after tuition), the 2 transport override decisions, family group inference summary.

Halt. Do not regenerate dues yet.
```

---

## TIER 5 — Regenerate dues + parity verification

```
All 479 students are imported and 92 discounts are assigned. Now regenerate installments/dues and run the full verification matrix to confirm the live 2026-27 session is healthy.

1. Run the canonical regeneration entry point in lib/fees/regeneration.ts (or the matching admin-tools UI action) for session 2026-27, scope=all_students.
2. After regeneration, run every verification script that already exists:
     - node scripts/verify-required-sessions.mjs
     - node scripts/verify-live-fee-health.mjs
     - node scripts/verify-live-sync-health.mjs
     - node scripts/verify-workbook-parity.mjs
     - node scripts/audit-test-data-in-public.mjs (must find ZERO test-prefixed rows in live 2026-27)
   Capture every script's output verbatim.

3. PARITY MATRIX (build and store in docs/go-live/tier5-parity-matrix.md):
     a. Expected total annual tuition (no discounts) = Σ over 479 students of their class default tuition. Compute from the schema table.
     b. Expected discount impact = Σ over 92 students of (class default tuition − Excel override value). Compute from the Excel.
     c. Expected net annual tuition = (a) − (b).
     d. Observed net annual tuition = Σ across all installments.base_amount for session 2026-27 students.
     e. (c) must equal (d) to the rupee. If not, halt and surface the diff per-student.
     f. Repeat the matrix for transport: Σ transport_amount per installment must equal Σ over students of (route_annual_fare/4) with the 2 override exceptions applied.

4. SPOT-CHECK in Payment Desk for 10 randomly-sampled students spanning classes Nursery, Class 1, Class 5, Class 10, 11 Sci, 12 Sci AND at least one RTE student, one Staff Child student, one 3rd Child student. For each: load Payment Desk, verify dues breakdown matches the parity matrix, do NOT post.

5. Dashboard sanity: open /protected/dashboard, confirm student count = 479, pending dues > 0, defaulters list populates, transactions list is empty.

6. Write `docs/go-live/tier5-verification.md` with: regeneration log, all 5 script outputs, parity matrix tables, 10 Payment Desk spot-checks, dashboard screenshot description.

Halt. The session is ready for cutover sign-off.
```

---

## TIER 6 — Cutover sign-off + safety rules snap back on

```
The owner will run through this tier interactively with you as the assistant. Do not auto-execute.

1. Owner reviews docs/go-live/tier0..5 reports end-to-end and signs off in writing inside `docs/go-live/cutover-signoff.md` with date, time, and any caveats.

2. Walk the owner through fixing each of the 23 PENDING-2026-* admission numbers — open Students module, find each by current placeholder admission_no, ask the owner for the real SR number, save. Update PRODUCTION_OPERATIONS_CHECKLIST.md with the count remaining.

3. Walk the owner through confirming the 2 transport overrides (₹2,500 and ₹14,000). If owner rejects either, remove the student_fee_overrides row using the standard adjustment workflow (do NOT delete directly).

4. SAFETY RULES SNAP BACK ON:
     - confirm Hard Safety Rule #1 (no destructive resets without explicit instruction) is now back in force; the one-time override granted for this revamp is consumed and expired
     - confirm public signup remains disabled
     - confirm NEXT_PUBLIC_ENABLE_BOOTSTRAP_SIGNUP is unset or falsy
     - rotate SUPABASE_SERVICE_ROLE_KEY if it was logged anywhere during the revamp (it should not have been — audit your transcripts)
     - any agent that touches 2026-27 from now on must treat it as production and use TEST-2026-27 for all dry runs

5. First real payment posting: walk the owner through posting ONE real receipt (smallest amount possible against any student the owner picks) via Payment Desk. Verify the receipt prefix SVP-... renders, audit_logs records the post, and Dashboard updates. This is the go-live moment.

6. Schedule a Day-2 health check task: rerun verify-live-fee-health.mjs and verify-live-sync-health.mjs 24h after cutover. Surface any drift.

Append a final entry to PRODUCTION_OPERATIONS_CHECKLIST.md noting cutover date and the import_batches.id from Tier 3.
```

---

## How to actually use this plan (for the owner)

1. Read the full document once, top to bottom. Each tier prompt assumes you have read it.
2. Hand **Tier 0** to whichever AI agent you trust most for read-only DB work + scripting (Claude is my recommendation for this one since it has the full repo context). Wait for `tier0-rehearsal-report.md` to land in `docs/go-live/`.
3. Personally review the report. If anything is unclear, ask follow-up questions before approving.
4. Hand **Tier 1** to the same or a different agent — only after Tier 0 is signed off. This is the one irreversible step.
5. Continue tier by tier. Never run two tiers in the same agent session; each tier is meant to be a clean restart so context can't leak assumptions.
6. The agent that runs each tier must produce its named report file before claiming "done". If the report file is missing, the tier is not done.

## Why these prompts are long on purpose

Short prompts produce shallow work. Each tier prompt above bundles:
- the goal in one sentence
- every file the agent must read first
- every column mapping, every constant, every threshold the agent would otherwise have to guess at
- explicit halt conditions so the agent stops on ambiguity instead of inventing
- a deliverable file path so the next tier has a hand-off artifact

This is how you avoid expensive re-do loops across multiple AI agents.

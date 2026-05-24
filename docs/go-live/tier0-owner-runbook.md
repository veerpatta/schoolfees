# Tier 0 — Owner-only steps runbook

Three things from Tier 0 require credentials I (the assistant) do not have and must be run by you, Janmejay, on your own machine. They are listed below in execution order, with copy-pasteable commands.

> **Why owner-only:** the assistant in this Cowork session has full repo access but does not hold `SUPABASE_SERVICE_ROLE_KEY` or your Vercel/Supabase dashboard credentials. Production data export and live database writes cannot be delegated.

---

## Owner step 1 — Production backup (`pg_dump`)

Make a full restorable backup of the production database **before** you run any destructive tier (Tier 1).

### A. Get your Supabase connection string

1. Open the Supabase dashboard → Project Settings → Database → "Connection string" → tab **"URI"** → toggle **"Use connection pooling"** to OFF.
2. Copy the `postgres://…` URI. It will look like:
   `postgres://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
3. Replace `[YOUR-PASSWORD]` with the database password from Project Settings → Database → "Database password".

### B. Run pg_dump

In **PowerShell** on Windows (you must have PostgreSQL ≥ 15 client tools installed; if not, `winget install PostgreSQL.PostgreSQL`):

```powershell
$DATE = Get-Date -Format "yyyy-MM-dd"
$BACKUP_DIR = "C:\Users\janme\Documents\schoolfees\backups\pre-revamp-$DATE"
New-Item -ItemType Directory -Force -Path $BACKUP_DIR | Out-Null

$DB_URL = "postgres://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"

# Full schema + data
pg_dump --no-owner --no-privileges --format=plain --file="$BACKUP_DIR\full.sql" "$DB_URL"

# Data-only (faster restore for selective rollback)
pg_dump --no-owner --no-privileges --data-only --schema=public --format=plain --file="$BACKUP_DIR\data-only.sql" "$DB_URL"

# Compressed mirror for archival
pg_dump --no-owner --no-privileges --format=custom --file="$BACKUP_DIR\full.dump" "$DB_URL"

Get-ChildItem $BACKUP_DIR | Select-Object Name, Length
```

### C. Per-table CSV exports (belt-and-suspenders)

In the same PowerShell session:

```powershell
$TABLES = @(
  "students","receipts","payments","payment_adjustments","installments",
  "student_conventional_discount_assignments","student_fee_overrides",
  "import_batches","import_rows","academic_sessions","classes","transport_routes",
  "fee_policy_configs","conventional_discount_policies"
)
foreach ($t in $TABLES) {
  $out = "$BACKUP_DIR\$t.csv"
  psql "$DB_URL" -c "\copy (select * from public.$t) to '$out' csv header"
  Write-Host "Exported $t -> $out"
}
```

### D. Verify

```powershell
# Confirm full.sql restores cleanly into a scratch local Postgres (optional but recommended).
# At minimum: confirm file sizes are non-zero and the data-only.sql contains COPY statements.
Get-ChildItem $BACKUP_DIR -Recurse | Format-Table Name, Length
Select-String -Path "$BACKUP_DIR\data-only.sql" -Pattern "^COPY public\." | Measure-Object | Select-Object Count
```

### E. Tell the assistant

Drop a one-line confirmation: "Backup complete at `C:\Users\janme\Documents\schoolfees\backups\pre-revamp-YYYY-MM-DD\`, full.sql is N MB, table CSVs include {n} files." That unblocks Tier 1.

---

## Owner step 2 — UI commit of the rehearsal import into `TEST-2026-27`

The assistant produced two CSVs:

- `scripts/_revamp/out/students-rehearsal-test-2026-27.csv` — **use this one for the rehearsal** (admission numbers prefixed `TEST-` per repo rule for TEST-2026-27 students)
- `scripts/_revamp/out/students-live-2026-27.csv` — DO NOT upload yet; Tier 3 uses this against the live `2026-27` session

### A. Make sure TEST-2026-27 is the target session

1. Sign in to the live app as an `admin` (your `raj@vpps.co.in` account).
2. Open `/protected/admin-tools` (or `/protected/advanced`) and confirm the dropdown shows `TEST-2026-27` as a selectable session. If not, surface the blocker — Tier 0 cannot proceed.
3. Note the current row counts in TEST-2026-27 before importing (students, receipts, payments). Write them in the report.

### B. Upload + dry-run

1. Go to `/protected/imports`.
2. Choose mode = **Bulk Add**.
3. Set target session = **TEST-2026-27**.
4. Upload `scripts/_revamp/out/students-rehearsal-test-2026-27.csv`.
5. The auto-column-mapping screen should show **all 11 fields matched automatically with 0 unused headers** (the assistant verified this locally — if it doesn't, halt and screenshot the mapping screen). The mapped fields are: fullName, classLabel, admissionNo, dateOfBirth, fatherName, motherName, fatherPhone, motherPhone, transportRouteLabel, studentTypeOverride, notes.
6. Click "Run validation".
7. Expected anomaly count from the assistant's local pre-check:
     - **5 blocking errors** — duplicate admission numbers, listed below
     - **23 warnings** — PENDING-* placeholder admission numbers (acceptable; owner fills in later)
     - **10 warnings** — missing DOBs (acceptable; schema allows NULL)
     - **85 warnings** — students with no parent phone (acceptable but worth noting)
8. The 5 duplicates that MUST be resolved before committing (decide which row to keep / re-number / merge):

   | Excel row | SR no | Name | Class | Father |
   |---|---|---|---|---|
   | 50 | 2410 | VEDIKA | SKG | RAJESH ACCHERA |
   | 52 | 2410 | ISHIKA KUMAWAT | Class 1 | BHARAT KUMAWAT |
   | 81 | 2410 | MAHENUR BANO | Class 1 | MUBARIK ALI |
   | 401 | 202200012 | KAVISHA PALIWAL | Nursery | VIJAY PALIWAL |
   | 437 | 202200012 | Khushi Parmar | Class 3 | Narayan Lal Parmar |
   | 402 | 202200013 | NIKITA VERMA | Nursery | HARISH KUMAR VERMA |
   | 438 | 202200013 | Parth suthar | Class 3 | Govind suthar |
   | 406 | 202200016 | KUSAM REGAR | JKG | RAJESH REGAR |
   | 439 | 202200016 | VIVAN | Class 3 | SANDEEP GANDHI |

   The SR=2410 collision has THREE students. The 2022000-prefix collisions look like the Class 3 students reused old admission numbers — likely a data-entry mistake when promoting them.

   **Recommendation:** edit the SOURCE Excel directly, assign unique SRs (or `PENDING-…` placeholders) to the wrong-class students, and re-run the transform script. Do NOT fix duplicates by deleting rows in the UI mid-validation.

### C. After resolving duplicates: commit + verify in TEST-2026-27

1. Click "Approve all valid rows" and "Commit import".
2. Wait for the auto-prepare to settle (≈ 1 minute).
3. Verify in `/protected/students`:
     - filter by session TEST-2026-27
     - student count = 474 (479 minus 5 deduplicated) — or 479 if you re-SRd the duplicates
     - per-class breakdown matches the Tier 0 report
4. Verify in `/protected/payments` (Payment Desk):
     - pick any 3 rehearsal students (their admission no starts `TEST-`)
     - confirm the dues breakdown loads, the four installments show ₹X / 4 with the policy installment dates
     - DO NOT post any payment

### D. Record the batch id

Open Admin Tools → Import history → copy the `import_batches.id` for the committed rehearsal batch. Paste it into the rehearsal report.

---

## Owner step 3 — Payment Desk smoke test

In TEST-2026-27, with the rehearsal students imported:

1. Pick any 3 students spanning Nursery / Class 5 / Class 12 Science.
2. For each: open Payment Desk → confirm preview shows 4 installments matching the canonical schedule (20-04-2026, 20-07-2026, 20-10-2026, 20-01-2027).
3. For one of them, run a `Preview` of a partial payment (e.g. ₹5,000). Confirm the preview computes without error, allocates to installment 1, and shows remaining balance.
4. **Do NOT click Post.** The rehearsal is a read-only stress test.
5. Screenshot one preview screen for the rehearsal report (optional but useful for the audit trail).

---

## When all three steps are done

Append a single block to `docs/go-live/tier0-rehearsal-report.md` under the heading `## Owner sign-off`:

```
Owner: raj@vpps.co.in
Date/time: <yyyy-mm-dd hh:mm IST>
Backup path: C:\Users\janme\Documents\schoolfees\backups\pre-revamp-<date>\
full.sql size: <N MB>
Table CSV count: <N>
Source-Excel duplicates resolved: <yes / list of SRs renumbered>
Rehearsal batch id (TEST-2026-27): <uuid>
Rehearsal student count: <N>
Payment Desk smoke test: <pass / blocker>
READY FOR TIER 1: <yes / no — reason>
```

Once that block exists, Tier 1 is unblocked.

# Tier 0 — Rehearsal Report

**Tier:** 0 of 6 (Backup + dress rehearsal)
**Owner:** Janmejay (raj@vpps.co.in)
**Source file:** `Fees_Excel_Official_AY_2026-27_UPDATED_WITH_NEW_STUDENTS.xlsx`
**Assistant scope:** Repo-level engineering done. Three owner-only steps remain (pg_dump, UI commit into TEST-2026-27, Payment Desk smoke test) — see `tier0-owner-runbook.md`.
**Generated:** 2026-05-24

---

## TL;DR

| Check | Result |
|---|---|
| Transform script built | `scripts/_revamp/transform-excel-to-import-csv.mjs` |
| Local dry-run script built | `scripts/_revamp/local-dryrun.mjs` |
| Live CSV ready | `scripts/_revamp/out/students-live-2026-27.csv` (479 rows) |
| Rehearsal CSV ready | `scripts/_revamp/out/students-rehearsal-test-2026-27.csv` (479 rows, all `TEST-` prefixed) |
| Discount plan ready (Tier 4 input) | `scripts/_revamp/out/discount-plan.json` (94 entries: 69 RTE + 16 Staff Child + 7 Third Child + 2 transport overrides) |
| Route inventory ready (Tier 2 input) | `scripts/_revamp/out/route-inventory.json` (21 distinct routes) |
| Auto-column mapping | **11 / 11 fields auto-matched, 0 unused headers** — UI will require no manual mapping |
| Blocking errors | **5** — all are real duplicate admission numbers in the source Excel; owner must disambiguate |
| Acceptable warnings | 23 PENDING-SR placeholders + 10 missing DOBs + 85 missing parent phones |
| READY FOR TIER 1 | **Not yet** — pending: (a) owner backup, (b) source-Excel duplicate fix, (c) successful TEST-2026-27 commit, (d) Payment Desk smoke test |

---

## 1. What got built

### `scripts/_revamp/transform-excel-to-import-csv.mjs`

A pure read-only Node ESM script. Reads `Students_Master`, locates the header row by anchoring on the literal text "Student Name" in column A (defensive against banner rows shifting), and emits five artefacts:

- `students-rehearsal-test-2026-27.csv` — for Tier 0 owner step 2 (rehearsal commit into TEST-2026-27). Every admission number is prefixed `TEST-` per the repo's TEST-2026-27 rule.
- `students-live-2026-27.csv` — for Tier 3 (real `2026-27` commit). No prefix.
- `discount-plan.json` — sidecar consumed by Tier 4 to assign conventional discounts and transport overrides. Generated from the Excel's `Tuition Override (₹)` and `Transport Override (₹)` columns using the decoder:
    - override `0` → policy `rte`
    - override `6000` → policy `3rd_child`
    - override equal to 50 % of the class default tuition → policy `staff_child`
    - anything else → flagged as a blocking error so the owner reviews
- `route-inventory.json` — every distinct transport route value seen, with per-route student count, for Tier 2 to seed.
- `transform-report.md` — human-readable summary of the run.

CSV is written with a UTF-8 BOM (Hindi parent names are common — keeps Excel/LibreOffice happy on reopen) and CRLF line endings. RFC-4180 quoting for any cell containing commas, quotes, or newlines.

Class-name resolution reuses the alias map style from the existing `scripts/vpps-latest-excel-dry-run.mjs` so behavior is consistent with prior import work in this repo.

### `scripts/_revamp/local-dryrun.mjs`

Replicates the auto-mapping logic from `lib/import/mapping.ts` (same alias lists, same `normalizeImportKey` rule). Runs against the produced CSV and reports exactly what the live UI's auto-mapping screen will report. Also performs the row-level checks the live validation does: missing required fields, duplicate admission numbers, unmapped class names, malformed DOB, missing parent contact.

Output is structured JSON suitable for diffing against the live UI's validation report.

---

## 2. Transform result against the official Excel

```
[transform] reading: …/Fees_Excel_Official_AY_2026-27_UPDATED_WITH_NEW_STUDENTS.xlsx
[transform] found 479 student data rows (header row index 4)
[transform] wrote 479 rehearsal rows -> students-rehearsal-test-2026-27.csv
[transform] wrote 479 live rows -> students-live-2026-27.csv
[transform] wrote 94 discount entries -> discount-plan.json
[transform] wrote 21 routes -> route-inventory.json
[transform] errors=5 warnings=23
```

### Class breakdown (479 students)

| Class | Count |
|---|---|
| Nursery | 20 |
| JKG | 27 |
| SKG | 28 |
| Class 1 | 42 |
| Class 2 | 34 |
| Class 3 | 34 |
| Class 4 | 27 |
| Class 5 | 31 |
| Class 6 | 37 |
| Class 7 | 38 |
| Class 8 | 45 |
| Class 9 | 18 |
| Class 10 | 22 |
| 11 Arts | 20 |
| 11 Commerce | 14 |
| 11 Science | 5 |
| 12 Arts | 22 |
| 12 Commerce | 6 |
| 12 Science | 9 |
| **Total** | **479** |

### Status breakdown

- New: 84
- Existing (Old): 395

### Discount plan (consumed by Tier 4)

| Policy | Count |
|---|---|
| RTE (tuition = ₹0) | 69 |
| Staff Child (tuition = 50 % of class default) | 16 |
| 3rd Child Policy (tuition = ₹6,000) | 7 |
| **Subtotal — conventional** | **92** |
| Transport overrides | 2 |
| **Total entries in discount-plan.json** | **94** |

Every staff_child override value was independently verified against the canonical class tuitions in `supabase/schema.sql:2843-2861`. Zero unclassified tuition overrides.

### Transport route inventory (consumed by Tier 2 — **21 routes**, not 14 as the original plan estimated)

| Route | Students |
|---|---|
| Amet Bus | 74 |
| Amet City | 51 |
| Amet College Road (Colony Inside) | 22 |
| Karera | 19 |
| Kanji Ka Kedha | 8 |
| Banda | 8 |
| Bhopji Ka Kheda | 7 |
| Aidana | 6 |
| Dhelana | 5 |
| Gugli | 5 |
| Mund Koshiya | 4 |
| Agariya | 4 |
| Tanvan | 4 |
| Saprav | 4 |
| Ghosundi | 3 |
| Bhakroda | 3 |
| Amet College Side (On Road) | 3 |
| Agariya Kotari | 2 |
| Makarda | 2 |
| Amet Railway Station (Inside) | 2 |
| Selaguda | 1 |

Tier 2's transport-routes seed list must include all 21, not the 14 I originally estimated in the tier plan. **Action: when you run Tier 2, hand the agent `route-inventory.json` along with the route-annual-fare table from your previous AY 2026-27 transport sheet.** If the fare table is missing for any of these 21, that becomes a Tier-2 blocker.

---

## 3. Local dry-run results

### Against `students-rehearsal-test-2026-27.csv`

```
auto-map: 11/11 fields matched
missing required: (none)
unused headers: (none)
errors=5 warnings=95
errors by code: {"duplicate-admission":5}
warnings by code: {"no-parent-phone":85,"missing-dob":10}
```

### Against `students-live-2026-27.csv`

```
auto-map: 11/11 fields matched
missing required: (none)
unused headers: (none)
errors=5 warnings=118
errors by code: {"duplicate-admission":5}
warnings by code: {"no-parent-phone":85,"pending-sr-placeholder":23,"missing-dob":10}
```

**What this proves:** when the live UI auto-maps these CSVs, it will:
- match every column without asking the user to pick from a dropdown
- block on the 5 duplicate-admission errors (these are real data issues in the Excel)
- warn (non-blocking) on 23 PENDING-SR placeholders, 10 missing DOBs, 85 missing parent phones — all of which the schema permits

There are **no surprises** waiting in the live UI dry-run. Every error and warning the live UI will surface has already been catalogued here.

---

## 4. The 5 blocking duplicates (owner action required)

The Excel has 9 rows with reused admission numbers across 4 SR values:

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

Pattern observations:
- **SR 2410** is shared by THREE different students across SKG and Class 1 — looks like a clerical mistake when assigning new admissions.
- **SR 202200012 / 202200013 / 202200016** each appear once in a lower class (Nursery/JKG) and once in Class 3. The Class 3 rows look like they reused an old admission format incorrectly (the 202200* SRs look like 2022 admissions). Most likely the Class 3 trio needs new unique SRs (or PENDING placeholders if real SRs aren't known).

**Recommended action:** edit the source Excel directly, assign unique SRs (or leave blank for the transform to generate `PENDING-2026-NNNN`), then re-run the transform script. Do NOT try to fix these by editing rows inside the import UI mid-validation — that breaks the audit trail.

After you fix them, re-run:
```bash
node scripts/_revamp/transform-excel-to-import-csv.mjs --excel "<path>"
node scripts/_revamp/local-dryrun.mjs --csv scripts/_revamp/out/students-rehearsal-test-2026-27.csv
node scripts/_revamp/local-dryrun.mjs --csv scripts/_revamp/out/students-live-2026-27.csv
```
Both dry-runs must show `errors=0` before Tier 0 owner step 2 can complete.

---

## 5. Notable warnings (acceptable but worth knowing)

- **85 students have no parent phone.** Schema allows it, import will succeed, but you may want to chase parents for at least one contact before payment season starts. Filter the live CSV by `father phone == '' AND mother phone == ''` to get the list.
- **23 students have no SR number.** The transform assigns deterministic `PENDING-2026-0001`..`PENDING-2026-0023` placeholders so the import succeeds and you can fix them in the Students module afterwards.
- **10 students have no DOB.** Schema allows NULL; no impact on dues calculation.

---

## 6. Owner-only steps still required (see `tier0-owner-runbook.md`)

| # | What | Why I can't do it |
|---|---|---|
| 1 | `pg_dump` of production into `backups/pre-revamp-YYYY-MM-DD/` plus per-table CSVs | I do not hold `SUPABASE_SERVICE_ROLE_KEY` or the db password |
| 2 | Fix the 5 source-Excel duplicates → re-run transform → upload `students-rehearsal-test-2026-27.csv` into TEST-2026-27 via `/protected/imports` → commit → record `import_batches.id` | Requires authenticated browser session and a running Next.js instance |
| 3 | Payment Desk preview smoke-test on 3 rehearsal students | Same — needs the live app |

Detailed copy-paste commands are in `tier0-owner-runbook.md`.

---

## 7. Artefacts produced this tier

```
scripts/_revamp/
  transform-excel-to-import-csv.mjs        # 450 lines, ESM, no DB dependency
  local-dryrun.mjs                         # 160 lines, ESM, no DB dependency
  out/
    students-live-2026-27.csv              # 479 rows, BOM, CRLF
    students-rehearsal-test-2026-27.csv    # 479 rows, TEST- prefix, BOM, CRLF
    discount-plan.json                     # 94 entries
    route-inventory.json                   # 21 entries
    transform-report.md                    # machine-readable summary
    local-dryrun-students-live-2026-27.json
    local-dryrun-students-rehearsal-test-2026-27.json

docs/go-live/
  OFFICIAL_DATA_UPLOAD_TIER_PLAN.md        # master plan (already existed)
  tier0-rehearsal-report.md                # THIS FILE
  tier0-owner-runbook.md                   # owner-step instructions
```

---

## 8. Status: not yet ready for Tier 1

Tier 1 (destructive reset) cannot start until ALL of the following are true:

- [ ] Owner has run pg_dump and confirmed file sizes are non-zero
- [ ] Owner has fixed the 5 duplicate admission numbers in the source Excel
- [ ] Owner has re-run the transform script and confirmed `errors=0` on both dry-runs
- [ ] Owner has uploaded and committed the rehearsal CSV into TEST-2026-27 successfully
- [ ] Owner has recorded the rehearsal `import_batches.id`
- [ ] Owner has done the 3-student Payment Desk preview smoke test
- [ ] Owner has appended the sign-off block (template in `tier0-owner-runbook.md`) to THIS file

Once that block is here, the assistant (or any agent you hand Tier 1 to) is unblocked.

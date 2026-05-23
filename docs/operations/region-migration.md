# Region Migration Runbook — Sydney (`ap-southeast-2`) → Mumbai (`ap-south-1`)

**Status: COMPLETED — 2026-05-23**

Migration is fully done. The live app runs on Mumbai. Sydney is paused.

| Item | Value |
|---|---|
| Live project | `vgqyilgstjvgohrsiwkb` — ap-south-1 (Mumbai) |
| Sydney project | `lsdrvovwybzspcvbdcir` — ap-southeast-2 (Sydney) — **PAUSED** |
| Migrations applied | 65/65 |
| Data parity (aggregate hash) | `70c2a4e2452f828c2b4d65069b3a31aa` — source and target matched |
| Tables verified | 37 public tables |
| Records migrated | 694 students, 72 payments, 49 receipts, 3 staff auth users |
| Cutover completed | Vercel env vars swapped, redeployed, verified live |
| Sydney status | Paused — keep until 2026-06-23, then delete after final backup |

The runbook below is preserved for historical reference.

**Why:** Supabase project region is fixed at creation. Users are in India.
Current latency from India → Sydney is ~150 ms RTT; from India → Mumbai it is
~20–30 ms. Every page in the admin app makes 3–4 sequential round-trips
(middleware auth, layout auth, `app_settings`, then page data), so this cut
alone removes roughly **half a second of dead time per navigation** —
independent of any other optimization.

**Owner:** raj@vpps.co.in
**Estimated cutover window:** 30–60 minutes of read-only / write-frozen time.

---

## 0. Hard rules

1. Production has live `2026-27` student financial data. No step touches it
   until the Mumbai project is byte-equal under verification.
2. The Sydney project is **paused, not deleted** for at least 4 weeks after
   cutover. It is the rollback path.
3. All commands below assume PowerShell on Windows. Where a command produces a
   secret or dump file, store it under `./.region-migration/` (already in
   `.gitignore` via `*` patterns — verify before running).
4. Two service-role keys exist in this runbook: `SOURCE_*` (Sydney) and
   `TARGET_*` (Mumbai). Never confuse them. Recommend two separate terminals
   with different prompt colors.

---

## 1. Pre-flight checks (no production impact)

### 1.1 Verify Mumbai availability

In the Supabase dashboard → New Project, confirm `ap-south-1 (Mumbai)`
is offered for your billing plan. If only Singapore (`ap-southeast-1`) is
available, Singapore is still a major improvement (~80 ms RTT vs 150 ms);
note the choice here.

**Chosen target region:** `_____________` (fill in)

### 1.2 Capture current state

```powershell
# In a scratch terminal, against the SOURCE (Sydney) project:
$env:SOURCE_DB_URL = "postgres://postgres.<sydney-project-ref>:<password>@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres"

# Confirm you can connect and see expected row counts
psql $env:SOURCE_DB_URL -c "select count(*) from public.students;"
psql $env:SOURCE_DB_URL -c "select count(*) from public.payments;"
psql $env:SOURCE_DB_URL -c "select count(*) from public.receipts;"
psql $env:SOURCE_DB_URL -c "select count(*) from auth.users;"
```

Record the counts here — they are the cutover acceptance criteria:

| Table | Source rows | Target rows (post-restore) |
|---|---|---|
| `public.students` | _____ | _____ |
| `public.payments` | _____ | _____ |
| `public.receipts` | _____ | _____ |
| `public.payment_adjustments` | _____ | _____ |
| `public.fee_settings` | _____ | _____ |
| `public.fee_policy_configs` | _____ | _____ |
| `auth.users` | _____ | _____ |

### 1.3 Capture current secrets

In Vercel → project settings → Environment Variables, screenshot or copy
the current values of:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

You need these on hand for the rollback step in §5.

---

## 2. Build the Mumbai project (parallel to live; no production impact)

### 2.1 Create the new project

Supabase dashboard → New Project:

- Name: `vpps-schoolfees-mumbai` (or your convention)
- Region: `ap-south-1 (Mumbai)` (or chosen target)
- Postgres password: generate fresh, save to a password manager
- Plan: same as current

Capture:

- Project ref: `<mumbai-project-ref>`
- Anon (publishable) key: `<…>`
- Service-role key: `<…>`
- DB connection string: `postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`

### 2.2 Apply schema via migrations

```powershell
# from repo root
supabase link --project-ref <mumbai-project-ref>
# enter Mumbai DB password when prompted
supabase db push
```

This applies all 65 migrations from `supabase/migrations/` in order. Verify:

```powershell
$env:TARGET_DB_URL = "postgres://postgres.<mumbai-project-ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
psql $env:TARGET_DB_URL -c "select count(*) from supabase_migrations.schema_migrations;"
# should equal the count in Sydney
```

### 2.3 Dump data from Sydney

```powershell
# Schema-aware data-only dump of the public schema
pg_dump $env:SOURCE_DB_URL `
  --data-only `
  --schema=public `
  --no-owner `
  --no-privileges `
  --file=.region-migration/sydney-data.sql

# Auth users — special handling, see 2.5
pg_dump $env:SOURCE_DB_URL `
  --data-only `
  --schema=auth `
  --table=auth.users `
  --table=auth.identities `
  --no-owner `
  --no-privileges `
  --file=.region-migration/sydney-auth.sql
```

Sanity check the dump file size against expectations — if it's only a few KB
on a school with hundreds of students, something is wrong.

### 2.4 Restore to Mumbai

```powershell
# Disable triggers during restore to avoid side-effects from matview-refresh
# triggers and audit triggers. Re-enabled by the dump's COPY blocks.
psql $env:TARGET_DB_URL -c "set session_replication_role = replica;"
psql $env:TARGET_DB_URL -f .region-migration/sydney-data.sql
psql $env:TARGET_DB_URL -c "set session_replication_role = origin;"

# Refresh materialized views once after the bulk insert
psql $env:TARGET_DB_URL -c "refresh materialized view concurrently public.<each_matview>;"
# (List the matviews from 20260523130000_materialized_financial_views.sql)
```

### 2.5 Migrate auth users

Two paths — pick one:

**Path A — SQL restore (preserves user IDs and password hashes; recommended).**
Auth schema restore is fragile because the Mumbai project already has its own
`auth.*` rows for the service-role/anon API users. Restore *only* the
custom rows:

```sql
-- in psql against TARGET_DB_URL
-- adapt the WHERE to match how you identify real staff users
\i .region-migration/sydney-auth.sql
```

This preserves `auth.users.id`, so the `public.users` rows (which reference
`auth.users.id`) remain linked. The staff sync trigger (migration
`20260421203000_staff_auth_sync`) does not need to refire.

**Path B — Re-invite (simpler, but resets passwords).**
If Path A fails or feels too risky, drop the auth rows and re-invite each
staff member. The `users` table FK then has to be re-stitched to the new
`auth.users.id` values. **Only viable if you can coordinate password resets
with every staff member.** Not recommended for a same-day cutover.

### 2.6 Run the parity check

```powershell
node scripts/compare-supabase-projects.mjs `
  --source $env:SOURCE_DB_URL `
  --target $env:TARGET_DB_URL
```

This script (see `scripts/compare-supabase-projects.mjs`) compares row counts
and content checksums for every table in `public`. **All tables must show
`MATCH`** before proceeding to cutover. If anything mismatches, fix it on the
Mumbai side and rerun — never on Sydney.

### 2.7 Smoke-test the Mumbai project against a staging deployment

Create a Vercel preview deployment with the Mumbai env vars and click through:

- Login as `raj@vpps.co.in`
- Dashboard renders, KPIs match Sydney production
- Students list shows correct count and a known student's details
- Payment Desk loads a known student and the projection matches Sydney
- Transactions tab lists recent receipts
- Defaulters list matches Sydney

If anything diverges, stop. Do not proceed to cutover.

---

## 3. Cutover window (production-impacting — coordinate timing)

Pick a low-traffic window (early morning or weekend). Announce to staff.

### 3.1 Freeze writes on Sydney

Easiest option: in Vercel, set env var `MAINTENANCE_MODE=true` and redeploy.
If a maintenance-mode middleware is not in place yet, the lower-effort
fallback is:

```sql
-- Against SOURCE_DB_URL — make payments table read-only
alter table public.payments add constraint freeze_writes check (false) not valid;
-- (Do NOT validate — keeps existing rows valid, blocks new inserts/updates.)
-- Repeat for any other write-target table you want to freeze, OR just
-- communicate to staff that no one should post payments for the next hour.
```

The cleanest path is to add a `freezeWrites()` middleware behind an env flag
*before* this runbook is ever executed — that is a separate prep PR.

### 3.2 Final delta dump

Any rows posted in Sydney between §2.3 and now have to be carried over.

```powershell
pg_dump $env:SOURCE_DB_URL `
  --data-only `
  --schema=public `
  --table=public.payments `
  --table=public.receipts `
  --table=public.payment_adjustments `
  --table=public.office_sync_events `
  --no-owner `
  --where="created_at > '<timestamp-of-2.3-dump>'" `
  --file=.region-migration/sydney-delta.sql

psql $env:TARGET_DB_URL -f .region-migration/sydney-delta.sql
```

Re-run §2.6 parity check. Must show `MATCH`.

### 3.3 Update Vercel env vars

In Vercel → Environment Variables, swap:

- `NEXT_PUBLIC_SUPABASE_URL` → Mumbai project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → Mumbai anon key
- `SUPABASE_SERVICE_ROLE_KEY` → Mumbai service-role key

Trigger a redeploy. Wait for it to go live.

### 3.4 Verify

- Hit the live URL incognito, log in, do a quick read of Dashboard / Students
- Post a single small test payment against a `TEST-` admission number to
  confirm writes work
- Watch the Mumbai project's Logs panel for errors for ~10 minutes

### 3.5 Lift the freeze

Remove `MAINTENANCE_MODE` (or the `check (false)` constraint if you used that
fallback). Announce all-clear.

---

## 4. Post-cutover

- Pause the Sydney project in the dashboard (do not delete)
- For 1 week, keep the Sydney URL/keys ready as rollback
- After 4 weeks of clean operation, archive a final Sydney dump to long-term
  storage and delete the Sydney project

---

## 5. Rollback (only if cutover fails before §3.5)

If at any point during §3 the Mumbai project misbehaves:

1. In Vercel, revert env vars to the captured Sydney values from §1.3
2. Trigger a redeploy
3. Lift the write-freeze on Sydney (drop the `check (false)` constraint)
4. Open an incident note in `docs/history/` describing what failed
5. Mumbai project stays as-is for forensic analysis — do not delete

Rollback after §3.5 (writes resumed on Mumbai) is much harder because new
writes diverge. At that point treat any rollback as a fresh migration in the
opposite direction.

---

## 6. Verification script reference

Run by `node scripts/compare-supabase-projects.mjs --source <url> --target <url>`.

Output for each public-schema table:

- `MATCH count=N hash=...` — row count and content checksum agree
- `MISMATCH count_source=N count_target=M` — investigate before cutover

The script connects via the `postgres` package (already in `package.json`),
not via the Supabase JS client, because it needs to run arbitrary SQL across
both projects.

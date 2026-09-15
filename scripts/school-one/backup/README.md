# Off-platform backups

The school's data, encrypted, in two places that are not Supabase — and a
monthly proof that it restores.

Supabase takes its own backups and they are good. They are also in the same
account as the database, so one billing lapse, one compromised login or one
mistaken project deletion takes the database and its backups together. These
workflows exist for that day, and for the more likely one where somebody needs
last March rather than last night.

## Status: inert until turned on

Both workflows are gated:

```yaml
if: vars.SCHOOLONE_BACKUPS_ENABLED == 'true'
```

Until that repository variable exists they sit on `main` and do nothing. That is
deliberate: a nightly job that fails at 01:00 every night because its secrets do
not exist yet teaches everybody to ignore a red X, and then the first real
failure is invisible too.

**To turn them on**, after runbook section C (C1–C8) is complete:

1. Settings → Secrets and variables → Actions → **Variables** →
   `SCHOOLONE_BACKUPS_ENABLED` = `true`.
2. Actions → *Nightly off-platform backup* → **Run workflow**. The `backup`
   environment needs a reviewer, so approve it.
3. Check `backup_runs` for a row with `verified = true`.
4. Actions → *Monthly restore drill* → **Run workflow**, against that backup.
5. Only then tick the Phase 0 exit checklist.

## What runs, and when

| Workflow | Schedule | What it does |
|---|---|---|
| `backup-nightly.yml` | 19:30 UTC daily (01:00 IST) | dump → manifest → encrypt → upload to Drive **and** R2 → verify → report |
| `backup-restore-drill.yml` | 21:00 UTC on the 1st (02:30 IST) | pull newest from R2 → decrypt → checksum → restore → compare invariants → report |

01:00 IST is after the automatic day close at 00:00 IST, so the backup contains
a closed day rather than one mid-flight.

## The four artefacts

| File | Why it exists |
|---|---|
| `roles.sql` | Restoring data into a database whose roles do not exist gives permission errors and a schema that half works. |
| `schema.sql` | The structure, readable. What somebody greps at 2am. |
| `data.sql` | Plain `COPY`. Slower to restore than custom format, but recoverable with nothing but `psql`. |
| `public.dump` | `pg_dump -Fc`. What the drill restores: selective, parallel, and it survives version skew. |
| `manifest.json` | **Not encrypted.** Sizes, SHA-256s, row counts, the migrations SHA. No student data, so it can be read without the key — which is what makes "is there a good backup of last Tuesday" answerable. |

Belt and braces on purpose. The cost is a few hundred MB; the alternative is
finding out on the worst day of the year that the one format taken is the one
that will not restore.

## Where files land

```
daily/<YYYY-MM-DD>/     every night, kept 14 days
weekly/<YYYY-MM-DD>/    Sundays, kept 56 days
monthly/<YYYY-MM-DD>/   the 1st, kept 730 days
```

In both `gdrive:` (the `VPPS-SchoolOne-Backups` Shared Drive) and
`r2:vpps-schoolone-backups`. Retention is D-9.

Pruning runs **only after both destinations verify**. Deleting an old backup
because a new one "arrived" when it did not is how a retention policy eats the
thing it was protecting.

## Two keys, and why

| Key | Private half lives | Used for |
|---|---|---|
| `BACKUP_AGE_RECIPIENT` | Janmejay's password manager **and** one printed copy in the school safe (D-10) | opening the real recovery copy |
| `BACKUP_DRILL_AGE_RECIPIENT` | a GitHub secret | the monthly drill |

Every file is encrypted to both. The split means the unattended drill can prove
the backup restores without CI ever holding the key that opens the school's own
recovery copy.

## Opening a backup on a laptop

```bash
rclone copy r2:vpps-schoolone-backups/daily/2026-09-16 ./restore
cd ./restore
age -d -i /path/to/school-recovery.key -o public.dump public.dump.age
pg_restore --dbname "postgres://…" --no-owner --no-privileges public.dump
```

`manifest.json` is already readable; check its `sha256` values against the files
before trusting a restore.

## Reading the drill's result

`backup_runs` carries a row per run of either workflow:

```sql
select ran_at, kind, verified, notes, dump_bytes
from public.backup_runs
order by ran_at desc
limit 10;
```

`verified = true` on a `nightly` row means `rclone check` re-read every file from
**both** destinations. On a `restore_drill` row it means every row count and
money total in the restored database matched the manifest exactly.

The drill reports whether it passed **or failed**. A drill that only records its
successes tells you nothing on the month it matters.

## Testing the compare step without waiting a month

The drill's value rests entirely on `compare-invariants.mjs` actually failing
when the numbers differ. To check that by hand:

```bash
# take a real manifest, change one number, and confirm the comparison fails
cp ./drill/manifest.json /tmp/manifest-corrupt.json
node -e '
  const fs=require("node:fs");
  const m=JSON.parse(fs.readFileSync("/tmp/manifest-corrupt.json","utf8"));
  m.invariants[0].value = m.invariants[0].value + 1;
  fs.writeFileSync("/tmp/manifest-corrupt.json", JSON.stringify(m));
'
node scripts/school-one/backup/compare-invariants.mjs \
  /tmp/manifest-corrupt.json ./drill/restored-invariants.csv
# expect: exit 1 and a table naming the mismatched invariant
```

## Deprecation

**The existing `/api/cron/nightly-backup` route is deprecated and will be
removed after the first successful restore drill.** It writes five CSVs into a
Supabase Storage bucket in the same project as the database, capped at 50,000
rows a table, with no encryption and no verification — which is a convenience
copy, not a backup. It keeps running until these workflows have proved
themselves once, and not longer.

## Secrets these workflows need

All in the GitHub `backup` environment (runbook C7):

`SUPABASE_PROD_DB_URL` · `BACKUP_AGE_RECIPIENT` · `BACKUP_DRILL_AGE_RECIPIENT` ·
`BACKUP_DRILL_AGE_IDENTITY` · `GDRIVE_SA_JSON` · `GDRIVE_SHARED_DRIVE_ID` ·
`R2_ACCOUNT_ID` · `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` · `R2_BUCKET` ·
`JOB_SECRET_BACKUP_REPORT` · `SCHOOLFEES_BASE_URL`

No secret is ever echoed. `dump.sh` never prints the connection string, never
uses `set -x`, and discards `pg_dump`'s stderr rather than printing it — a libpq
error can contain the URL. `upload.sh` configures rclone entirely from the
environment so no credential is written to disk.

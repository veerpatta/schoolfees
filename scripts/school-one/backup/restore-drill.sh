#!/usr/bin/env bash
#
# Restore last night's backup into a throwaway database and check the numbers
# came back.
#
#   ./restore-drill.sh            # needs DRILL_DB_URL pointing at the scratch DB
#
# A backup nobody has restored is a hypothesis. This is the experiment, and it
# runs monthly without anybody remembering to run it, because the month it is
# most needed is the month nobody thought to check.
#
# It reads from R2 rather than Google Drive on purpose: R2 is the machine-facing
# copy, and reading the one the school does not touch means a drill cannot be
# passed by a file somebody happened to re-upload by hand.

set -euo pipefail

: "${DRILL_DB_URL:?DRILL_DB_URL is not set}"
: "${BACKUP_DRILL_AGE_IDENTITY:?BACKUP_DRILL_AGE_IDENTITY is not set}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is not set}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is not set}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is not set}"
: "${R2_BUCKET:?R2_BUCKET is not set}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${WORK_DIR:-./drill}"

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

mkdir -p "$WORK_DIR"

# --- 1. The newest daily folder ----------------------------------------------
LATEST="$(rclone lsf "r2:${R2_BUCKET}/daily" --dirs-only | sed 's#/$##' | sort | tail -1)"

if [ -z "$LATEST" ]; then
  echo "No daily/ folders in R2. There is nothing to drill, which is itself the finding." >&2
  exit 1
fi

echo "Drilling against daily/${LATEST}"
rclone copy "r2:${R2_BUCKET}/daily/${LATEST}" "$WORK_DIR" --stats-one-line --retries 3

# --- 2. Decrypt ---------------------------------------------------------------
IDENTITY_FILE="$(mktemp)"
trap 'rm -f "$IDENTITY_FILE"' EXIT
printf '%s' "$BACKUP_DRILL_AGE_IDENTITY" > "$IDENTITY_FILE"
chmod 600 "$IDENTITY_FILE"

for encrypted in "$WORK_DIR"/*.age; do
  [ -e "$encrypted" ] || continue
  plain="${encrypted%.age}"
  age -d -i "$IDENTITY_FILE" -o "$plain" "$encrypted"
done

# --- 3. Checksums -------------------------------------------------------------
#
# Before restoring, not after. A dump that arrived corrupted and a dump that
# restored wrong look identical once pg_restore has had a go at it.
node -e '
  const { createHash } = require("node:crypto");
  const { readFileSync, existsSync } = require("node:fs");
  const dir = process.argv[1];
  const manifest = JSON.parse(readFileSync(dir + "/manifest.json", "utf8"));
  let bad = 0;
  for (const file of manifest.files) {
    const path = dir + "/" + file.name;
    if (!existsSync(path)) { console.error("MISSING " + file.name); bad++; continue; }
    const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (actual !== file.sha256) { console.error("CHECKSUM " + file.name); bad++; }
    else { console.log("ok " + file.name); }
  }
  if (bad) { console.error(bad + " file(s) failed verification."); process.exit(1); }
' "$WORK_DIR"

# --- 4. Restore ---------------------------------------------------------------
#
# Deliberately NOT --exit-on-error. A Supabase dump restored into a plain
# Postgres always produces noise in the pre/post sections: roles that do not
# exist, extensions owned by superuser, policies referencing auth.* helpers. None
# of that means the DATA failed to arrive, and stopping on the first one would
# make the drill report a red result every month for reasons nobody can fix.
#
# So: collect everything, then judge only the data section.
RESTORE_LOG="${WORK_DIR}/pg_restore.log"

pg_restore \
  --dbname "$DRILL_DB_URL" \
  --no-owner --no-privileges \
  -n public \
  --verbose \
  "$WORK_DIR/public.dump" > "$RESTORE_LOG" 2>&1 || true

DATA_ERRORS="$(grep -ciE 'error:.*(COPY|TABLE DATA|constraint|duplicate key)' "$RESTORE_LOG" || true)"
TOTAL_ERRORS="$(grep -ci 'error:' "$RESTORE_LOG" || true)"

echo "pg_restore finished: ${TOTAL_ERRORS} error line(s), ${DATA_ERRORS} in the data section."

if [ "${DATA_ERRORS:-0}" -gt 0 ]; then
  echo "Data-section errors mean rows did not arrive. Failing." >&2
  grep -iE 'error:.*(COPY|TABLE DATA|constraint|duplicate key)' "$RESTORE_LOG" | head -20 >&2
  exit 1
fi

# --- 5. The same invariants, against the restored copy ------------------------
psql "$DRILL_DB_URL" \
  --csv --quiet --no-psqlrc \
  -v ON_ERROR_STOP=1 \
  -f "${SCRIPT_DIR}/invariants.sql" \
  > "${WORK_DIR}/restored-invariants.csv"

echo "Restored invariants written."
echo "RESTORE_DRILL_SOURCE=${LATEST}" >> "${GITHUB_ENV:-/dev/null}"

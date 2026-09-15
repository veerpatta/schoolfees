#!/usr/bin/env bash
#
# Put the night's backup in two places, check it arrived, and prune what has
# aged out.
#
#   ./upload.sh ./out/2026-09-16
#
# Two destinations on different companies' infrastructure, on purpose. A backup
# that lives only in the same account as the thing it is backing up is a copy,
# not a backup: a billing problem, a compromised login or a mistaken deletion
# takes both at once. Google Drive is where the school can reach it without a
# technical person; R2 is where the drill reads it from.
#
# Both must succeed. A night where one worked is a night with one copy, and the
# job says so by failing.
#
# rclone is configured entirely from the environment — no config file is ever
# written, so no credential lands on disk for a later step to pick up.

set -euo pipefail

OUT_DIR="${1:?Usage: upload.sh <out-dir>}"
DATE="$(basename "$OUT_DIR")"

: "${GDRIVE_SHARED_DRIVE_ID:?GDRIVE_SHARED_DRIVE_ID is not set}"
: "${GDRIVE_SA_JSON:?GDRIVE_SA_JSON is not set}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is not set}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is not set}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is not set}"
: "${R2_BUCKET:?R2_BUCKET is not set}"

export RCLONE_CONFIG_GDRIVE_TYPE=drive
export RCLONE_CONFIG_GDRIVE_SCOPE=drive
export RCLONE_CONFIG_GDRIVE_SERVICE_ACCOUNT_CREDENTIALS="$GDRIVE_SA_JSON"
export RCLONE_CONFIG_GDRIVE_TEAM_DRIVE="$GDRIVE_SHARED_DRIVE_ID"
export RCLONE_CONFIG_GDRIVE_ROOT_FOLDER_ID="$GDRIVE_SHARED_DRIVE_ID"

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

# Quiet enough that a secret cannot appear, loud enough to see what moved.
RCLONE_FLAGS=(--stats-one-line --retries 3 --low-level-retries 10)

DAY_OF_WEEK="$(date -u -d "$DATE" +%u 2>/dev/null || date -u +%u)"   # 7 = Sunday
DAY_OF_MONTH="$(date -u -d "$DATE" +%d 2>/dev/null || date -u +%d)"

TARGETS=("daily/${DATE}")
[ "$DAY_OF_WEEK" = "7" ] && TARGETS+=("weekly/${DATE}")
[ "$DAY_OF_MONTH" = "01" ] && TARGETS+=("monthly/${DATE}")

echo "Uploading ${DATE} to: ${TARGETS[*]}"

VERIFIED=1

for remote in "gdrive:" "r2:${R2_BUCKET}"; do
  for target in "${TARGETS[@]}"; do
    echo "→ ${remote}/${target}"
    rclone copy "$OUT_DIR" "${remote}/${target}" "${RCLONE_FLAGS[@]}"

    # copy returning 0 means the transfer was accepted, not that the bytes are
    # readable back. `check` re-reads and compares; it is the difference between
    # an upload and a backup.
    if ! rclone check "$OUT_DIR" "${remote}/${target}" --one-way "${RCLONE_FLAGS[@]}"; then
      echo "VERIFY FAILED: ${remote}/${target}" >&2
      VERIFIED=0
    fi
  done
done

if [ "$VERIFIED" -ne 1 ]; then
  echo "At least one destination did not verify. Failing the job." >&2
  exit 1
fi

# --- Retention ---------------------------------------------------------------
#
# 14 daily / 8 weekly / 24 monthly (D-9). Pruning runs only after every
# destination verified: deleting an old backup because a new one "arrived" when
# it did not is how a retention policy eats the thing it was protecting.
prune() {
  local remote="$1" prefix="$2" age="$3"
  echo "Pruning ${remote}/${prefix} older than ${age}"
  rclone delete "${remote}/${prefix}" --min-age "$age" "${RCLONE_FLAGS[@]}" || true
  rclone rmdirs "${remote}/${prefix}" --leave-root "${RCLONE_FLAGS[@]}" || true
}

for remote in "gdrive:" "r2:${R2_BUCKET}"; do
  prune "$remote" "daily" "14d"
  prune "$remote" "weekly" "56d"
  prune "$remote" "monthly" "730d"
done

echo "Upload and verification complete for ${DATE}."

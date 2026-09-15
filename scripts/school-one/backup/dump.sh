#!/usr/bin/env bash
#
# Take the night's logical backup of the production database.
#
#   ./dump.sh              # writes ./out/<YYYY-MM-DD>/
#
# Needs SUPABASE_PROD_DB_URL in the environment. That value is NEVER echoed,
# never passed as a visible argument where a log would catch it, and never
# written into any file this produces — `set -x` is deliberately not used
# anywhere in this script for the same reason.
#
# Four artefacts, because they answer different questions:
#
#   roles.sql    the database's roles. Restoring data into a database whose
#                roles do not exist gives a heap of permission errors and a
#                schema that half works.
#   schema.sql   the structure, readable. This is what somebody greps at 2am.
#   data.sql     plain COPY statements. Slower to restore than a custom dump
#                but readable and diffable, and recoverable with nothing but
#                psql if pg_restore is not to hand.
#   public.dump  pg_dump custom format. The one the restore drill actually
#                uses: parallel restore, selective restore, and it survives a
#                version skew that plain SQL would not.
#
# Belt and braces on purpose. The cost is disk space for a few hundred MB; the
# alternative is discovering on the worst day of the year that the one format
# taken is the one that will not restore.

set -euo pipefail

: "${SUPABASE_PROD_DB_URL:?SUPABASE_PROD_DB_URL is not set}"

DATE="$(date -u +%Y-%m-%d)"
OUT_DIR="${OUT_DIR:-./out/${DATE}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$OUT_DIR"

echo "Dumping to ${OUT_DIR} (target host not printed)"

# --- 1. Roles -----------------------------------------------------------------
supabase db dump --db-url "$SUPABASE_PROD_DB_URL" --role-only -f "${OUT_DIR}/roles.sql"

# --- 2. Schema ----------------------------------------------------------------
supabase db dump --db-url "$SUPABASE_PROD_DB_URL" -f "${OUT_DIR}/schema.sql"

# --- 3. Data ------------------------------------------------------------------
supabase db dump --db-url "$SUPABASE_PROD_DB_URL" --data-only --use-copy -f "${OUT_DIR}/data.sql"

# --- 4. Custom-format dump ----------------------------------------------------
#
# auth and storage are Supabase-managed schemas and a hosted project may refuse
# them to a non-superuser. That refusal must not lose the night's backup, so the
# fallback is public alone — and the manifest records which of the two happened,
# because "we have a backup" and "we have a backup of the application tables
# only" are different sentences on restore day.
SCHEMA_SCOPE="public+auth+storage"

if ! pg_dump "$SUPABASE_PROD_DB_URL" \
      --format=custom --no-owner --no-privileges \
      -n public -n auth -n storage \
      -f "${OUT_DIR}/public.dump" 2> "${OUT_DIR}/.pg_dump.err"; then
  echo "Full-schema dump refused; retrying with public only." >&2
  # Do not print .pg_dump.err: a libpq error can echo the connection string.
  SCHEMA_SCOPE="public"
  pg_dump "$SUPABASE_PROD_DB_URL" \
    --format=custom --no-owner --no-privileges \
    -n public \
    -f "${OUT_DIR}/public.dump" 2> "${OUT_DIR}/.pg_dump.err"
fi

rm -f "${OUT_DIR}/.pg_dump.err"
echo "$SCHEMA_SCOPE" > "${OUT_DIR}/.schema-scope"

# --- 5. Invariants ------------------------------------------------------------
#
# Read-only. These are the numbers the restore drill compares against, and the
# reason a restore can be called verified rather than merely completed.
psql "$SUPABASE_PROD_DB_URL" \
  --csv --quiet --no-psqlrc \
  -v ON_ERROR_STOP=1 \
  -f "${SCRIPT_DIR}/invariants.sql" \
  > "${OUT_DIR}/invariants.csv"

echo "Dump complete:"
ls -la "$OUT_DIR"

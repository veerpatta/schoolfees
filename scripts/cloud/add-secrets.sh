#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# add-secrets.sh — merge KEY=VALUE lines into the vault without echoing them.
#
#   bash scripts/cloud/add-secrets.sh <<'EOF'
#   GITHUB_TOKEN=github_pat_...
#   VERCEL_TOKEN=...
#   EOF
#
# Existing keys are replaced, not duplicated. Values are quoted on the way in,
# because the school name has spaces in it and an unquoted vault stops being
# sourceable the moment one value does. Prints names only, never values.
# ---------------------------------------------------------------------------
set -euo pipefail

VAULT="${VEERPATTA_VAULT:-$HOME/.veerpatta/secrets.env}"
mkdir -p "$(dirname "$VAULT")"; chmod 700 "$(dirname "$VAULT")"
touch "$VAULT"; chmod 600 "$VAULT"

added=(); skipped=0
while IFS= read -r line || [ -n "$line" ]; do
  line="${line#"${line%%[![:space:]]*}"}"          # ltrim
  [ -z "$line" ] && continue
  case "$line" in \#*) continue ;; esac
  case "$line" in *=*) ;; *) skipped=$((skipped+1)); continue ;; esac
  key="${line%%=*}"; val="${line#*=}"
  key="$(printf '%s' "$key" | tr -d '[:space:]')"
  val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
  val="$(printf '%s' "$val" | sed -e 's/[[:space:]]*$//')"
  case "$key" in [A-Z_][A-Z0-9_]*) ;; *) skipped=$((skipped+1)); continue ;; esac
  [ -z "$val" ] && { skipped=$((skipped+1)); continue; }

  # drop any existing definition, commented or not, then append the new one
  tmp="$(mktemp)"
  grep -vE "^[[:space:]]*#?[[:space:]]*${key}=" "$VAULT" > "$tmp" || true
  printf '%s="%s"\n' "$key" "$val" >> "$tmp"
  mv "$tmp" "$VAULT"; chmod 600 "$VAULT"
  added+=("$key")
done

echo "vault: $VAULT"
[ ${#added[@]} -gt 0 ] && printf '  set: %s\n' "${added[*]}" || echo "  set: (nothing)"
[ "$skipped" -gt 0 ] && echo "  ignored $skipped unusable line(s)" || true
echo
echo "now run:  bash scripts/cloud/doctor.sh"

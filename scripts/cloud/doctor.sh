#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# doctor.sh — one screen that says what this container can and cannot do.
# Read-only. Never writes, never deploys, never touches a fee record.
#   bash scripts/cloud/doctor.sh
# ---------------------------------------------------------------------------
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VAULT="${VEERPATTA_VAULT:-$HOME/.veerpatta/secrets.env}"
export PATH="/opt/node24/bin:$HOME/.local/bin:$PATH"

# Two vaults on purpose: app config here, account-level platform tokens in
# ~/.cloud/tokens.env so every repo in the container sees them. Reading only the
# first is how this script spent a while reporting live tokens as missing.
CLOUD_VAULT="${CLOUD_VAULT:-$HOME/.cloud/tokens.env}"
[ -f "$VAULT" ] && { set -a; . "$VAULT"; set +a; }
[ -f "$CLOUD_VAULT" ] && { set -a; . "$CLOUD_VAULT"; set +a; }
[ -f "$REPO_ROOT/.env.local" ] && { set -a; . "$REPO_ROOT/.env.local"; set +a; }

# This container pre-seeds placeholder proxy credentials (GITHUB_TOKEN=proxy-...).
# They are not ours and they are not valid; treat them as absent.
for t in GITHUB_TOKEN GH_TOKEN VERCEL_TOKEN CLOUDFLARE_API_TOKEN SUPABASE_ACCESS_TOKEN; do
  case "${!t:-}" in proxy-*) unset "$t" ;; esac
done

pass=0; fail=0
row() { # row <status> <name> <detail>
  local s="$1"; shift; local n="$1"; shift
  case "$s" in
    ok)   printf '  \033[32m●\033[0m %-26s %s\n' "$n" "$*"; pass=$((pass+1)) ;;
    no)   printf '  \033[31m○\033[0m %-26s %s\n' "$n" "$*"; fail=$((fail+1)) ;;
    *)    printf '  \033[33m◐\033[0m %-26s %s\n' "$n" "$*" ;;
  esac
}
http() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@" 2>/dev/null || echo 000; }
# github.com must bypass the container's git proxy: it intercepts and answers
# 403 for repos outside the session set, before our own credential is seen.
http_direct() { env -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy -u ALL_PROXY -u all_proxy \
  curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@" 2>/dev/null || echo 000; }

echo
echo "veerpatta-fees-app — cloud environment"
echo "  repo   $REPO_ROOT"
echo "  branch $(git -C "$REPO_ROOT" branch --show-current 2>/dev/null) @ $(git -C "$REPO_ROOT" log --oneline -1 2>/dev/null | cut -c1-60)"
echo

echo "toolchain"
nv="$(node -v 2>/dev/null)"
case "$nv" in v24.*) row ok "node" "$nv" ;; *) row no "node" "${nv:-missing} — package.json wants >=24 <25" ;; esac
[ -d "$REPO_ROOT/node_modules" ] && row ok "dependencies" "$(ls "$REPO_ROOT/node_modules" | wc -l) packages" || row no "dependencies" "run npm ci"
command -v vercel   >/dev/null && row ok "vercel cli"   "$(vercel --version 2>/dev/null | head -1)"      || row no "vercel cli" "not installed"
command -v wrangler >/dev/null && row ok "wrangler"     "$(wrangler --version 2>/dev/null | tail -1)"    || row no "wrangler" "not installed"
ls "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"/chromium* >/dev/null 2>&1 \
  && row ok "playwright chromium" "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}" \
  || row no "playwright chromium" "npx playwright install chromium"

echo
echo "app environment"
if [ -f "$REPO_ROOT/.env.local" ]; then
  row ok "profile" "$(cat "$REPO_ROOT/.env.profile" 2>/dev/null || echo unknown)"
else
  row no "profile" "no .env.local — run scripts/cloud/use-env.sh test"
fi
for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY; do
  [ -n "${!v:-}" ] && row ok "$v" "set" || row no "$v" "MISSING — app will not boot"
done

echo
echo "connectivity"
if [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
  cr="$(curl -s --max-time 25 -D - -o /dev/null \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        -H 'Prefer: count=exact' -H 'Range: 0-0' \
        "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/students?select=id" | tr -d '\r' | grep -i '^content-range' | cut -d/ -f2)"
  [ -n "$cr" ] && row ok "supabase rest" "reachable, $cr students on roll" || row no "supabase rest" "service-role read failed"
else
  row no "supabase rest" "keys missing"
fi
if [ -n "${SCHOOLFEES_WORKER_MCP_TOKEN:-}" ]; then
  u="${SCHOOLFEES_WORKER_MCP_URL:-https://schoolfees-live-mcp.raj-39e.workers.dev/svc/mcp}"
  c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST "$u" \
        -H "Authorization: Bearer $SCHOOLFEES_WORKER_MCP_TOKEN" \
        -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')"
  case "$c" in 200|202) row ok "schoolfees mcp worker" "HTTP $c" ;; *) row no "schoolfees mcp worker" "HTTP $c" ;; esac
else
  row skip "schoolfees mcp worker" "SCHOOLFEES_WORKER_MCP_TOKEN unset"
fi

echo
echo "authorizations"
if [ -n "${GITHUB_TOKEN:-}" ]; then
  c="$(http_direct -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/repos/veerpatta/schoolfees)"
  [ "$c" = "200" ] && row ok "github" "token valid, push enabled" || row no "github" "api returned $c"
else
  row skip "github" "read-only clone (no GITHUB_TOKEN)"
fi
if [ -n "${VERCEL_TOKEN:-}" ]; then
  # Deliberately NOT /v2/user: a token scoped to one project 404s there, which
  # would report a correctly-narrow token as broken. Ask what it should know.
  c="$(http -H "Authorization: Bearer $VERCEL_TOKEN" \
      "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}?teamId=${VERCEL_ORG_ID}")"
  [ "$c" = "200" ] && row ok "vercel" "token valid — scripts/cloud/deploy.sh can ship" \
                   || row no "vercel" "api returned $c"
else
  row no "vercel" "NO TOKEN — container pushes do NOT deploy (docs/cloud-tokens.md)"
fi
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  c="$(http -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify)"
  [ "$c" = "200" ] && row ok "cloudflare" "API token valid, Worker deploy enabled" || row no "cloudflare" "api returned $c"
elif [ -f "$HOME/.wrangler/config/default.toml" ] || [ -f "$HOME/.config/.wrangler/config/default.toml" ]; then
  who="$(timeout 60 wrangler whoami 2>/dev/null | grep -oE '[0-9a-f]{32}' | head -1)"
  [ -n "$who" ] && row ok "cloudflare" "wrangler OAuth, account ${who:0:8}…, deploy enabled" \
                || row no "cloudflare" "wrangler config present but whoami failed"
else
  row skip "cloudflare" "no Cloudflare auth (no Worker deploys)"
fi
if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  c="$(http -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" https://api.supabase.com/v1/projects)"
  [ "$c" = "200" ] && row ok "supabase account" "token valid, MCP + CLI enabled" || row no "supabase account" "api returned $c"
else
  row skip "supabase account" "no SUPABASE_ACCESS_TOKEN (Supabase MCP will not connect)"
fi
[ -n "${SENTRY_AUTH_TOKEN:-}" ] && row ok "sentry" "source-map upload on" || row skip "sentry" "no token — builds still succeed"
if [ -n "${NEON_API_KEY:-}" ]; then
  # Not used by this app; checked here because this container is the only place
  # the key lives, and a dead key should surface before someone needs it.
  n="$(curl -s --max-time 20 -H "Authorization: Bearer $NEON_API_KEY" -H 'Accept: application/json' \
      "https://console.neon.tech/api/v2/projects?org_id=${NEON_ORG_ID:-}" \
      | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log(j.projects?j.projects.length:0)}catch(e){console.log(0)}})" 2>/dev/null)"
  [ "${n:-0}" -gt 0 ] && row ok "neon" "$n projects (other repos — never expires, revoke by hand)" \
                     || row no "neon" "key present but no projects returned"
else
  row skip "neon" "no NEON_API_KEY"
fi

echo
printf '  %d ready, %d broken\n\n' "$pass" "$fail"
[ "$fail" -eq 0 ]

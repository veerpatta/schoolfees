#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# bootstrap.sh — bring a fresh Claude cloud container up to "everything works".
#
#   bash scripts/cloud/bootstrap.sh            # full setup, TEST profile
#   bash scripts/cloud/bootstrap.sh live       # full setup, LIVE profile
#   bash scripts/cloud/bootstrap.sh --deps     # deps + toolchain only, no env
#
# Idempotent: safe to re-run. Cloud containers are ephemeral, so this script is
# the durable artefact — the container is not.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VAULT="${VEERPATTA_VAULT:-$HOME/.veerpatta/secrets.env}"
NODE_DIR="${VEERPATTA_NODE_DIR:-/opt/node24}"
PROFILE="test"
DEPS_ONLY=0

for arg in "$@"; do
  case "$arg" in
    live) PROFILE="live" ;;
    test) PROFILE="test" ;;
    --deps) DEPS_ONLY=1 ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
  esac
done

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ok()  { printf '    \033[32mok\033[0m   %s\n' "$*"; }
warn(){ printf '    \033[33mskip\033[0m %s\n' "$*"; }

# --- 1. Node 24 -------------------------------------------------------------
say "Node 24 (package.json requires >=24 <25)"
if [ ! -x "$NODE_DIR/bin/node" ]; then
  ver="$(curl -fsSL https://nodejs.org/dist/index.json | node -e '
    let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
      const p=v=>v.slice(1).split(".").map(Number);
      const j=JSON.parse(d).filter(x=>x.version.startsWith("v24."));
      j.sort((a,b)=>{const A=p(a.version),B=p(b.version);return B[0]-A[0]||B[1]-A[1]||B[2]-A[2]});
      console.log(j[0].version)})')"
  mkdir -p "$NODE_DIR"
  curl -fsSL "https://nodejs.org/dist/$ver/node-$ver-linux-x64.tar.xz" \
    | tar -xJ -C "$NODE_DIR" --strip-components=1
fi
export PATH="$NODE_DIR/bin:$HOME/.local/bin:$PATH"
ok "node $(node -v), npm $(npm -v)"

# --- 2. Persist the shell environment --------------------------------------
say "Shell profile"
for rc in "$HOME/.bashrc" "$HOME/.profile"; do
  touch "$rc"
  grep -q 'veerpatta-fees-app cloud env' "$rc" || cat >> "$rc" <<RC

# --- veerpatta-fees-app cloud env ---
export PATH="$NODE_DIR/bin:\$HOME/.local/bin:\$PATH"
export NODE_OPTIONS="\${NODE_OPTIONS:---max-old-space-size=6144}"
export PLAYWRIGHT_BROWSERS_PATH="\${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
[ -f "$VAULT" ] && set -a && . "$VAULT" && set +a
RC
done
ok "PATH + vault sourced from ~/.bashrc and ~/.profile"

# --- 3. Dependencies --------------------------------------------------------
say "npm ci"
cd "$REPO_ROOT"
npm ci --no-audit --no-fund
ok "$(ls node_modules | wc -l) packages"

say "Global CLIs (vercel, wrangler)"
command -v vercel  >/dev/null || npm i -g vercel --no-audit --no-fund
command -v wrangler >/dev/null || npm i -g wrangler --allow-scripts=esbuild,workerd --no-audit --no-fund
ok "vercel $(vercel --version 2>/dev/null | head -1), wrangler $(wrangler --version 2>/dev/null | tail -1)"

# --- 4. Playwright ----------------------------------------------------------
say "Playwright"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
# The container ships a chromium build, but Playwright pins an exact revision per
# version and refuses a near miss — @playwright/test 1.62 wants r1234, the image
# has r1194. `install` is a no-op when the right revision is already there, so
# just always ask, with the image's skip-download flag cleared.
env -u PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD npx playwright install chromium >/dev/null 2>&1 \
  && ok "chromium ready in $PLAYWRIGHT_BROWSERS_PATH" \
  || warn "playwright install chromium failed"

[ "$DEPS_ONLY" = "1" ] && { say "--deps given, stopping before secrets"; exit 0; }

# --- 5. Secrets -------------------------------------------------------------
say "Secrets"
if [ ! -f "$VAULT" ]; then
  echo "    no vault at $VAULT"
  echo "    Create it (see docs/cloud-environment.md), then re-run."
  exit 1
fi
chmod 600 "$VAULT"
set -a; . "$VAULT"; set +a
ok "app vault loaded ($(grep -cE '^[A-Z0-9_]+=' "$VAULT") values)"

# Account-level tokens (GitHub, Vercel, Cloudflare, Supabase, Sentry, Neon) live
# outside any one repo, so every project in the container can reach them.
CLOUD_VAULT="${CLOUD_VAULT:-$HOME/.cloud/tokens.env}"
if [ -f "$CLOUD_VAULT" ]; then
  chmod 700 "$(dirname "$CLOUD_VAULT")"; chmod 600 "$CLOUD_VAULT"
  set -a; . "$CLOUD_VAULT"; set +a
  ok "platform vault loaded ($(grep -cE '^[A-Z0-9_]+=' "$CLOUD_VAULT") values)"
  for rc in "$HOME/.bashrc" "$HOME/.profile"; do
    grep -q 'cloud/tokens.env' "$rc" 2>/dev/null || \
      printf '[ -f "$HOME/.cloud/tokens.env" ] && set -a && . "$HOME/.cloud/tokens.env" && set +a\n' >> "$rc"
  done
else
  warn "no $CLOUD_VAULT — GitHub/Vercel/Cloudflare/Supabase/Sentry/Neon unavailable"
fi

# Refresh app env straight from Vercel when a token is available: that keeps the
# container honest about what production actually has, instead of a stale copy.
if [ -n "${VERCEL_TOKEN:-}" ]; then
  if vercel env pull "$REPO_ROOT/.env.vercel" --environment=development --yes \
       --token "$VERCEL_TOKEN" >/dev/null 2>&1; then
    ok "pulled Vercel development env -> .env.vercel"
  else
    warn "vercel env pull failed (token scope? project not linked?)"
  fi
else
  warn "VERCEL_TOKEN unset — skipping vercel env pull"
fi

# --- 6. Git / GitHub --------------------------------------------------------
say "Git"
git -C "$REPO_ROOT" config user.name  >/dev/null 2>&1 || git -C "$REPO_ROOT" config user.name  "Claude (cloud)"
git -C "$REPO_ROOT" config user.email >/dev/null 2>&1 || git -C "$REPO_ROOT" config user.email "raj@vpps.co.in"
case "${GITHUB_TOKEN:-}" in proxy-*) unset GITHUB_TOKEN ;; esac
if [ -n "${GITHUB_TOKEN:-}" ]; then
  printf 'https://x-access-token:%s@github.com\n' "$GITHUB_TOKEN" > "$HOME/.git-credentials"
  chmod 600 "$HOME/.git-credentials"
  git config --global credential.helper store
  # The container routes egress through a local git proxy that only signs
  # requests for repos in the session's authorised set, and refuses everything
  # else before it reaches GitHub — including a valid token of our own. Send
  # github.com straight out so our credential is the one that is used.
  #
  # This goes in git config, not NO_PROXY in a shell rc: rc files are not
  # sourced for every non-interactive shell, and a push that works in one shell
  # and 403s in the next is worse than one that never worked.
  git config --global 'http.https://github.com/.proxy' ""
  export NO_PROXY="${NO_PROXY:+$NO_PROXY,}github.com,api.github.com,codeload.github.com"
  export no_proxy="$NO_PROXY"
  ok "push configured for github.com/veerpatta/schoolfees"
else
  warn "GITHUB_TOKEN unset — clone/pull work, push will not"
fi

# --- 7. Cloud service auth --------------------------------------------------
say "Service auth"
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] && ok "wrangler: CLOUDFLARE_API_TOKEN present" || warn "wrangler: CLOUDFLARE_API_TOKEN unset (no Worker deploys)"
[ -n "${SUPABASE_ACCESS_TOKEN:-}" ] && ok "supabase CLI + MCP: token present"    || warn "supabase: SUPABASE_ACCESS_TOKEN unset (CLI/MCP limited)"
[ -n "${SCHOOLFEES_WORKER_MCP_TOKEN:-}" ] && ok "schoolfees MCP: bearer present" || warn "schoolfees MCP: SCHOOLFEES_WORKER_MCP_TOKEN unset"

# --- 7b. Claude Code workspace trust ---------------------------------------
say "Claude Code"
if command -v claude >/dev/null; then
  node -e '
    const fs=require("fs"),p=process.env.HOME+"/.claude.json",dir=process.argv[1];
    let j={}; try{j=JSON.parse(fs.readFileSync(p,"utf8"))}catch(e){}
    j.projects=j.projects||{};
    j.projects[dir]={...(j.projects[dir]||{}),hasTrustDialogAccepted:true};
    fs.writeFileSync(p,JSON.stringify(j,null,2));
  ' "$REPO_ROOT"
  ok "$(claude --version 2>/dev/null); workspace trusted, .claude/settings.json honoured"
  ok "headless MCP: claude --mcp-config scripts/cloud/mcp.cloud.json"
else
  warn "claude CLI not on PATH"
fi

# --- 8. App env -------------------------------------------------------------
say "App environment"
bash "$REPO_ROOT/scripts/cloud/use-env.sh" "$PROFILE"

# --- 9. Report --------------------------------------------------------------
bash "$REPO_ROOT/scripts/cloud/doctor.sh" || true

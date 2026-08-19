#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# init.sh — take a bare cloud container to a working environment in one command.
#
#   curl -fsSL https://raw.githubusercontent.com/veerpatta/schoolfees/main/scripts/cloud/init.sh -o /tmp/init.sh
#   bash /tmp/init.sh            # then paste the vault, then Ctrl-D
#   bash /tmp/init.sh vault.txt  # or point it at a file
#
# NOT `curl ... | bash`. When the script is piped, bash's stdin IS the script,
# so reading the vault from stdin eats the rest of the source and the run ends
# silently with status 0 having done nothing. Download, then run.
#
# This exists because the alternative — clone, mkdir, two separate add-secrets
# invocations with different target files, write a wrangler toml, bootstrap — is
# six commands and two pastes, which is miserable on a phone. The repo is public,
# so this file is reachable before any credential exists. It carries none.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO="${VEERPATTA_REPO:-https://github.com/veerpatta/schoolfees.git}"
DEST="${VEERPATTA_DEST:-$HOME/veerpatta-fees-app}"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

say "Fetching the repo"
if [ -d "$DEST/.git" ]; then
  git -C "$DEST" fetch -q origin && git -C "$DEST" checkout -q main && git -C "$DEST" reset -q --hard origin/main
  echo "    updated $DEST"
else
  git clone -q "$REPO" "$DEST"
  echo "    cloned to $DEST"
fi

paste="$(mktemp)"; trap 'rm -f "$paste"' EXIT

if [ "${1:-}" ]; then
  [ -r "$1" ] || { echo "cannot read $1" >&2; exit 1; }
  cp "$1" "$paste"
  say "Vault read from $1"
elif [ ! -t 0 ]; then
  # Piped in. Refuse if it looks like this script — that is the curl|bash trap,
  # and silently accepting it produces an empty vault and a confusing failure.
  cat > "$paste"
  if grep -q 'init.sh — take a bare cloud container' "$paste"; then
    echo >&2
    echo "This was run as 'curl ... | bash', so stdin was the script, not your vault." >&2
    echo "Download it first:" >&2
    echo "  curl -fsSL https://raw.githubusercontent.com/veerpatta/schoolfees/main/scripts/cloud/init.sh -o /tmp/init.sh" >&2
    echo "  bash /tmp/init.sh" >&2
    exit 1
  fi
  say "Vault read from stdin"
else
  say "Paste the vault, then press Ctrl-D"
  cat <<'EOT'
    Both blocks at once — BLOCK A and BLOCK B together, comments and all.
    Lines are routed by name, so order does not matter and the
    "# ---------- BLOCK ..." headers are ignored.
EOT
  echo
  cat > "$paste"
fi

if ! grep -qE '^\s*(NEXT_PUBLIC_SUPABASE_URL|GITHUB_TOKEN)=' "$paste"; then
  echo "That does not look like the vault — no NEXT_PUBLIC_SUPABASE_URL or GITHUB_TOKEN in it." >&2
  exit 1
fi

mkdir -p "$HOME/.veerpatta" "$HOME/.cloud"
chmod 700 "$HOME/.veerpatta" "$HOME/.cloud"

# Route each line to the right vault by name. Platform tokens are account-level
# and belong to every repo; everything else is this app's own config.
node - "$paste" "$HOME/.veerpatta/secrets.env" "$HOME/.cloud/tokens.env" <<'NODE'
const fs = require("fs");
const [src, appVault, cloudVault] = process.argv.slice(2);
const PLATFORM = new Set([
  "GITHUB_TOKEN","VERCEL_TOKEN","CLOUDFLARE_API_TOKEN","CLOUDFLARE_ACCOUNT_ID",
  "SUPABASE_ACCESS_TOKEN","SENTRY_AUTH_TOKEN","SENTRY_ORG","SENTRY_PROJECT",
  "NEON_API_KEY","NEON_ORG_ID",
]);
const read = f => { try { return fs.readFileSync(f,"utf8") } catch { return "" } };
const parse = t => { const m = new Map();
  for (const l of t.split(/\r?\n/)) { const x = l.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/); if (x) m.set(x[1], x[2].trim().replace(/^["']|["']$/g,"")); }
  return m; };
const app = parse(read(appVault)), cloud = parse(read(cloudVault));
const wrangler = [];
let inToml = false;
for (const line of fs.readFileSync(src,"utf8").split(/\r?\n/)) {
  if (/^\s*(oauth_token|refresh_token|expiration_time|scopes)\s*=/.test(line)) { wrangler.push(line); inToml = true; continue; }
  if (inToml && /^\s*[\]"]/.test(line)) { wrangler.push(line); continue; }
  inToml = false;
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/);
  if (!m) continue;
  const [, k] = m; let v = m[2].trim().replace(/^["']|["']$/g, "");
  if (!v) continue;
  (PLATFORM.has(k) ? cloud : app).set(k, v);
}
const dump = m => [...m].map(([k,v]) => `${k}="${v}"`).join("\n") + "\n";
fs.writeFileSync(appVault, dump(app), { mode: 0o600 });
fs.writeFileSync(cloudVault, dump(cloud), { mode: 0o600 });
if (wrangler.length) {
  for (const d of [`${process.env.HOME}/.wrangler/config`, `${process.env.HOME}/.config/.wrangler/config`]) {
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(`${d}/default.toml`, wrangler.join("\n") + "\n", { mode: 0o600 });
  }
}
console.log(`    app vault:      ${app.size} values`);
console.log(`    platform vault: ${cloud.size} values`);
console.log(`    wrangler:       ${wrangler.length ? "written" : "not supplied (CLOUDFLARE_API_TOKEN is the primary path)"}`);
NODE

say "Bootstrapping"
exec bash "$DEST/scripts/cloud/bootstrap.sh"

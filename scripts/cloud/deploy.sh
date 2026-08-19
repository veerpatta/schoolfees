#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy.sh — ship main to production from a cloud container.
#
#   bash scripts/cloud/deploy.sh              # deploy current HEAD
#   bash scripts/cloud/deploy.sh --ref main   # deploy whatever main points at
#   bash scripts/cloud/deploy.sh --no-wait    # fire and return
#
# Why this exists: a push from a container reaches GitHub and runs CI, but
# Vercel's GitHub App creates no deployment for it (measured — see
# docs/cloud-tokens.md). From a workstation the push IS the deploy; from here
# it is not, and nothing about that failure is loud.
#
# Why not `vercel deploy`: the CLI resolves the account before it does anything,
# and a project-scoped token cannot read /v2/user — it dies on "User not found".
# Widening the token to Full Account to satisfy a lookup we do not need is the
# wrong trade, so this calls the deployments API directly. It also deploys FROM
# GIT rather than uploading the working tree, so what ships is the commit, not
# whatever happens to be lying around in the container.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VAULT="${VEERPATTA_VAULT:-$HOME/.veerpatta/secrets.env}"
GITHUB_REPO_ID=1216579959
REF="HEAD"; WAIT=1

while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --no-wait) WAIT=0; shift ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

CLOUD_VAULT="${CLOUD_VAULT:-$HOME/.cloud/tokens.env}"
[ -f "$VAULT" ] || { echo "no vault at $VAULT" >&2; exit 1; }
set -a; . "$VAULT"; [ -f "$CLOUD_VAULT" ] && . "$CLOUD_VAULT"; set +a
: "${VERCEL_TOKEN:?VERCEL_TOKEN not in the vault — see docs/cloud-tokens.md}"
: "${VERCEL_ORG_ID:?}" ; : "${VERCEL_PROJECT_ID:?}"

cd "$REPO_ROOT"
SHA="$(git rev-parse "$REF")"

# Deploying a sha GitHub has never seen builds nothing and reports it oddly, so
# refuse early and say which half is missing.
if ! git branch -r --contains "$SHA" 2>/dev/null | grep -q 'origin/'; then
  echo "refusing: $SHA is not on any origin branch. Push it first." >&2
  exit 1
fi

echo "deploying $(git log --oneline -1 "$SHA")"

resp="$(curl -sS --max-time 60 -X POST \
  "https://api.vercel.com/v13/deployments?teamId=$VERCEL_ORG_ID&forceNew=1" \
  -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"schoolfees\",\"project\":\"$VERCEL_PROJECT_ID\",\"target\":\"production\",\"gitSource\":{\"type\":\"github\",\"repoId\":$GITHUB_REPO_ID,\"ref\":\"$REF\",\"sha\":\"$SHA\"}}")"

id="$(printf '%s' "$resp" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);if(j.error){console.error('vercel: '+j.error.code+' — '+j.error.message);process.exit(1)}console.log(j.id)})")"
echo "deployment $id"

[ "$WAIT" = "0" ] && { echo "(not waiting)"; exit 0; }

for _ in $(seq 1 40); do
  line="$(curl -s --max-time 20 -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v13/deployments/$id?teamId=$VERCEL_ORG_ID" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log((j.readyState||j.status||'?')+' '+((j.alias||[]).find(a=>!a.includes('-'))||''))}catch(e){console.log('? ')}})")"
  state="${line%% *}"; alias="${line#* }"
  printf '  %s\n' "$state"
  case "$state" in
    READY)    echo "live: https://${alias:-schoolfees-two.vercel.app}"; exit 0 ;;
    ERROR|CANCELED)
      echo "build failed — logs: https://vercel.com/veerpattas-projects/schoolfees/${id#dpl_}" >&2
      exit 1 ;;
  esac
  sleep 20
done
echo "still building after ~13 min; check the dashboard" >&2
exit 1

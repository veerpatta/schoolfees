# Credentials for the cloud container

**Status: complete.** `doctor.sh` reports 17 ready, 0 broken. This page records
what is held, where it came from, and the two traps that cost time.

## Two vaults, on purpose

| File | Holds | Why separate |
|---|---|---|
| `~/.veerpatta/secrets.env` | this app's config — Supabase URL/keys, doc token, Vercel project ids | belongs to one repo |
| `~/.cloud/tokens.env` | account-level platform tokens | every repo in the container needs them |

Both are mode 600, outside any tree, and sourced by `~/.bashrc` into every shell.
**This repository is public** — no credential may ever be committed to it.

Add to either without echoing values:

```bash
bash scripts/cloud/add-secrets.sh <<'EOF'      # app vault
add-token <<'EOF'                              # platform vault
```

## What is held

| Variable | Scope | Unlocks |
|---|---|---|
| `GITHUB_TOKEN` | fine-grained PAT, all 24 repos | push from the container |
| `VERCEL_TOKEN` | `schoolfees` project only | `scripts/cloud/deploy.sh` |
| `CLOUDFLARE_API_TOKEN` | Workers Scripts:Edit + Workers KV Storage:Edit, one account | `wrangler deploy`, `wrangler secret put` |
| `SUPABASE_ACCESS_TOKEN` | whole account (no narrower option exists) | Supabase MCP, `supabase db push` |
| `SENTRY_AUTH_TOKEN` | `org:ci` only | source-map upload at build |
| `NEON_API_KEY` | whole account, 3 projects | the other repos' databases |
| `SCHOOLFEES_WORKER_MCP_TOKEN` | the `/svc/mcp` bearer | MCP automation lane |

Sentry's is the narrowest — `org:ci` cannot read issues or change settings, only
upload source maps and create releases. **Neon's is the widest in practice: it
never expires.** There is no expiry field on the page because Neon does not offer
one, so that is the credential to revoke by hand rather than let lapse.

## Two traps, both measured

**A container push is not a deploy.** Same repo, same branch, same author,
minutes apart: `b63ceae` from the workstation deployed; `c28b23e` from the
container produced no Vercel deployment at all, twenty minutes on, while GitHub
had taken the push and run CI green. `c28b23e` was a production bug fix, and it
sat on `main` looking shipped. Hence `deploy.sh`, and hence `doctor.sh` treating
a missing `VERCEL_TOKEN` as broken rather than merely absent.

**The Vercel CLI cannot use a project-scoped token.** `vercel deploy` and
`vercel env pull` resolve the account first, and a token scoped to one project
404s on `/v2/user` — the CLI says *"Not able to load user… User not found"*,
which reads like a broken token rather than a correctly narrow one. `deploy.sh`
posts to `/v13/deployments` directly and passes `gitSource`, so Vercel builds the
commit rather than whatever is lying around in the container.

`doctor.sh` checks the Vercel token against the project endpoint for the same
reason, and reads **both** vaults — reading only the app one is how it spent a
while reporting live tokens as missing.

## Deliberately absent

**Firebase.** Only `vpps-election-2026` uses it, untouched since May. Firebase
has no paste-a-token path — it wants a service-account JSON granting broad
project access, which is a poor trade for a dormant repo, especially during a
month when nothing can be rotated. The console works from a phone if it ever
comes up.

## Revoking

- GitHub — https://github.com/settings/personal-access-tokens
- Vercel — https://vercel.com/account/tokens
- Cloudflare — https://dash.cloudflare.com/profile/api-tokens
- Supabase — https://supabase.com/dashboard/account/tokens
- Sentry — https://veer-patta-school.sentry.io/settings/auth-tokens/
- Neon — https://console.neon.tech/app/settings#api-keys ← **no expiry; this one matters**

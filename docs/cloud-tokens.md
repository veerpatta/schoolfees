# Credentials for the cloud container

**Status: wired.** Almost nothing here needs doing. This page records what the
container holds, where each value came from, and the two that are still absent
on purpose.

## What is wired, and from where

| Variable | Source | Unlocks |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY` | the machine's `.env.local` | the app boots and reads live data |
| `SCHOOLFEES_DOC_TOKEN` | the machine's `.env.local` | the app→Worker document bridge |
| `GITHUB_TOKEN` | **reused** from the `gh` CLI login (`gh auth token`) | `git push` from the container |
| `SCHOOLFEES_WORKER_MCP_TOKEN` | **reused** from a Windows user env var | the `/svc/mcp` automation lane |
| Cloudflare OAuth | **reused** — `wrangler`'s own `default.toml`, copied in | `wrangler deploy`, `wrangler secret put` |
| `CLOUDFLARE_ACCOUNT_ID` | `wrangler whoami` | — |

Nothing on that list was minted. Every credential already existed somewhere on
the machine and was copied, which is why the container came up complete without
anyone visiting a token page.

## Deploying does not need a Vercel token

The `schoolfees` project deploys from the GitHub integration — `githubDeployment: 1`
on every production deployment. **A push to `main` is the deploy.** A
`VERCEL_TOKEN` would only add CLI conveniences: `vercel env pull`, preview
deploys, `vercel logs`. Deployment status, build logs and runtime errors are
already readable through the Vercel MCP connector without any token.

## The two that are absent

**`SUPABASE_ACCESS_TOKEN`** — not on the machine; the CLI keeps it in the Windows
keyring and there is no file to copy. It would enable the Supabase MCP server
inside the container and `supabase db push` for migrations. Neither is on the
critical path: the service role key covers every data read and write the app
does, and the Supabase MCP connector is already attached to the Claude session
itself. Mint one at https://supabase.com/dashboard/account/tokens only if
migrations have to run from the container.

**`SENTRY_AUTH_TOKEN`** — build-time source-map upload only. Builds pass without
it; stack traces from production are just less readable.

## Two things worth knowing about what is stored

The `GITHUB_TOKEN` is the `gh` CLI's own OAuth token (`gho_…`), and its scopes
are `repo`, `workflow`, `gist`, `read:org` — **every repository on the account**,
not just this one. A fine-grained PAT limited to `veerpatta/schoolfees` with
`Contents: read+write` would be the tighter thing to hold, and swapping it in is
a one-line change to the vault. Revoke either at
https://github.com/settings/applications if a container is ever lost.

The Cloudflare credential is a full-scope wrangler OAuth token with `offline_access`,
so it refreshes itself indefinitely. `wrangler logout` on the machine invalidates
the copy in the container too.

## Where the vault lives

`~/.veerpatta/secrets.env`, mode 600, outside the repo — **this repository is
public**, so no credential may ever be committed to it. The container is
ephemeral and takes the vault with it; the paste-block for rebuilding one is in
the conversation that created it, not here.

```bash
bash scripts/cloud/add-secrets.sh <<'EOF'
NAME=value
EOF
bash scripts/cloud/doctor.sh
```

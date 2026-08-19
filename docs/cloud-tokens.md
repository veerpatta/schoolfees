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

## Deploying from the container DOES need a Vercel token

This page previously claimed the opposite, and production proved it wrong on
19 Aug. The claim was reasonable and wholly untested: the project deploys from
the GitHub integration, every production deployment carries `githubDeployment: 1`,
so a push to `main` looked like the deploy.

It is, but only from the workstation. Measured, same repo, same branch, same
author, minutes apart:

| Commit | Pushed from | GitHub Actions CI | Vercel deployment |
|---|---|---|---|
| `b63ceae` | workstation | ran, passed | **created, deployed** |
| `c28b23e` | cloud container | ran, passed | **none, 20 minutes later** |
| `173942c` | workstation | ran, passed | **created, deployed** |

GitHub took the container's push, moved `main` to it, and ran CI on it — so the
push was real and the commit was on the branch. Vercel's GitHub App simply never
produced a deployment for it. `c28b23e` was the receipt-card fix, and it sat on
`main`, green, undeployed, while production kept serving the broken route.

Why the App ignores that push is not visible from inside the container, and the
answer matters less than the consequence: **a container push is not a deploy.**

So `VERCEL_TOKEN` is load-bearing, not a convenience, for anyone working without
a workstation to push from. **It is now in the vault**, scoped to the
`schoolfees` project alone rather than the whole account. Ship with:

```bash
bash scripts/cloud/deploy.sh              # current HEAD
bash scripts/cloud/deploy.sh --ref main
```

That script is not a wrapper around `vercel deploy`, for two reasons found the
hard way:

- **The CLI cannot use a project-scoped token.** `vercel env pull` and
  `vercel deploy` resolve the account before doing anything, and a token scoped
  to one project 404s on `/v2/user` — the CLI reports *"Not able to load user…
  User not found"*, which reads like a broken token rather than a correctly
  narrow one. Widening the token to Full Account to satisfy a lookup we do not
  need is the wrong trade, so the script calls `POST /v13/deployments` directly.
- **It deploys from git, not from the working tree.** `vercel deploy` uploads
  whatever is in the container. Passing `gitSource` makes Vercel build the
  commit, so what ships is what is on `main` — the same artefact the webhook
  would have produced. The script refuses a sha that is not on an origin branch
  rather than shipping something GitHub has never seen.

`doctor.sh` checks this token against the project endpoint for the same reason.

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

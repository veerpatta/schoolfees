# Running this app in a Claude cloud container

A cloud container is a fresh Linux box with no memory of the last one. It is
reclaimed after a period of inactivity, and everything in it goes with it —
including any key you paste in. So the durable thing is not the container, it is
`scripts/cloud/`: three scripts that rebuild a working environment from the repo
plus one secret file.

```
scripts/cloud/bootstrap.sh     rebuild everything from nothing
scripts/cloud/use-env.sh       switch between the TEST and LIVE profiles
scripts/cloud/doctor.sh        one screen: what works, what does not
scripts/cloud/mcp.cloud.json   headless MCP config (token auth, no browser)
```

## First run in a new container

```bash
git clone https://github.com/veerpatta/schoolfees.git ~/veerpatta-fees-app
cd ~/veerpatta-fees-app
# paste the vault (see "The vault" below) into ~/.veerpatta/secrets.env, then:
bash scripts/cloud/bootstrap.sh
```

That installs Node 24 (the repo refuses anything else), runs `npm ci`, installs
the Vercel and Wrangler CLIs, points Playwright at the container's pre-installed
Chromium, wires git credentials, writes `.env.local`, and finishes by printing
the doctor report.

Re-running it is safe. It skips whatever is already in place.

## The vault

`~/.veerpatta/secrets.env`, mode 600, outside the repo so it can never be
committed. `~/.bashrc` sources it into every shell, and `use-env.sh` reads it to
generate `.env.local`.

Already-known values live in it: the Supabase URL, publishable key and service
role key for `vgqyilgstjvgohrsiwkb`, the school name, the Sentry DSN, the
document-bridge token, and the Vercel org/project IDs.

These you have to supply, because they are not on disk anywhere in the repo:

| Variable | Where to get it | What it unlocks |
|---|---|---|
| `GITHUB_TOKEN` | github.com → Settings → Developer settings → fine-grained PAT, `Contents: read+write` on `veerpatta/schoolfees` | `git push`, PRs |
| `VERCEL_TOKEN` | vercel.com/account/tokens | `vercel env pull`, deploy inspection |
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com → API Tokens → `Workers Scripts: Edit` | `npm run mcp:schoolfees:worker:deploy` |
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens | Supabase MCP + `supabase` CLI |
| `SCHOOLFEES_WORKER_MCP_TOKEN` | the `/svc/mcp` bearer, already a Worker secret | the schoolfees MCP server |
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens | source-map upload (builds pass without it) |

Step-by-step for each one, with the exact settings to pick and what breaks
without it: [`docs/cloud-tokens.md`](./cloud-tokens.md). Merge them in without
echoing values with `bash scripts/cloud/add-secrets.sh`.

Once `VERCEL_TOKEN` is set, `bootstrap.sh` pulls the rest of the app's
environment from Vercel into `.env.vercel`, so the container matches what
production actually has rather than a copy that drifted.

## Two profiles, one database

```bash
bash scripts/cloud/use-env.sh test    # default
bash scripts/cloud/use-env.sh live
bash scripts/cloud/use-env.sh --show
```

Both profiles point at the same Supabase project, and that is not an oversight.
`APP_MODE=test` would switch server-side clients to the `test` schema, but
`docs/test-environment-isolation.md` records that schema as a proposal that was
never adopted — it is empty, and pointing the app at it produces a working app
with no school in it. The boundary that is real is the session label, which is
what Hard Safety Rule 6 in `CLAUDE.md` enforces:

- **test** — `SCHOOLFEES_MCP_DEFAULT_SESSION=TEST-2026-27`, repayment plans on.
  Agents reach for the sandbox session first.
- **live** — `SCHOOLFEES_MCP_DEFAULT_SESSION=2026-27`. Real families, real
  money, real receipts. No test data, no test payments, ever.

The service role key is present in both. Nothing about the profile prevents a
determined script from writing to `2026-27` — the profile sets the default an
agent reaches for, and the rules in `CLAUDE.md` do the rest.

## Using Claude Code inside the container

`claude` is pre-installed. The committed `.mcp.json` authenticates Supabase over
OAuth, which needs a browser and so cannot complete here. Use the headless
config instead:

```bash
claude --mcp-config scripts/cloud/mcp.cloud.json
```

Both servers then authenticate from environment variables:
`SCHOOLFEES_WORKER_MCP_TOKEN` and `SUPABASE_ACCESS_TOKEN`.

## GitHub, and why the token is needed

The container routes git through a local proxy that signs requests only for
repositories in the session's authorised set. `veerpatta/schoolfees` is public,
so cloning and pulling work unauthenticated; pushing is refused by the proxy
before it ever reaches GitHub. `bootstrap.sh` therefore adds `github.com` to
`NO_PROXY` when a real `GITHUB_TOKEN` is present, so your own credential is the
one GitHub sees.

The alternative, if you would rather not mint a PAT, is to add the repository to
the session's sources from the Claude app — then the proxy signs for it and no
token is needed.

## Verifying

```bash
bash scripts/cloud/doctor.sh   # capability report, read-only
npm run check                  # lint + typecheck
npm test                       # vitest
npm run build                  # next build --webpack
npm run smoke:readiness        # Playwright, needs a running app
```

## What this container is not

It is not a place to keep anything. No file here survives the container, the
vault included. If you generate something worth having — a report, a migration,
a patch — commit it or send it out before the session ends.

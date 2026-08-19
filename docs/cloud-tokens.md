# Finishing the cloud environment — the five tokens

Everything else is done. These five are the only things standing between the
container and a full green `scripts/cloud/doctor.sh`.

**Why you are doing this and not Claude.** Every one of these pages mints a
long-lived credential against your account, and the mint is one-shot: the value
is shown once, and a wrong checkbox produces a token with wider reach than you
meant with nothing on screen afterwards to tell you so. That is an account
security change, and it stays with the account holder. Several of the pages also
re-prompt for your password or 2FA, which is a wall on purpose.

Order matters a little: do GitHub first (or skip it), because it is the one that
unblocks normal work.

---

## 1. GITHUB_TOKEN — or skip this entirely

**The cheaper option first.** In the Claude desktop app, add
`veerpatta/schoolfees` as a source for this session. The container's git proxy
then signs pushes for it and no token exists to leak or expire. If that works
for you, skip to step 2.

Otherwise: **https://github.com/settings/personal-access-tokens/new**

| Field | Value |
|---|---|
| Token name | `claude-cloud-schoolfees` |
| Resource owner | `veerpatta` |
| Expiration | 90 days |
| Repository access | **Only select repositories** → `veerpatta/schoolfees` |
| Repository permissions → **Contents** | **Read and write** |
| Repository permissions → **Pull requests** | Read and write *(only if you want PRs opened for you)* |

Leave every other permission at *No access*. Generate, copy the `github_pat_…`
value.

Without it: clone and pull work, `git push` is refused.

---

## 2. VERCEL_TOKEN

**https://vercel.com/account/tokens** → *Create Token*

| Field | Value |
|---|---|
| Name | `claude-cloud-schoolfees` |
| Scope | `veerpattas-projects` (the team that owns the `schoolfees` project) |
| Expiration | 90 days |

Copy the value. This one earns its keep: `bootstrap.sh` uses it to run
`vercel env pull`, so the container's environment comes from what production
actually has rather than a copy of a copy. It may also hand you step 5 for free.

---

## 3. CLOUDFLARE_API_TOKEN

**https://dash.cloudflare.com/profile/api-tokens** → *Create Token* → use the
**Edit Cloudflare Workers** template.

Take the template as-is. It includes *Workers Scripts: Edit* **and** *Workers KV
Storage: Edit*, and you need both — `schoolfees-live-mcp` binds a KV namespace
(`OAUTH_KV`, for the staff OAuth lane), and a token with only Scripts:Edit fails
at deploy with an authorization error that does not name KV as the cause.

Set *Account Resources* to your account. Zone resources can stay at whatever the
template picks; this Worker has no zone.

While you are on the dashboard, grab the **Account ID** from the right sidebar of
Workers & Pages and send that too as `CLOUDFLARE_ACCOUNT_ID`.

Without it: `npm run mcp:schoolfees:worker:deploy` cannot run from cloud.

---

## 4. SUPABASE_ACCESS_TOKEN

**https://supabase.com/dashboard/account/tokens** → *Generate new token*

Name it `claude-cloud-schoolfees`. Copy the `sbp_…` value.

Note this is an **account-level** token — it reaches every project you own, not
just `vgqyilgstjvgohrsiwkb`. Supabase does not offer a narrower personal token.
Keep the expiry short.

Without it: the Supabase MCP server cannot connect inside the container, and the
`supabase` CLI cannot run migrations from here.

---

## 5. SCHOOLFEES_WORKER_MCP_TOKEN — the awkward one

This is the `/svc/mcp` bearer. It is stored as a Cloudflare Worker secret, and
Cloudflare will not show a secret again after it is set. There is no page to
copy it from. Three ways out, best first:

**a. You already have it.** It was in the environment when the deep-test suite
ran on 15 Aug, so it exists somewhere you can reach — the shell you ran that
from, your ChatGPT connector config for the daily defaulter task, a password
manager, or Vercel's project env. If step 2 gives me `vercel env pull` and the
value is in Vercel, this step costs you nothing.

**b. Rotate it.** Once `CLOUDFLARE_API_TOKEN` is in, I generate a fresh random
value, push it with `wrangler secret put SCHOOLFEES_WORKER_MCP_TOKEN`, and set
the same value in Vercel. **This breaks every other client of the old value** —
the ChatGPT daily task and Codex both use the automation lane — until you paste
the new one into each. Say so explicitly before I do this.

**c. Skip it.** The staff OAuth lane at `/mcp` does not use this token and is
unaffected. You lose the automation lane from the container, nothing else.

---

## Handing them back

Paste whichever you have into chat as a block:

```
GITHUB_TOKEN=github_pat_...
VERCEL_TOKEN=...
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...
SUPABASE_ACCESS_TOKEN=sbp_...
SCHOOLFEES_WORKER_MCP_TOKEN=...
```

Partial is fine — each one lights up independently, and `doctor.sh` will tell
you which are still dark. Or run it yourself, which never echoes a value:

```bash
bash scripts/cloud/add-secrets.sh <<'EOF'
GITHUB_TOKEN=github_pat_...
EOF
bash scripts/cloud/doctor.sh
```

**A container is not a vault.** Anything pasted here lives in
`~/.veerpatta/secrets.env` in a box that gets reclaimed after a while, and in
this conversation's transcript. Use short expiries, and revoke these four at the
links above when the work is done — they are cheap to remint.

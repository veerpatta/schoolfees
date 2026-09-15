# School One — Setup Runbook (before Claude Code starts)

**Date:** 16 September 2026 · **Owner:** Janmejay · **Status legend:** ✅ done · ⬜ to do · 🤖 done by Claude Code later

Nothing below touches production data. The only production actions are account/settings changes you make in dashboards.

## A. Already done

| # | Item | Status | Detail |
|---|---|---|---|
| A1 | Operations admin `director@vpps.co.in` created in production | ✅ | Use it for all daily fee work from now on. `raj@vpps.co.in` is the canary. |
| A2 | Supabase Free-plan slot freed | ✅ | `Trading Bot Aegis` (`bizgcoljagsnytrnaicr`) paused. To resume it later, pause `schoolfees-dev` first. |
| A3 | Dev project created | ✅ | **`schoolfees-dev`, ref `wtgxcptmucjerhufzjcf`, ap-south-1, Free, $0/month.** Empty. |
| A4 | Plan documents | ✅ | `docs/school-one/` folder (this zip) ready to drop into the repo. |

## B. Do these now (10–20 minutes) — needed before the kickoff prompt

| # | Where | Steps |
|---|---|---|
| B1 | Supabase → `schoolfees-dev` → Settings → Database | Click **Reset database password**, choose a strong password, store it **only** in your password manager. Claude Code will ask you to type it into the terminal when it runs `supabase link`; never paste it into chat or a file. |
| B2 | Supabase → `schoolfees-dev` → Settings → API | Note the **Project URL** (`https://wtgxcptmucjerhufzjcf.supabase.co`), the **publishable key**, and the **service role key**. These are the dev values for B3 and B4. |
| B3 | Vercel → `schoolfees` → Settings → Environment Variables | For each of `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: edit the existing entry so its scope is **Production only**; add a new entry with the **dev** value scoped to **Preview** and **Development**. Then add `PRODUCTION_SUPABASE_PROJECT_REF = vgqyilgstjvgohrsiwkb` scoped to **all three**. Check that `AISENSY_API_KEY`, `AISENSY_WEBHOOK_SECRET`, `CRON_SECRET`, `SCHOOLFEES_DOC_TOKEN`, `SCHOOLFEES_MCP_TOKEN`, `SENTRY_AUTH_TOKEN` are **Production only** (remove Preview/Development scope if present). |
| B4 | Your laptop → repo root | Open `.env.local`. If it contains `vgqyilgstjvgohrsiwkb` anywhere, replace those three Supabase values with the **dev** values from B2, and add `PRODUCTION_SUPABASE_PROJECT_REF=vgqyilgstjvgohrsiwkb` and `SUPABASE_DEV_PROJECT_REF=wtgxcptmucjerhufzjcf`. Keep your old production `.env.local` values in the password manager only. From now on your laptop points at dev. |
| B5 | Your laptop → repo root | `git checkout main && git pull && git checkout -b school-one/phase-0`, then unzip `school-one-docs.zip` so the files land at `docs/school-one/…`. Commit: `docs(school-one): add build plan, addendum, phase 0 prompts`. |
| B6 | Your laptop | Confirm Docker Desktop is running (`docker ps`) and Node 24 is active (`node -v`). `npx supabase --version` should print 2.x. |

## C. Do these during Phase 0 (they gate prompts P0.6–P0.7, not the kickoff)

| # | Where | Steps |
|---|---|---|
| C1 | Cloudflare dashboard → R2 | **Enable R2** (it will ask for a payment method; the 10 GB / month tier is free). Then create bucket `vpps-schoolone-backups` (location hint APAC, no public access). Then R2 → Manage API tokens → create a token with **Object Read & Write** limited to that bucket; note Account ID, Access Key ID, Secret Access Key. |
| C2 | Google Admin console (`raj@vpps.co.in`) | Apps → Google Workspace → Drive and Docs → Sharing settings: confirm **Shared drive creation** is allowed for your OU. |
| C3 | Google Drive | New → Shared drive → `VPPS-SchoolOne-Backups`. Note its ID from the URL (`/drive/folders/<ID>`). |
| C4 | Google Cloud console | Create project `vpps-school-one` (Workspace org). APIs & Services → Enable **Google Drive API**. IAM → Service Accounts → create `schoolone-backup` → Keys → Add key → JSON (download once, store in password manager). Copy the service account email. |
| C5 | Google Drive → the shared drive → Manage members | Add the service-account email as **Content manager**. |
| C6 | Your laptop | Install `age` (`brew install age` / `winget install FiloSottile.age` / apt). Run `age-keygen -o school-recovery.key` and `age-keygen -o drill.key`. Store both private keys in the password manager; print `school-recovery.key` once for the school safe; record the paper location in the school register. Note the two public keys (`age1…`). Delete the files from the laptop after storing. |
| C7 | GitHub → `veerpatta/schoolfees` → Settings → Environments | Create environment `backup`, add yourself as **required reviewer**. Add environment secrets: `SUPABASE_PROD_DB_URL` (Supabase → production project → Connect → **Session pooler** URI, with the production DB password), `BACKUP_AGE_RECIPIENT` (recovery public key), `BACKUP_DRILL_AGE_RECIPIENT` (drill public key), `BACKUP_DRILL_AGE_IDENTITY` (drill private key), `GDRIVE_SA_JSON` (contents of the JSON key), `GDRIVE_SHARED_DRIVE_ID`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=vpps-schoolone-backups`, `JOB_SECRET_BACKUP_REPORT` (generate: `openssl rand -hex 32`), `SCHOOLFEES_BASE_URL=https://schoolfees-two.vercel.app`. |
| C8 | Vercel → Production env vars | Add `JOB_SECRET_BACKUP_REPORT` (same value as C7), `JOB_SECRET_NIGHTLY_BACKUP`, `JOB_SECRET_AUTO_DAY_CLOSE` (each `openssl rand -hex 32`). Do **not** remove `CRON_SECRET` yet — the routes fall back to it until pg_cron/Vercel callers are switched. |
| C9 | Supabase → production → SQL editor (read-only check, run as you) | `select jobname, schedule, command from cron.job;` — keep the output in your notes; Phase 0 P0.4 needs to know exactly how the two existing HTTP jobs authenticate before switching them to per-job secrets. |

## D. What Claude Code will do first (kickoff prompt)

`docs/school-one/prompts/KICKOFF.md` — it checks it is on the right branch, that no environment file points at production, links the CLI to the dev project (you type the password), runs the read-only inventory (P0.0), and **stops** with a report. You then continue with P0.2 → P0.3 → P0.4 → P0.9 → P0.8 → (after C1–C8) P0.6 → P0.7, one prompt at a time from `prompts/phase-0.md`.

## E. Order of the whole Phase 0

```
B1–B6 (you)  →  KICKOFF (Claude Code, stops)  →  P0.2, P0.3, P0.4, P0.9, P0.8 (Claude Code, one at a time)
             →  C1–C9 (you, any time in parallel)  →  P0.6, P0.7 (Claude Code)  →  exit checklist  →  Sunday release
```

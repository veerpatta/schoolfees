# KICKOFF — first Claude Code prompt for School One

Run from the repository root of `veerpatta/schoolfees` after completing `docs/school-one/SETUP-RUNBOOK.md` sections B1–B6. Paste everything below the line into Claude Code as one message.

---

You are starting the School One project in this repository. This is a **safety-first kickoff**: your job in this session is to verify the environment is safe, wire the Supabase CLI to the development project, produce a read-only inventory, and then **stop and report**. You will not implement any feature, migration, or refactor in this session.

## Context to load, in this order

1. `docs/school-one/CLAUDE-addendum.md` — hard rules. Read it fully.
2. `docs/school-one/BUILD-PLAN.md` — §0 (how agents use it), §1 (locked decisions and the canary model), §6 (safety rails), §7 (env names). Skim the rest.
3. `docs/school-one/prompts/phase-0.md` — the header block and prompt **P0.0** only.
4. The root `CLAUDE.md` and `AGENTS.md` — the existing financial hard rules remain in force for every task.

## Non-negotiable rules for this session

- The production Supabase project ref is `vgqyilgstjvgohrsiwkb`. It is **never** your database. If any file, environment variable, CLI link, or shell output in your session shows that ref as a target, stop immediately and tell Janmejay.
- The development project ref is `wtgxcptmucjerhufzjcf` (`schoolfees-dev`, Mumbai). It is currently **empty** (no migrations applied). Do not push migrations to it in this session — that is prompt P0.2.
- Do not run `supabase db push`, `supabase db reset`, `supabase migration repair`, or any SQL against any remote project in this session.
- Do not modify any file except `docs/school-one/inventory-phase-0.md` (new) and, if you need one, `docs/school-one/kickoff-report.md` (new).
- Do not add dependencies. Do not touch `.env*` files — if one needs changing, say so and stop.
- Never print the contents of `.env.local` or any secret; grep for the *ref string* and report only whether it was found and in which file.
- If anything is ambiguous, unexpected, or fails, stop and report rather than working around it.

## Steps

**Step 1 — Branch and tree.** Run `git status --short --branch` and `git log --oneline -3`. Confirm the branch is `school-one/phase-0` and the tree is clean apart from files under `docs/school-one/`. If the branch is `main`, stop.

**Step 2 — Environment safety check.** Without printing values:
- `grep -l "vgqyilgstjvgohrsiwkb" .env .env.local .env.development .env.production 2>/dev/null` — list only file names. Any hit other than a line that is exactly `PRODUCTION_SUPABASE_PROJECT_REF=vgqyilgstjvgohrsiwkb` means the laptop still points at production → stop and ask Janmejay to complete runbook step B4.
- Confirm `.env.local` contains `PRODUCTION_SUPABASE_PROJECT_REF=vgqyilgstjvgohrsiwkb` and `SUPABASE_DEV_PROJECT_REF=wtgxcptmucjerhufzjcf` (report present/absent only).
- `cat supabase/.temp/project-ref 2>/dev/null` — if it prints the production ref, the CLI is linked to production. Do **not** run anything else until Step 3 relinks it.
- `docker ps` (must succeed), `node -v` (must be 24.x), `npx supabase --version`.

**Step 3 — Link the CLI to the dev project.** Run `npx supabase link --project-ref wtgxcptmucjerhufzjcf`. It will prompt for the database password; **stop and ask Janmejay to type it in the terminal** — never ask for it in chat and never read it from a file. After linking, run `cat supabase/.temp/project-ref` and confirm it prints `wtgxcptmucjerhufzjcf`. Then run `npx supabase migration list` and report the **counts** (local migrations vs remote applied; remote should be 0). Do not push.

**Step 4 — Read-only inventory (prompt P0.0).** Execute prompt P0.0 from `docs/school-one/prompts/phase-0.md` exactly as written, producing `docs/school-one/inventory-phase-0.md`. It is read-only: no code changes, no network calls other than `git`.

**Step 5 — Local stack smoke (optional, only if Docker is running).** `npx supabase start` and `npx supabase status`; report whether the local stack starts cleanly and which ports it uses. Then `npx supabase stop`. If `start` fails, report the error and continue — this is diagnostic, not blocking.

**Step 6 — Baseline test run.** `npm ci` (if `node_modules` is missing), then `npm run typecheck && npm run lint && npm run test`. Report pass/fail counts. Do not attempt to fix failures in this session — record them; a pre-existing red test is a fact for the plan, not a task for today. Do **not** run `npm run build` if `.env.local` is absent or incomplete (Next build may need public env vars) — say so instead.

**Step 7 — Stop and report.** Write `docs/school-one/kickoff-report.md` with: branch state; env safety result (file names only); CLI link result; migration counts; local stack result; baseline test result; anything in the inventory that contradicts `BUILD-PLAN.md` (for example a file path the plan assumes that does not exist, a different admin-client module name, a third cron route). Commit **only** the two docs files with message `docs(school-one): kickoff inventory and report`. Then stop. Do not start P0.2.

## What "done" looks like for this session

- Branch `school-one/phase-0` with one new commit containing `inventory-phase-0.md` and `kickoff-report.md`.
- The CLI linked to `wtgxcptmucjerhufzjcf`, remote migrations = 0, no push performed.
- No file outside `docs/school-one/` changed. No environment file changed. No SQL executed remotely.
- A short list, in the report, of plan assumptions that need correcting before P0.2 runs.

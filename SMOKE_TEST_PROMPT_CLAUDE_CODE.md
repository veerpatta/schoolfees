# Deep Smoke Test Prompt — Claude Code

> Paste everything below the `--- PROMPT START ---` line into Claude Code from the repo root (`C:\Users\janme\Documents\schoolfees`). Claude Code will drive Chrome (via Playwright with the real Chrome channel, plus the Chrome DevTools / Chrome MCP if available), exercise every screen on the live VPPS Fee Admin app, and write a forensic bug report — no application-code changes.

---

## --- PROMPT START ---

You are running a **deep, end-to-end smoke test** of the VPPS Fee Admin web app in **Chrome** against the live Vercel deployment. Test every route, every button, every form field, every filter, every export, every modal — even tiny ones. Then produce a forensic bug report with root cause analysis, file:line references, and proposed fixes. You will **not change any application code**. The only files you may create are inside `tests/smoke-2026-05/` and `docs/smoke-reports/2026-05/`.

Take as much time as you need. Thoroughness beats speed. Re-run any flaky check three times before logging it as a bug.

### 0. Hard constraints (read twice)

1. **Read-only on production data.** All interactive write-paths (post payment, refund, day-close, promotion, finance corrections, fee-setup publish, delete student, commit import) must run **only** on session `TEST-2026-27` using admission numbers prefixed `TEST-`. Never mutate session `2026-27` or any real student/payment record. On `2026-27` you may navigate, view, sort, filter, search, and screenshot — nothing more.
2. **No code edits.** Do not run `Edit`/`Write`/`NotebookEdit` on `app/`, `lib/`, `components/`, `supabase/`, `scripts/` or any production source. You may create files under `tests/smoke-2026-05/` and `docs/smoke-reports/2026-05/`. You may run read-only `Bash`, `Glob`, `Grep`, and `Read` against the whole repo for root cause analysis.
3. **Browser = Chrome.** Drive Playwright with `channel: 'chrome'` (real Chrome). Headed mode. The Chrome MCP browser tools (`mcp__Claude_in_Chrome__*`) are acceptable for spot-checks, but the systematic walk must run through Playwright so every action produces a screenshot, console trace, and HAR.
4. **No real payments, no real money movement.** The Payment Desk write test on `TEST-2026-27` is the only posting allowed, and it must be ₹100 Cash against a `TEST-` student. Never click anything that moves money on the live session.
5. **Screenshot every finding.** Each bug, empty state, confusing UI, console error, or layout glitch gets a PNG under `docs/smoke-reports/2026-05/screenshots/` and is embedded in the report with `![](relative/path.png)`.
6. **Validation gate.** After all browser runs, run `npm run typecheck` and `npm run lint` from the repo root. Capture any new errors as additional findings — but still do not edit source.

### 1. Environment

| Item | Value |
|---|---|
| Production URL | `https://schoolfees-two.vercel.app` |
| Login email | `raj@vpps.co.in` |
| Login password | `46EfTz@1` |
| Test session label | `TEST-2026-27` |
| Live session (DO NOT MUTATE) | `2026-27` |
| Receipt prefix | `SVP` |
| Today's date | `2026-05-26` |
| Repo root | current working directory (`C:\Users\janme\Documents\schoolfees`) |

If `TEST-2026-27` does not exist in the session switcher, log a P0 ("test session missing") and confine the rest of the run to read-only navigation against `2026-27`. Do not create `TEST-2026-27` from the UI on production unless you have explicit confirmation it is safe — instead, document the gap.

### 2. Setup

Run once, from the repo root:

```bash
mkdir -p tests/smoke-2026-05 docs/smoke-reports/2026-05/screenshots docs/smoke-reports/2026-05/traces docs/smoke-reports/2026-05/har docs/smoke-reports/2026-05/exports docs/smoke-reports/2026-05/playwright-html
npm install --no-save @playwright/test@latest
npx playwright install chrome
```

Create `tests/smoke-2026-05/playwright.config.ts`:
- `use.channel = 'chrome'`
- `use.headless = false`
- `use.trace = 'on'`
- `use.screenshot = 'on'`
- `use.video = 'retain-on-failure'`
- `reporter = [['list'], ['html', { outputFolder: 'docs/smoke-reports/2026-05/playwright-html', open: 'never' }]]`
- Projects: `desktop` (1440×900), `tablet` (820×1180), `mobile` (390×844).
- `outputDir = 'docs/smoke-reports/2026-05/traces'`

Create a setup spec that logs in once with the creds above and saves storage state to `tests/smoke-2026-05/.auth/admin.json`. Every other spec reuses it via `use({ storageState: ... })`.

Set global listeners on every page:
- `page.on('console', m => log to artifacts/<route>.console.log)`
- `page.on('pageerror', e => same file)`
- `page.on('response', r => log non-2xx to artifacts/<route>.network.log)`
- `page.on('request', r => same)`
- HAR via `context.routeFromHAR` or context option `recordHar`.

### 3. Routes to cover (test every one)

For each: navigate, wait for network-idle, full-page screenshot, dump console/network logs, then exercise every interactive element on the page (Section 4).

**Top-nav modules (8):**
- `/protected/dashboard`
- `/protected/students`, `/protected/students/families`, `/protected/students/new`, `/protected/students/[studentId]`, `/protected/students/[studentId]/edit`, `/protected/students/[studentId]/statement`
- `/protected/students/family/[familyGroupId]/pay`, `/protected/students/family/[familyGroupId]/receipts`, `/protected/students/family/[familyGroupId]/statement`
- `/protected/fee-setup`, `/protected/fee-setup/generate`, `/protected/fee-setup/time-travel`, `/protected/fee-structure`
- `/protected/payments` (Payment Desk)
- `/protected/transactions` and aliases `/protected/dues`, `/protected/receipts`, `/protected/receipts/[receiptId]`, `/protected/ledger`
- `/protected/defaulters`
- `/protected/exports`
- `/protected/admin-tools`, `/protected/admin-tools/session-health`, `/protected/admin-tools/whatsapp-templates`, `/protected/admin-tools/activity`, `/protected/admin-tools/promotion`, `/protected/admin-tools/promotion/[runId]`

**Admin-tools hub destinations:**
- `/protected/staff`, `/protected/settings`, `/protected/master-data`, `/protected/finance-controls`, `/protected/imports`, `/protected/setup`, `/protected/reports`, `/protected/reports/ledger/[studentId]/print`, `/protected/password`, `/protected/access-denied`

**Aliases & redirects (verify each lands correctly):**
- `/protected/advanced` → `/protected/admin-tools`
- `/protected/collections` → `/protected/payments`
- `/protected/dues` → `/protected/transactions`
- `/protected/receipts` → `/protected/transactions`
- `/protected/ledger` → `/protected/transactions`
- `/protected/fee-structure` → `/protected/fee-setup`

**Public + auth:**
- `/` (root) — verify unauth redirect
- The sign-in surface (discover via the unauth root redirect, screenshot it)
- `/auth/confirm` — loads without 500

**API smoke (HEAD/GET only):**
- `GET /api/manifest`
- `GET /protected/students/index`
- `GET /protected/payments/student-summary?studentId=<TEST_STUDENT>`
- `GET /protected/transactions/data`
- `GET /protected/receipts/search?q=SVP`

### 4. What to test on every page

**Loading & rendering**
- Initial render < 5s on broadband (flag slower as P3 perf).
- Zero console errors. Zero React hydration warnings. Zero failed network requests.
- All images render. All icons render. Fonts loaded.

**Interactive elements — exercise every single one:**
- Buttons → click, capture before/after screenshots.
- Links → hover, verify target, navigate, verify destination.
- Inputs → valid + invalid + empty + boundary values. Test Unicode, leading/trailing spaces, `O'Brien`-style apostrophes, emoji, RTL strings, very long strings (`maxLength + 1`).
- Date pickers → past, future, leap-day, and the four installment dates `20-04-2026`, `20-07-2026`, `20-10-2026`, `20-01-2027`.
- Number inputs → `0`, negative, very large (`99999999`), decimals (`100.50`), non-numeric.
- Dropdowns / selects → open, scroll, search if searchable, pick first/middle/last.
- Multi-selects → add, remove, clear all.
- Filters & sort headers on every table → apply each, combine two, clear, re-apply.
- Pagination → first, prev, next, last, jump, change page size.
- Modals → open, dismiss via X / ESC / backdrop, submit empty, submit valid.
- Toasts → confirm auto-dismiss + copy clarity.
- Tabs → click each, verify URL/state updates.
- Accordions → expand all, collapse all.
- Tooltips → hover trigger, screenshot.
- Keyboard nav → Tab through the page; verify visible focus ring + logical order; Enter activates focused buttons; ESC closes the topmost overlay.

**RBAC** — admin is the only available account. After exercising as admin, scrape the rendered top-nav + mobile bottom-nav and compare to the expected output of `getVisibleProtectedNavigation('admin')` and `getMobileBottomNavigation('admin')` (read `lib/config/navigation.ts`). Log any drift.

**Empty states** — on every list page, filter to a guaranteed-empty result (search `ZZZZZZ`). Screenshot. Log missing/ugly/misleading empty states.

**Long-data states** — sort each table by the longest-text column; verify no overflow.

**Responsive** — re-run navigation across all top-nav routes at mobile (390×844) and tablet (820×1180). Verify the mobile bottom nav from `getMobileBottomNavigation` is present, every tap target is ≥ 44px, no horizontal scroll appears.

**Print views**
- `/protected/receipts/[receiptId]` — `page.emulateMedia({ media: 'print' })`, screenshot.
- `/protected/reports/ledger/[studentId]/print` (use a `TEST-` student) — same.
- `/protected/students/[studentId]/statement` — same.

**Exports** — for every entry on `/protected/exports`: click download, capture the download event, save to `docs/smoke-reports/2026-05/exports/<exportType>.xlsx`. Assert file is non-empty and is a valid zip (`unzip -l` from Bash).

**Imports** — on `/protected/imports`:
- Download the template from `/protected/imports/template`.
- Fill 3 valid + 3 invalid `TEST-` rows (the invalid ones should violate at least three different rules: bad class, bad date, missing required field, duplicate admission).
- Upload, walk through column mapping, run the dry-run validation, **do not commit**. Screenshot each step (upload, mapping, dry-run summary, per-row errors).

**Payment Desk write path (TEST-2026-27 only)**
- Switch session to `TEST-2026-27` (UI session switcher).
- Search a `TEST-` student.
- Open the payment preview; confirm allocation matches expectations from `lib/payments/allocation.ts` and `lib/payments/payment-desk-workflow.ts`.
- Post ₹100 Cash. Verify: receipt number prefixed `SVP`, student summary refreshes without manual reload, transaction appears under `/protected/transactions`, the new row also appears on the dashboard "Today collection" tile.
- Attempt to edit/delete the posted payment from any UI surface. The append-only rule means this **must be blocked**. Log a P0 if any surface allows it.
- Open `/protected/finance-controls`, submit an adjustment for the same payment via the `payment_adjustments` flow. Verify audit trail entry appears.

**Conventional discount sanity (read-only)**
- Find a `TEST-` student with RTE / Staff Child / 3rd Child policy if one exists, navigate to their profile, and verify the tuition line matches the rules from `lib/fees/conventional-discount-rules.ts` (RTE→0, Staff Child→50%, 3rd Child→₹6,000). If no such test student exists, log a P3 gap.

**Negative / abuse**
- `GET /protected/students/9999999` → expect a graceful not-found, not a 500.
- Double-click submit buttons rapidly → no double-post.
- Refresh mid-flow on Fee Setup publish and Import wizard → expect state recovery or a clear "start over" message.
- Open the app in a second tab while editing → verify last-write-wins or conflict warning.
- Visit `/protected/staff` while the rendered nav suggests it shouldn't be shown → expect `/protected/access-denied`. (For admin this is moot; document the expected behavior.)

**Console / network watch (always on)** — per-spec HAR to `docs/smoke-reports/2026-05/har/<spec>.har`, traces to `docs/smoke-reports/2026-05/traces/<spec>.zip`.

### 5. Root cause analysis (for every bug)

Do not edit anything. For each bug, after the browser run:

1. Reproduce locally in your head: read the route file under `app/protected/<module>/page.tsx` and the matching `lib/<module>/` and `components/<module>/`.
2. Grep for the failing copy / selector / API path with the `Grep` tool to pinpoint the originating file.
3. Read the file and surrounding functions (Read tool, narrow line ranges — don't dump huge files).
4. Identify the smallest plausible cause — bad selector, missing `await`, race condition, wrong RBAC check, missing error boundary, stale React Server Component cache, missing revalidation tag, etc.
5. Cite **file path + line number** of the most likely fault (e.g. `lib/payments/allocation.ts:142`).
6. Propose the minimal fix in prose or a small inline diff in the report — **but do not run Edit/Write on the source file**.

Route → module map (start your grep here):

| Surface | Source roots |
|---|---|
| Payments | `app/protected/payments`, `lib/payments/`, `components/payments/` |
| Students | `app/protected/students`, `lib/students/`, `components/students/` |
| Fee Setup | `app/protected/fee-setup`, `lib/setup/`, `lib/fees/`, `components/fees/` |
| Imports | `app/protected/imports`, `lib/import/`, `components/imports/` |
| Transactions | `app/protected/transactions`, `lib/transactions/`, `lib/ledger/`, `lib/reports/` |
| Defaulters | `app/protected/defaulters`, `lib/defaulters/` |
| Exports | `app/protected/exports`, `lib/reports/` |
| Admin tools | `app/protected/admin-tools`, `app/protected/finance-controls`, `app/protected/master-data`, `app/protected/staff`, `app/protected/settings` |
| Auth / RBAC | `lib/auth/roles.ts`, `lib/supabase/session.ts`, `lib/config/navigation.ts` |
| Session resolver | `lib/session/active.ts`, `lib/session/switcher.ts` |
| Fee policy | `lib/config/fee-rules.ts`, `lib/fees/policy.ts`, `lib/fees/regeneration.ts`, `lib/fees/generator.ts` |
| Discount rules | `lib/fees/conventional-discounts.ts`, `lib/fees/conventional-discount-rules.ts` |
| Workbook engine | `lib/workbook/`, plus DB objects `v_workbook_student_financials`, `v_workbook_installment_balances`, `v_student_financial_state`, `preview_workbook_payment_allocation`, `post_student_payment` |
| Schema | `supabase/schema.sql`, `supabase/migrations/` (73 migrations) |
| System sync | `lib/system-sync/finance-revalidation.ts` |
| Env / clients | `lib/env.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`, `lib/supabase/admin.ts` |

### 6. Bug classification

- **P0 — blocker:** breaks a critical flow (login, payment posting, receipt print, RBAC bypass, data loss, append-only violation), or a 500 on any top-nav page.
- **P1 — major:** primary feature broken or unusable; ugly workaround exists.
- **P2 — minor:** secondary feature broken, copy issues, mobile layout breaks, perf > 5s.
- **P3 — polish:** UI inconsistencies, missing focus states, contrast issues, missing tooltips, redundant clicks.

### 7. Report structure

Write the final report to `docs/smoke-reports/2026-05/SMOKE_TEST_REPORT.md` using this exact structure:

```
# VPPS Fee Admin — Deep Smoke Test Report
Run date: 2026-05-26
Tester: Claude Code (Playwright + real Chrome, headed)
Target: https://schoolfees-two.vercel.app
Test session: TEST-2026-27

## Executive summary
- N pages tested, N interactive elements exercised, N bugs found
- P0: n   P1: n   P2: n   P3: n
- Top 5 things to fix this week (one line each)

## Coverage matrix
| Route | Desktop | Mobile | Tablet | Console errors | Network errors | Notes |
|---|---|---|---|---|---|---|

## Bugs (one section per bug)

### BUG-001 — <one-line title>     [P0|P1|P2|P3]
- Surface: /protected/<route>
- Repro steps: 1. ... 2. ... 3. ...
- Expected: ...
- Actual: ...
- Screenshot: ./screenshots/bug-001-before.png  (and -after.png if state changed)
- Console / network log (relevant excerpt): ...
- Suspected file:line: lib/payments/allocation.ts:142
- Root cause hypothesis: <2–4 sentences>
- Proposed fix: <minimal change in prose or a tiny diff; do not edit the code>
- Risk if shipped as-is: <one sentence>

(repeat for every bug)

## UI / UX observations (non-bug polish)
- Same template, tagged "UX" instead of a P-rating.

## Performance notes
- Slowest pages (sorted by TTI). Include LCP / CLS if captured.

## Accessibility quick-check
- Pages with insufficient contrast, missing alt text, missing focus rings, missing aria-labels, tap targets < 44px on mobile.

## RBAC observations
- Nav items rendered for admin vs. expected from getVisibleProtectedNavigation('admin').
- Any control that surfaced unexpectedly.

## Validation gate results
- `npm run typecheck` output (pass/fail; new errors only).
- `npm run lint` output (pass/fail; new errors only).

## What was NOT tested and why
- Anything you skipped (e.g. live 2026-27 mutations, additional roles). Explain the safety rationale.

## Appendix
- Playwright HTML report: ./playwright-html/index.html
- HARs: ./har/
- Traces: ./traces/ (open with `npx playwright show-trace <file>`)
- Exports verified: ./exports/
```

Embed every screenshot inline in its bug section using markdown `![alt](relative/path.png)`.

### 8. Execution order

1. Setup (Section 2).
2. Auth setup spec → save storage state.
3. Desktop project: every route in Section 3 (read-only on `2026-27`, write paths on `TEST-2026-27`).
4. Mobile + tablet projects: every top-nav route.
5. Exports verification.
6. Imports wizard dry-run.
7. Payment Desk write path on `TEST-2026-27` (₹100 Cash → adjustment).
8. Negative / abuse cases.
9. `npm run typecheck` + `npm run lint`.
10. Root-cause analysis for every bug (Grep + Read; no Edit).
11. Write the report.
12. Re-run any flaky test 3× before confirming it as a bug.
13. Final reply: print the absolute path of `SMOKE_TEST_REPORT.md`, the P0/P1/P2/P3 counts, and a 5-bullet headline of the most important findings.

### 9. Safety reminders

- Never edit, delete, or rewrite any row in `payments` or `receipts` on `2026-27`.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or read `.env.local` content into chat output.
- Never commit anything to git; leave the workspace dirty for the user to review.
- If anything looks like it might mutate live financial data, **stop and ask** in the report's "What was NOT tested" section rather than proceeding.

## --- PROMPT END ---

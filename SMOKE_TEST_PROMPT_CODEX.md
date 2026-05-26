# Deep Smoke Test Prompt — Codex CLI

> Paste everything below the `--- PROMPT START ---` line into Codex CLI from the repo root (`C:\Users\janme\Documents\schoolfees`). Codex will drive Chrome via Playwright, exercise every screen on the live VPPS Fee Admin app, and write a forensic bug report — no code changes.

---

## --- PROMPT START ---

You are running a **deep, end-to-end smoke test** of the VPPS Fee Admin web app in **Chrome** against the live Vercel deployment. You must test every route, every button, every form field, every filter, every export, and every modal — even tiny ones. Then produce a forensic bug report with root cause analysis, file:line references, and proposed fixes. You will **not change any application code**. You will only create files inside `tests/smoke-2026-05/` and `docs/smoke-reports/2026-05/`.

### 0. Hard constraints (read twice)

1. **Read-only on production data.** The target session for all interactive testing is `TEST-2026-27`. Never post a payment, never create/edit/delete any record on the live `2026-27` session, never run an Export against `2026-27` that mutates anything. Refunds, day-close, promotion, finance corrections, fee-setup publish, and student deletes are **forbidden** on the live session — only execute these on `TEST-2026-27` with `TEST-` prefixed admission numbers.
2. **No code edits.** Do not run `Edit`, `Write`, or `git commit` against `app/`, `lib/`, `components/`, `supabase/`, or any production source file. Writing test scripts and reports under `tests/smoke-2026-05/` and `docs/smoke-reports/2026-05/` is allowed.
3. **Browser = Chrome (Chromium channel).** Use Playwright with `channel: 'chrome'` (real Chrome, not bundled Chromium). Headed mode so the user can watch.
4. **Take as much time as needed.** Thoroughness > speed. Re-run any flaky check 3 times before logging it as a bug. Wait for network-idle on every navigation.
5. **Screenshot everything.** Every bug, every confusing UI, every empty state, every error toast, every console error gets a PNG saved into `docs/smoke-reports/2026-05/screenshots/` and referenced by relative path in the report.

### 1. Environment

| Item | Value |
|---|---|
| Production URL | `https://schoolfees-two.vercel.app` |
| Login email | `raj@vpps.co.in` |
| Login password | `46EfTz@1` |
| Test session label | `TEST-2026-27` |
| Live session (DO NOT MUTATE) | `2026-27` |
| Receipt prefix | `SVP` |
| Date today | `2026-05-26` |
| Repo root | current working directory |

If `TEST-2026-27` does not exist in the session switcher, **stop testing write-paths**, log a P0 bug ("test session missing"), and confine the rest of the run to read-only navigation on `2026-27`.

### 2. Setup commands

Run these once, in order:

```bash
mkdir -p tests/smoke-2026-05 docs/smoke-reports/2026-05/screenshots docs/smoke-reports/2026-05/traces docs/smoke-reports/2026-05/har
npm install --no-save @playwright/test@latest
npx playwright install chrome
```

Create `tests/smoke-2026-05/smoke.config.ts` with:
- `use.channel = 'chrome'`
- `use.headless = false`
- `use.viewport = { width: 1440, height: 900 }`
- `use.trace = 'on'`
- `use.screenshot = 'on'`
- `use.video = 'retain-on-failure'`
- `reporter = [['list'], ['html', { outputFolder: 'docs/smoke-reports/2026-05/playwright-html' }]]`
- A second project entry for `viewport: { width: 390, height: 844 }` (mobile) and `viewport: { width: 820, height: 1180 }` (tablet) so every screen is also captured at small sizes.

Save the auth state to `tests/smoke-2026-05/.auth/admin.json` once via a setup spec, then reuse `storageState` in every other spec.

### 3. Routes to cover (every single one)

For each route below: navigate, wait for network-idle, screenshot full page, dump console errors + failed network requests, then exercise every interactive element on the page (see Section 4). All routes are under `https://schoolfees-two.vercel.app`.

**Top-nav modules (8):**
- `/protected/dashboard`
- `/protected/students` (and `/protected/students/families`, `/protected/students/new`, `/protected/students/[studentId]`, `/protected/students/[studentId]/edit`, `/protected/students/[studentId]/statement`, `/protected/students/family/[familyGroupId]/pay`, `/protected/students/family/[familyGroupId]/receipts`, `/protected/students/family/[familyGroupId]/statement`)
- `/protected/fee-setup` (and `/protected/fee-setup/generate`, `/protected/fee-setup/time-travel`, `/protected/fee-structure`)
- `/protected/payments` (Payment Desk — read flows only on `2026-27`; full posting flow only on `TEST-2026-27`)
- `/protected/transactions` (and aliases `/protected/dues`, `/protected/receipts`, `/protected/receipts/[receiptId]`, `/protected/ledger`)
- `/protected/defaulters`
- `/protected/exports` (download each XLSX into `docs/smoke-reports/2026-05/exports/` and verify file exists, has > 0 bytes, opens as a valid XLSX)
- `/protected/admin-tools` (and every sub-page: `/protected/admin-tools/session-health`, `/protected/admin-tools/whatsapp-templates`, `/protected/admin-tools/activity`, `/protected/admin-tools/promotion`, `/protected/admin-tools/promotion/[runId]`)

**Admin-tools hub destinations:**
- `/protected/staff`
- `/protected/settings`
- `/protected/master-data`
- `/protected/finance-controls`
- `/protected/imports`
- `/protected/setup`
- `/protected/reports`
- `/protected/reports/ledger/[studentId]/print` (parametrize with a `TEST-` student)
- `/protected/password`
- `/protected/access-denied`
- `/protected/advanced` (legacy redirect — verify it lands on `/protected/admin-tools`)
- `/protected/collections` (alias — verify redirect to `/protected/payments`)
- `/protected/dues` (alias — verify redirect to `/protected/transactions`)

**Public + auth routes:**
- `/` (root)
- `/login` (or wherever the sign-in surface lives — discover via the unauth root redirect)
- `/auth/confirm` (verify it loads without erroring)

**API smoke (HEAD/GET only on idempotent endpoints):**
- `GET /api/manifest`
- `GET /protected/students/index` (search behavior)
- `GET /protected/payments/student-summary?studentId=<TEST_STUDENT>`
- `GET /protected/transactions/data`
- `GET /protected/receipts/search?q=SVP`

### 4. What to test on every page

Walk every page through this checklist. For each finding, log a row in the bug report (see Section 7).

**Loading & rendering**
- Initial render < 5s on broadband. Log slower pages as P3 perf.
- No console errors (capture via `page.on('console', …)` and `page.on('pageerror', …)`).
- No failed network requests (capture 4xx/5xx via `page.on('response', …)`). Ignore expected 401s on logged-out probes.
- No hydration warnings, no React key warnings, no act() warnings.
- All images render (no broken alt fallbacks).
- All icons render (no missing-glyph squares).
- Fonts loaded (no FOUT/FOIT).

**Interactive elements** — for EVERY element on the page:
- Buttons: click, observe result, screenshot before/after.
- Links: hover (check href shown in status bar), click, verify destination.
- Form inputs: type valid + invalid + empty + boundary values (max-length+1, Unicode, leading/trailing spaces, SQL-ish strings like `O'Brien`, emoji, RTL text). Capture validation messages.
- Date pickers: invalid date, past date, future date, leap-day, the four installment due dates `20-04-2026`, `20-07-2026`, `20-10-2026`, `20-01-2027`.
- Number inputs: `0`, negative, very large (`99999999`), decimals (`100.50`), non-numeric.
- Dropdowns / selects: open, scroll, search if searchable, pick first/middle/last option.
- Multi-selects, chip inputs, tag inputs: add, remove, clear all.
- Filters & sort headers on tables: apply each, combine two, clear, re-apply.
- Pagination: first, prev, next, last, jump-to-page, change page size.
- Modals / dialogs: open, dismiss via close button, dismiss via ESC, dismiss via backdrop click, submit empty, submit valid.
- Toasts: confirm they auto-dismiss, confirm copy is clear, screenshot.
- Tabs: click each, verify content swaps and URL hash updates if applicable.
- Accordions / disclosures: expand all, collapse all.
- Tooltips: hover the trigger, screenshot.
- Drag-and-drop (if any): exercise.
- Keyboard nav: Tab through the page once, verify focus rings are visible and order is logical. Try Enter on focused buttons.
- ESC closes the topmost overlay.

**RBAC** — log in as the admin once, then exercise each module. Note any control that appears for `read_only_staff` but should not (review `lib/auth/roles.ts` and `lib/config/navigation.ts` — visibility is permission-driven). You do **not** need additional accounts; instead, scrape the rendered nav and compare it against `getVisibleProtectedNavigation('admin')` expectations.

**Empty states**
- Filter to a guaranteed-empty result (e.g. search `ZZZZZZ`) on every list page. Capture the empty-state UI. Log if the empty state is missing, ugly, or misleading.

**Long-data states**
- On every table, sort by a column with long text. Verify no overflow/clipping.

**Mobile (390x844) + tablet (820x1180)**
- Re-run navigation across all top-nav routes. Verify the mobile bottom nav from `getMobileBottomNavigation` is present, every item is tappable, and no horizontal scroll appears.

**Receipt + print views**
- Open a receipt detail (`/protected/receipts/[receiptId]`) for a known `TEST-` receipt; trigger print preview via `page.emulateMedia({ media: 'print' })` and screenshot. Same for `/protected/reports/ledger/[studentId]/print` and `/protected/students/[studentId]/statement`.

**Exports** — for each entry on `/protected/exports`:
- Click the download button, wait for the download event, save into `docs/smoke-reports/2026-05/exports/<exportType>.xlsx`, assert the file is non-empty and parses with a quick `unzip -l` check.

**Imports** — open `/protected/imports`, walk the staged workflow with the template downloaded from `/protected/imports/template`, fill 3 valid + 3 invalid `TEST-` rows, run the dry-run validation, **do not commit**. Screenshot every step (upload, mapping, dry-run results, per-row errors).

**Payment Desk write path (TEST-2026-27 only)**
- Switch session to `TEST-2026-27`.
- Search a `TEST-` student.
- Open the preview (`/protected/payments/preview` via UI), confirm projected allocation matches expectations from `lib/payments/allocation.ts`.
- Post a small payment (₹100 Cash) — verify receipt prefix is `SVP`, receipt is non-null, student summary updates without manual refresh, and a row appears under `/protected/transactions`.
- Try to edit/delete the posted payment from any UI surface — this **must be blocked** (append-only rule). Log a P0 if any surface allows it.
- Open `/protected/finance-controls` → submit an adjustment for the same payment via `payment_adjustments`. Verify the audit trail entry appears.

**Negative / abuse cases**
- Directly visit `/protected/staff` if any non-admin nav appears to expose it. Expect `/protected/access-denied`.
- Hit a fake `/protected/students/9999999` — expect a graceful not-found, not a 500.
- Submit any form twice rapidly (double-click) — verify it doesn't double-post.
- Refresh in the middle of a multi-step flow (Fee Setup publish preview, Import wizard) — verify state recovery or a clear "start over" message.
- Open in a second tab while editing — verify last-write-wins or a conflict warning.

**Console / network watch (always on)**
- Save full HAR per spec to `docs/smoke-reports/2026-05/har/<spec>.har`.
- Save full trace per spec to `docs/smoke-reports/2026-05/traces/<spec>.zip`.

### 5. Root cause analysis (for every bug)

After the browser run, for each bug:
1. Reproduce locally if possible by reading the relevant source. Use the route → module mapping below.
2. Grep for the failing copy / selector / API path to find the originating file.
3. Read the file and the closest functions (don't change anything).
4. Identify the smallest plausible cause — bad selector, missing await, race condition, wrong RBAC check, missing error boundary, stale cache, etc.
5. Cite **file path + line number** of the most likely fault (e.g. `lib/payments/allocation.ts:142`).
6. Propose the minimal fix (a sentence or a 5-line diff in prose — **do not actually edit the file**).

Route → module map (use this to start the grep):

| Surface | Source roots |
|---|---|
| Payments | `app/protected/payments`, `lib/payments/*`, `components/payments/*` |
| Students | `app/protected/students`, `lib/students/*`, `components/students/*` |
| Fee Setup | `app/protected/fee-setup`, `lib/setup/*`, `lib/fees/*`, `components/fees/*` |
| Imports | `app/protected/imports`, `lib/import/*`, `components/imports/*` |
| Transactions | `app/protected/transactions`, `lib/transactions/*`, `lib/ledger/*`, `lib/reports/*` |
| Defaulters | `app/protected/defaulters`, `lib/defaulters/*` |
| Exports | `app/protected/exports`, `lib/reports/*` |
| Admin tools | `app/protected/admin-tools`, `app/protected/finance-controls`, `app/protected/master-data`, `app/protected/staff`, `app/protected/settings` |
| Auth / RBAC | `lib/auth/roles.ts`, `lib/supabase/session.ts`, `lib/config/navigation.ts` |
| Session resolver | `lib/session/active.ts`, `lib/session/switcher.ts` |
| Fee policy | `lib/config/fee-rules.ts`, `lib/fees/policy.ts`, `lib/fees/regeneration.ts` |
| Schema / migrations | `supabase/schema.sql`, `supabase/migrations/` |

### 6. Bug classification

- **P0 — blocker:** breaks a critical flow (login, payment posting, receipt print, RBAC bypass, data loss, append-only violation), or a 500 on any top-nav page.
- **P1 — major:** a primary feature is broken or unusable; workaround exists but ugly.
- **P2 — minor:** secondary feature broken, copy issues, layout breaks on mobile, slow performance > 5s.
- **P3 — polish:** UI inconsistencies, missing focus states, contrast issues, missing tooltips, redundant clicks.

### 7. Report structure

Write the final report to `docs/smoke-reports/2026-05/SMOKE_TEST_REPORT.md` using this exact structure:

```
# VPPS Fee Admin — Deep Smoke Test Report
Run date: 2026-05-26
Tester: Codex CLI (Playwright + real Chrome, headed)
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
- Console / network log: <paste relevant excerpt>
- Suspected file:line: lib/payments/allocation.ts:142
- Root cause hypothesis: <2–4 sentences>
- Proposed fix: <minimal change in prose; do not edit the code>
- Risk if shipped as-is: <one sentence>

(repeat for every bug)

## UI / UX observations (non-bug polish)
- Use the same template, but tagged "UX" instead of a P-rating.

## Performance notes
- Slowest pages (sorted by TTI). Include LCP / CLS if captured.

## Accessibility quick-check
- Pages with insufficient contrast, missing alt text, missing focus rings, missing aria-labels.

## What was NOT tested and why
- Anything you skipped (e.g. live 2026-27 mutations) — explain the safety rationale.

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
3. Smoke spec, desktop project, every route in Section 3 (read-only on `2026-27`, write paths on `TEST-2026-27`).
4. Smoke spec, mobile + tablet projects, every top-nav route.
5. Exports verification.
6. Imports wizard dry-run.
7. Payment Desk write path on `TEST-2026-27` (small ₹100 cash, then adjustment).
8. Negative/abuse cases.
9. Read source for root-cause analysis on every bug found.
10. Write the report.
11. Final pass: re-run any flaky test 3x; if still failing, log as confirmed.
12. Print the report path and a one-line summary at the end.

### 9. When you finish

- Reply with the absolute path of `SMOKE_TEST_REPORT.md`, the P0/P1/P2/P3 counts, and a 5-bullet headline of the most important findings.
- Do not commit anything to git. Leave the workspace dirty for the user to review.

## --- PROMPT END ---

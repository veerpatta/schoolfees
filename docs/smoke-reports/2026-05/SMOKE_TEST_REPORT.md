# VPPS Fee Admin — Deep Smoke Test Report
Run date: 2026-05-26
Tester: Codex CLI (Playwright + real Chrome, headed)
Target: https://schoolfees-two.vercel.app
Test session: TEST-2026-27

## Executive summary
- 57 page/viewport captures tested, 5,004 interactive elements counted and exercised by the route crawler, 8 bugs found.
- P0: 0   P1: 4   P2: 2   P3: 2
- Top 5 things to fix this week:
- Finance Controls renders the protected error boundary for admin instead of the day-book workflow.
- Protected dynamic not-found routes render as server errors for missing students and promotion runs.
- `/protected/payments/student-summary?studentId=...` rejects the documented smoke GET unless `paymentDate` is supplied.
- Student list photo lookups generate repeated 404 noise on tablet.
- Payment confirmation modal does not close with ESC, which hurts keyboard recovery in the cashier flow.

## Coverage matrix
| Route | Desktop | Mobile | Tablet | Console errors | Network errors | Notes |
|---|---|---|---|---|---|---|
| `/` | Pass | n/a | n/a | 0 | 0 | Public root loaded. |
| `/auth/login` | Pass | n/a | n/a | 0 | 0 | Login surface loaded; auth state saved. |
| `/auth/confirm` | Pass | n/a | n/a | 0 | 0 | Loaded without crash. |
| `/protected/dashboard` | Pass | Pass | Pass | 0 | 0 | Desktop 5.6s, mobile/tablet just over 5s. |
| `/protected/students` | Pass | Pass | Pass | 14 total | 14 total | Desktop/tablet network-idle slow; tablet photo 404s. |
| `/protected/students/families` | Pass | n/a | n/a | 0 | 0 | Desktop 6.4s. |
| `/protected/students/new` | Pass | n/a | n/a | 0 | 0 | Desktop 10.2s. No submit executed. |
| `/protected/students/[studentId]` | Pass | n/a | n/a | 0 | 0 | TEST student `TEST-NUR-001`. |
| `/protected/students/[studentId]/edit` | Pass | n/a | n/a | 0 | 0 | Loaded only; no save executed. |
| `/protected/students/[studentId]/statement` | Pass | n/a | n/a | 0 | 0 | Print media screenshot exercised. |
| `/protected/students/9999999` | Fail | n/a | n/a | 3 | 0 | Generic protected error instead of graceful not-found. |
| `/protected/fee-setup` | Pass | Pass | Pass | 0 | 0 | Desktop 6.5s. No publish mutation executed. |
| `/protected/fee-setup/generate` | Pass | n/a | n/a | 0 | 0 | Desktop 10.0s. |
| `/protected/fee-setup/time-travel` | Pass | n/a | n/a | 0 | 0 | Desktop 5.6s. |
| `/protected/fee-structure` | Pass | n/a | n/a | 0 | 0 | Alias content loaded. |
| `/protected/payments` | Pass | Pass | Pass | 0 | 0 | TEST write path posted one Rs 100 Cash payment. |
| `/protected/transactions` | Pass | Pass | Pass | 0 | 0 | Desktop 10.1s, tablet 9.9s. |
| `/protected/dues` | Pass | n/a | n/a | 0 | 0 | Redirected to Transactions in source; crawler later moved via nav. |
| `/protected/receipts` | Pass | n/a | n/a | 0 | 0 | Loaded receipt search/list. |
| `/protected/receipts/[receiptId]` | Pass | n/a | n/a | 0 | 0 | Receipt `66630f9a-e285-4add-aeec-1bd3f908402a`. |
| `/protected/ledger` | Pass | n/a | n/a | 0 | 0 | Loaded ledger alias surface. |
| `/protected/defaulters` | Partial | Pass | Pass | 1 | 0 | Desktop route crawl aborted once; mobile logged a TransactionsShell fetch error. |
| `/protected/exports` | Pass | Partial | Partial | 0 | 0 | Desktop loaded slowly; mobile/tablet crawler hit `net::ERR_ABORTED`. Export downloads verified separately. |
| `/protected/admin-tools` | Pass | Pass | Pass | 0 | 0 | Admin nav visible as expected. |
| `/protected/admin-tools/session-health` | Pass | n/a | n/a | 0 | 0 | Desktop 6.6s. |
| `/protected/admin-tools/whatsapp-templates` | Pass | n/a | n/a | 0 | 0 | Loaded. |
| `/protected/admin-tools/activity` | Pass | n/a | n/a | 0 | 0 | Desktop 5.9s. |
| `/protected/admin-tools/promotion` | Pass | n/a | n/a | 0 | 0 | Loaded. |
| `/protected/admin-tools/promotion/[runId]` | Fail | n/a | n/a | 1 | 0 | Missing run renders generic protected error. |
| `/protected/staff` | Pass | n/a | n/a | 0 | 0 | Admin account allowed; RBAC source matches admin visibility. |
| `/protected/settings` | Pass | n/a | n/a | 0 | 0 | Desktop 7.0s. |
| `/protected/master-data` | Pass | n/a | n/a | 0 | 0 | 602 controls counted. |
| `/protected/finance-controls` | Fail | n/a | n/a | 1 | 0 | Admin sees protected error boundary. |
| `/protected/imports` | Pass | n/a | n/a | 0 | 0 | Template upload reached validated/re-check-disabled state; no commit. |
| `/protected/setup` | Pass | n/a | n/a | 0 | 0 | Desktop 10.2s. |
| `/protected/reports` | Pass | n/a | n/a | 0 | 0 | Desktop 9.8s. |
| `/protected/reports/ledger/[studentId]/print` | Pass | n/a | n/a | 0 | 0 | DOM captured; screenshot timed out once. |
| `/protected/password` | Pass | n/a | n/a | 0 | 0 | Loaded. |
| `/protected/access-denied` | Pass | n/a | n/a | 0 | 0 | Loaded. |
| `/protected/advanced` | Pass | n/a | n/a | 0 | 0 | Source redirects to `/protected/admin-tools`. |
| `/protected/collections` | Pass with bug | n/a | n/a | 0 | 0 | Renders Payment Desk but URL does not redirect. |
| API `/api/manifest` | Pass | n/a | n/a | 0 | 0 | 200 JSON. |
| API `/protected/students/index?query=ZZZZZZ` | Pass | n/a | n/a | 0 | 0 | 200 empty-state JSON. |
| API `/protected/payments/student-summary?studentId=...` | Fail | n/a | n/a | 0 | 1 | 400 without `paymentDate`. |
| API `/protected/transactions/data` | Pass | n/a | n/a | 0 | 0 | 200 JSON. |
| API `/protected/receipts/search?q=SVP` | Pass | n/a | n/a | 0 | 0 | 200 JSON. |

## Bugs (one section per bug)

### BUG-001 — Finance Controls route renders protected error boundary     [P1]
- Surface: `/protected/finance-controls`
- Repro steps: 1. Log in as admin. 2. Switch to `TEST-2026-27`. 3. Visit `/protected/finance-controls`.
- Expected: Daily close, refund approvals, correction review rows, cashier totals, and day-book export controls render for admin.
- Actual: The page shell renders "The protected workspace hit an error" and the browser logs a production Server Components render error.
- Screenshot: `./screenshots/desktop-chrome-protected-finance-controls.png`
![Finance Controls protected error](./screenshots/desktop-chrome-protected-finance-controls.png)
- Console / network log: `Error: An error occurred in the Server Components render. The specific message is omitted in production builds...`
- Suspected file:line: `app/protected/finance-controls/page.tsx:36`, `lib/finance-controls/data.ts:571`
- Root cause hypothesis: The page starts `getFinanceControlsPageData(selectedDate)` during server render. That loader queries `receipts`, `refund_requests`, `payment_adjustments`, `collection_closures`, and then `payment_adjustment_reviews`; any Supabase error is thrown and bubbles into the generic protected error boundary. The most likely live fault is schema/RLS/grant drift on one of the newer finance-control tables, because the production message is hidden and the page does not degrade optional panels.
- Proposed fix: Verify the live Mumbai project has the finance-control migrations and select grants for all four tables, then make optional panels resilient: catch per-section loader errors, render an empty/error panel, and log the exact table failure server-side instead of throwing the whole route.
- Risk if shipped as-is: Admins cannot use finance controls, adjustment review, day close, or day-book export from the live app.

### BUG-002 — Invalid student detail URL crashes instead of showing not-found     [P1]
- Surface: `/protected/students/9999999`
- Repro steps: 1. Log in as admin. 2. Visit `/protected/students/9999999?session=TEST-2026-27`. 3. Observe the protected error state.
- Expected: A graceful student not-found page with a route back to Students.
- Actual: The generic protected workspace error renders; console also logs the Server Components render error and React minified error #419.
- Screenshot: `./screenshots/desktop-chrome-protected-students-9999999.png`
![Invalid student protected error](./screenshots/desktop-chrome-protected-students-9999999.png)
- Console / network log: `Server Components render...`; `Minified React error #419`
- Suspected file:line: `app/protected/students/[studentId]/page.tsx:92`
- Root cause hypothesis: The page loads `getStudentDeletionSafety`, `getStudentFamilyMembersDetail`, and share links before checking `if (!student) notFound()`. For a fake ID, one of those dependent reads can throw before the intended not-found branch at lines 102-104.
- Proposed fix: Move the `if (!student) notFound()` guard immediately after `getStudentWorkspaceData(resolvedParams.studentId)` and before any deletion/family/share-link queries.
- Risk if shipped as-is: Bad bookmarks or mistyped student links look like production outages instead of ordinary missing records.

### BUG-003 — Missing promotion run renders protected error instead of not-found     [P1]
- Surface: `/protected/admin-tools/promotion/smoke-missing-run`
- Repro steps: 1. Log in as admin. 2. Visit `/protected/admin-tools/promotion/smoke-missing-run?session=TEST-2026-27`. 3. Observe the protected error state.
- Expected: A promotion-run not-found page or a clear "run no longer exists" message.
- Actual: The generic protected workspace error renders.
- Screenshot: `./screenshots/desktop-chrome-protected-admin-tools-promotion-smoke-missing-run.png`
![Missing promotion run protected error](./screenshots/desktop-chrome-protected-admin-tools-promotion-smoke-missing-run.png)
- Console / network log: `Error: An error occurred in the Server Components render...`
- Suspected file:line: `app/protected/admin-tools/promotion/[runId]/page.tsx:59`, `app/protected/error.tsx:19`
- Root cause hypothesis: The route correctly calls `notFound()` when `getPromotionRun(runId)` returns null, but the app has no `app/not-found.tsx` or protected route-level `not-found.tsx`. In production this falls through to the protected error boundary, which labels a normal missing run as a workspace failure.
- Proposed fix: Add `app/protected/not-found.tsx` or a route-specific `not-found.tsx` for protected admin detail routes, with a link back to Promotion.
- Risk if shipped as-is: Staff cannot distinguish stale promotion links from real server failures.

### BUG-004 — Documented student-summary API smoke returns 400 without paymentDate     [P1]
- Surface: `/protected/payments/student-summary?studentId=c98d3184-2060-4a80-9c77-0657a928b7dd`
- Repro steps: 1. Use saved admin auth. 2. Send `GET /protected/payments/student-summary?studentId=<TEST_STUDENT>`. 3. Read the JSON response.
- Expected: The idempotent endpoint listed in the smoke plan returns a 2xx student summary for the TEST student.
- Actual: HTTP 400 with `{"error":"Student and payment date are required."}`.
- Screenshot: `./screenshots/desktop-chrome-protected-payments.png`
![Payment Desk page used for API smoke](./screenshots/desktop-chrome-protected-payments.png)
- Console / network log: `400 /protected/payments/student-summary?studentId=c98d3184-2060-4a80-9c77-0657a928b7dd`
- Suspected file:line: `app/protected/payments/student-summary/route.ts:52`
- Root cause hypothesis: The route requires both `studentId` and `paymentDate` at lines 52-69. The mobile Payment Desk caller supplies `paymentDate`, but the smoke/API contract names the endpoint with only `studentId`, so external probes and simple integrations fail.
- Proposed fix: Either update the API contract everywhere to require `paymentDate`, or default missing `paymentDate` to the app's current school date/session date before returning 400.
- Risk if shipped as-is: Health checks and integrations can report Payment Desk summary as broken even though the UI path works.

### BUG-005 — Transaction fetch error leaks into mobile Defaulters navigation     [P2]
- Surface: `/protected/defaulters` after mobile top-nav crawl
- Repro steps: 1. Run the mobile Chrome project. 2. Visit Transactions, then Defaulters via the mobile nav sequence. 3. Observe the console.
- Expected: Route teardown and aborted background table fetches should not emit console errors.
- Actual: Console logs `[TransactionsShell] fetch error: TypeError: Failed to fetch` while the Defaulters page is active.
- Screenshot: `./screenshots/mobile-chrome-protected-defaulters.png`
![Mobile defaulters console context](./screenshots/mobile-chrome-protected-defaulters.png)
- Console / network log: `[TransactionsShell] fetch error: TypeError: Failed to fetch at .../_next/static/chunks/...`
- Suspected file:line: `components/transactions/transactions-client-shell.tsx:542`
- Root cause hypothesis: `fetchData()` aborts the previous controller, but the catch branch only suppresses errors with `name === "AbortError"`. On route transition Chrome can surface a canceled fetch as `TypeError: Failed to fetch`, so teardown becomes noisy.
- Proposed fix: In the catch block, also suppress when `controller.signal.aborted` is true, and clear pending debounce timers on unmount.
- Risk if shipped as-is: Real client errors are harder to triage because expected navigation teardowns pollute production console telemetry.

### BUG-006 — Student list emits repeated missing-photo 404s on tablet     [P2]
- Surface: `/protected/students` tablet
- Repro steps: 1. Run the tablet Chrome project. 2. Visit `/protected/students?session=TEST-2026-27`. 3. Watch network/console during student avatar loading.
- Expected: Optional missing photos should fall back silently to initials/icons.
- Actual: Tablet run logged repeated `Failed to load resource: the server responded with a status of 404 ()` while the page otherwise rendered.
- Screenshot: `./screenshots/tablet-chrome-protected-students.png`
![Tablet students list with photo 404 noise](./screenshots/tablet-chrome-protected-students.png)
- Console / network log: Six repeated `Failed to load resource: the server responded with a status of 404 ()`
- Suspected file:line: `components/students/student-avatar.tsx:42`, `app/protected/students/photo/route.ts:27`
- Root cause hypothesis: `StudentAvatar` requests a signed URL for every non-empty `photoPath`. When storage cannot sign a path, the photo route returns 404; the UI falls back, but the browser still records noisy failures.
- Proposed fix: Treat missing optional photos as a non-error response, for example `200 { url: null }` or `204`, and cache that null result so list/tablet renders do not repeatedly hit storage for known-missing paths.
- Risk if shipped as-is: Console/network monitoring will keep flagging expected missing optional photos as errors, hiding real student-list regressions.

### BUG-007 — Payment confirmation modal does not close with ESC     [P3]
- Surface: `/protected/payments`
- Repro steps: 1. Switch to `TEST-2026-27`. 2. Select TEST student `TEST-NUR-001`. 3. Enter Rs 100 and open the Confirm & Save Payment sheet. 4. Press ESC.
- Expected: ESC closes the topmost payment confirmation overlay.
- Actual: The modal stays open; only the visible Back/Edit controls recover the flow.
- Screenshot: `./screenshots/bug-payment-confirm-esc-stays-open.png`
![Payment confirmation ESC failure](./screenshots/bug-payment-confirm-esc-stays-open.png)
- Console / network log: none.
- Suspected file:line: `components/payments/confirm-receipt-sheet.tsx:92`
- Root cause hypothesis: The overlay is a plain fixed `div` with touch handlers only. It has no keyboard listener, dialog semantics, or backdrop handler that maps ESC to `onBack()`.
- Proposed fix: Add an effect listening for `keydown` Escape while mounted and call `onBack()`, or migrate the sheet to the shared dialog primitive that already handles ESC/backdrop behavior.
- Risk if shipped as-is: Keyboard users and staff recovering from an accidental preview have a slower, less accessible escape path.

### BUG-008 — Collections alias renders Payment Desk without redirecting     [P3]
- Surface: `/protected/collections`
- Repro steps: 1. Visit `/protected/collections?session=TEST-2026-27`. 2. Observe the Payment Desk content and browser URL.
- Expected: Legacy alias should redirect to `/protected/payments`.
- Actual: The Payment Desk page renders while the URL remains `/protected/collections`.
- Screenshot: `./screenshots/desktop-chrome-protected-collections.png`
![Collections alias renders Payment Desk](./screenshots/desktop-chrome-protected-collections.png)
- Console / network log: none.
- Suspected file:line: `app/protected/collections/page.tsx:1`
- Root cause hypothesis: The alias re-exports the Payments page instead of calling `redirect("/protected/payments")`. That preserves stale URLs and disagrees with the alias behavior expected for `/protected/dues` and `/protected/advanced`.
- Proposed fix: Replace the re-export with a redirect page that preserves query parameters and lands on `/protected/payments`.
- Risk if shipped as-is: Staff can keep bookmarking stale URLs, making future route cleanup harder.

## UI / UX observations (non-bug polish)
- UX — Many admin pages exceed the requested 5s render budget: Students, Transactions, Exports, Setup, Reports, Fee Setup Generate, and several admin subpages. This is tracked in Performance notes rather than individual bug sections.
- UX — `/protected/exports` desktop works and all downloads validated, but the mobile/tablet route crawler hit `net::ERR_ABORTED` before a stable capture. The screenshots exist, but mobile/tablet export-page interaction should be rerun after reducing route-crawler side effects around download links.
- UX — Finance/source errors are hidden in production behind the generic protected error text. This is safe for users, but server logs should include table/query names so admin support can diagnose without reproducing locally.
- UX — Imports accepted the dry-run workbook upload and reached a re-check-disabled state; no commit was attempted. The workflow could use clearer copy when upload auto-validation already ran and the re-check button is disabled.

## Performance notes
| Route | Viewport | Time to captured state | Note |
|---|---:|---:|---|
| `/protected/students` | desktop | 23.9s | Network-idle timed out; DOM captured. |
| `/protected/students` | tablet | 23.1s | Network-idle timed out plus photo 404s. |
| `/protected/defaulters` | tablet | 23.2s | Network-idle timed out; DOM captured. |
| `/protected/exports` | desktop | 21.0s | Network-idle timed out; export downloads later verified. |
| `/protected/reports/ledger/[studentId]/print` | desktop | 23.4s | DOM captured; screenshot timed out once. |
| `/protected/dues` | desktop | 11.7s | Redirect/content capture slow. |
| `/protected/students/new` | desktop | 10.2s | Form-heavy page. |
| `/protected/setup` | desktop | 10.2s | 425 controls counted. |
| `/protected/transactions` | desktop/tablet | 10.1s / 9.9s | Data-table load. |
| `/protected/fee-setup/generate` | desktop | 10.0s | Fee generation page. |

LCP/CLS were not captured as stable browser performance entries in this run; the timings above are Playwright navigation-to-capture timings with `networkidle` where possible.

## Accessibility quick-check
- Payment confirmation sheet lacks ESC handling and dialog keyboard behavior (`BUG-007`).
- Student-photo 404 fallback still shows initials, but repeated missing resources can confuse assistive QA tooling and monitoring (`BUG-006`).
- Focus order was sampled through each route by tabbing; no catastrophic focus trap was observed outside the payment confirmation ESC issue.
- No broken icon-glyph squares were observed in captured screenshots.
- No full contrast audit was run; this smoke covered visible rendering, focus reachability, and modal escape behavior only.

## What was NOT tested and why
- No mutations were executed on live `2026-27`. All write-path work used `TEST-2026-27` and TEST-prefixed student `TEST-NUR-001`.
- Refunds, day-close, promotion apply, fee-setup publish, student delete, and live finance corrections were not executed because they are destructive or operationally sensitive.
- Payment adjustment submission could not be completed because `/protected/finance-controls` rendered the protected error boundary.
- Family pay/receipts/statement routes were not fully parameterized because the discovered TEST student did not expose a family group ID in the route crawler.
- Mobile/tablet `/protected/exports` full interaction was not conclusively tested because navigation aborted during the route crawl; desktop export downloads were validated separately.
- Full HAR capture did not emit separate browser HAR files from Playwright in this environment. A HAR-style network summary exists at `./har/smoke-network-summary.har`, and traces/videos/screenshots were retained.
- Earlier failed special-flow attempts are present in raw JSONL history, but the final confirmed run posted the TEST payment and reduced confirmed special-flow findings to the API contract bug and the ESC modal bug.

## Appendix
- Playwright HTML report: `./playwright-html/index.html`
- HARs: `./har/`
- Traces: `./traces/` (open with `npx playwright show-trace <file>`)
- Exports verified: `./exports/`
- Auth state: `../../tests/smoke-2026-05/.auth/admin.json`
- Raw smoke results: `../../tests/smoke-2026-05/smoke-results.jsonl`
- Verified XLSX files: `all-students.xlsx`, `conventional-discount-students.xlsx`, `class-wise-dues.xlsx`, `defaulters.xlsx`, `receipt-register.xlsx`, `ai-context-bundle.xlsx`

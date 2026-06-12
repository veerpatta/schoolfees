# Smoke Test Findings — 2026-05-31

Environment: local dev server (`npm run dev`) → **production Supabase** (`vgqyilgstjvgohrsiwkb`).
Session under test: **TEST-2026-27** (logical test partition; writes are real, so read-only unless TEST- data).
Viewport: 1440×900 desktop (mobile pass separate). Role: Admin (RA).

Severity legend: 🔴 broken (layout break / console error / non-functional) · 🟠 UX problem · 🟡 polish.
Dev-build artifacts (Next.js "N" indicator, error overlay, HMR) are NOT logged as bugs.

## Findings

| # | Route | Severity | Issue | Status |
|---|-------|----------|-------|--------|
| 1 | Topbar (all routes) | 🟠 | Session label `TEST-2026-27` wraps mid-token to two lines (`TEST-2026-` / `27`) inside the switcher pill. Should be `white-space: nowrap`. | found |
| 2 | Topbar (all routes) | 🟠 | Because the TEST switcher pill is wider, the page title truncates to "Dashbo…" and "Search anything" wraps to 2 lines at 1440px. Header layout too cramped when session label is long. Root cause: `app-topbar.tsx:65` right-side group has no `shrink-0`. | found |

Root cause for #1/#2: `components/admin/session-pill.tsx:289` label span lacks `whitespace-nowrap`; `components/admin/app-topbar.tsx:65` right group lacks `shrink-0`. Only manifests for long (TEST) labels; prod label `2026-27` fits.
| 3 | Dashboard | 🟡 | Class-wise collection progress card: amount values clipped (`₹7,0`, `₹24,00`) with horizontal scrollbar inside card. | found |
| 4 | Payment Desk | 🟡 | Policy note copy "…receipt prefix SVP, flat rs 1000, and Cash…" — informal "flat rs 1000" should read "₹1,000 flat late fee". | found |
| 5 | Exports | 🟠 | "Full AI context" export card sits in a narrow grid cell; description wraps ~one word per line into a very tall sliver, leaving 2/3 of the row empty. Card/grid layout broken for the full-context tile. | found |
| 6 | Admin Tools | 🔴 | React "two children with the same key `/protected/finance-controls`" — `admin-tools/page.tsx:208` keys by `item.href` but "Money Controls" section (`navigation.ts:445-460`) has two items with that same href (Refunds + Day Close). Fix: key by `${item.href}-${item.label}`. | found |
| 7 | Finance Controls | 🔴 | `[finance-controls] payment_adjustments load failed: Could not find a relationship between 'payments' and 'students'`. `data.ts:600` embeds `student_ref:students(...)` directly under `payments`, but `payments` has NO direct FK to students (only composite FKs to receipts/installments — schema.sql:399-428). Caught by per-section try/catch, so the **correction-review panel is silently always empty in prod too**. Fix: derive student via `receipt_ref.student_ref`. | found |
| 8 | Global (i18n) | 🟡 | next-intl `ENVIRONMENT_FALLBACK: There is no timeZone configured` — risks SSR/CSR markup mismatch. Add a global `timeZone: "Asia/Kolkata"`. | found |
| 9 | Finance Controls | 🟡 | Horizontal scrollbar / overflow on the page at desktop width (day-book table likely overflowing its container). | found |
| 10 | Receipts | ⚪ by design | Topbar title/active-nav read "Transactions" on `/protected/receipts`. Ledger behaves identically → Receipts + Ledger are intentionally grouped under the Transactions parent. NOT a bug; will not change. | wontfix |
| 11 | Reports | 🔴 (data) | `/protected/reports` hits the error boundary: "Discount for a student in class 464b8973-… exceeds the configured annual total" (digest 2092511401). Thrown by the intentional invariant at `lib/fees/generator.ts:663`. Cause = bad TEST-2026-27 data (discount > annual total). NOT auto-fixed: the guard is deliberate, and the data fix is a write to the live DB (owner decision). Resilience improvement (don't crash whole module for one bad record) is a separate product call. | found — needs owner |
| 12 | Staff | 🟡 | Chrome autofills the logged-in admin's email/password into the "Create staff account" form. Add `autoComplete="off"`/`new-password` to those inputs. | found |

## Module coverage log (all at ~1142px desktop; see viewport note)

- [x] Dashboard
- [x] Students
- [x] Fee Setup
- [x] Payment Desk (viewed; no payment posted)
- [x] Transactions
- [x] Defaulters
- [x] Exports
- [x] Admin Tools
- [x] Imports
- [x] Receipts
- [x] Reports (crashes — finding #11)
- [x] Ledger
- [x] Finance Controls
- [x] Settings
- [x] Master Data
- [x] Staff

## Fixes applied this session

| # | Fix | Files | Verified |
|---|-----|-------|----------|
| 6 | Key list items by `${href}-${label}` so the two same-href "Money Controls" tiles don't collide | `app/protected/admin-tools/page.tsx` | ✅ console clean, "1 Issue" indicator gone |
| 7 | Derive adjustment student via `receipt_ref.student_ref`; dropped invalid `payments→students` embed | `lib/finance-controls/data.ts` | ✅ dev log + browser console no longer show the load failure |
| 1/2 | `whitespace-nowrap`+`shrink-0` on session pill & command trigger; `shrink-0` on topbar right cluster | `components/admin/session-pill.tsx`, `components/command/command-trigger.tsx`, `components/admin/app-topbar.tsx` | ✅ header no longer wraps/truncates; no horizontal overflow (scrollW==clientW) |
| 5 | Action buttons wrap below text on narrow export cards; lone Analysis group spans full row | `app/protected/exports/page.tsx` | ✅ all cards + full-width AI card read cleanly |
| 8 | Set global `timeZone: "Asia/Kolkata"` for next-intl | `i18n/request.ts` | pending test run |
| 12 | `autoComplete` off/new-password on create-staff email & password | `components/staff/staff-management-client.tsx` | applied |

**Deferred (documented, not changed):**
- #3 (dashboard class-wise value clipping) and #4 ("Flat Rs 1000" copy) — low-value polish; #4's label is shared across Settings/Payment Desk and likely has test coverage, so a format change is a broader copy decision.
- #11 (Reports crash) — **escalate to owner.** Intentional invariant (`generator.ts:663`). Caused by bad TEST data, but Reports uses the generator path while Dashboard uses materialized views — so if any **live 2026-27** student has discount > annual total, production Reports would be down the same way. Worth a live-data check, not a code change here.
- #9 (finance-controls horizontal scroll) — not investigated this pass.

## Viewport / coverage caveats

- The Chrome window in this harness will not shrink below ~1142px CSS width (`window.innerWidth` floored at 1142 even when resized to 390/1440). The desktop topbar is `hidden md:flex`, so **true mobile (<768px) and the 768–1140px band could not be visually verified.** Mobile layout relies on the separate `MobileHeader`/`mobile-bottom-nav` components, which were not exercised.
- All findings above observed at ~1142px CSS width.

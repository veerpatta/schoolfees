# Cache Safety Notes

These `unstable_cache` calls are safe to share across staff users because they only read school operational records scoped by session, class, date, limit, or student id. They do not include `auth.uid()`, staff ids, or per-user visibility rules in the cached result.

`loadDashboardFinancialRows` in `lib/dashboard/data.ts` caches `getWorkbookStudentFinancials({ sessionLabel })`. The underlying workbook view is a shared finance summary for the selected academic session, so every authenticated staff user with dashboard access should see the same rows for the same session.

`loadDashboardTransactions` in `lib/dashboard/data.ts` caches `getWorkbookTransactions` by session, limit, and today-only mode. The transaction list is the same read-only receipt history for staff roles; access is controlled before the dashboard is rendered rather than by user-specific row filtering inside the cached call.

`loadDashboardInstallmentRows` in `lib/dashboard/data.ts` caches `getWorkbookInstallmentRows({ sessionLabel })`. Installment balance rows are session-wide office finance facts and are not personalized to the requesting user.

`getPaymentDeskStudentIndex` and `getPaymentDeskClassOptions` in `lib/payments/data.ts` cache active class/student lookup data by session, class, and limit. These are shared counter workflow lists for staff, not user-owned rows.

`getRecentPaymentDeskReceipts`, `getTodayPaymentDeskCollection`, `getLatestReceiptForStudent`, and `getPaymentDateAwareInstallmentBalances` in `lib/payments/data.ts` cache receipt or balance lookups by session/date, student id, or payment date. These functions read append-only finance records or deterministic payment-preview data and do not filter by the current staff user.

`getActiveSessionStudents` in `lib/defaulters/data.ts` caches active student rows by session, class, and route. The defaulter workflow needs the same active-student baseline for all authorized staff, with page-level permission checks handling access.

## Caches that live in the browser

The rule above — nothing keyed by the signed-in user enters a shared cache —
has a mirror image on the client. There, everything is keyed by the *device*,
and the office counter is shared: the same phone or desktop is used by whoever
is on the desk. A cache that is cross-user safe on the server is not
automatically safe once a copy of it is sitting in Chrome after somebody signs
out.

Four stores hold school data on the client:

| Store | Written by | Holds |
|---|---|---|
| Cache Storage `vpps-student-index-v2` | `public/service-worker.js` | `/protected/students/index` and `/protected/payments/student-summary` responses — names, admission numbers, balances |
| Cache Storage `vpps-navigation-data-v2`, `vpps-fee-admin-v2` | `public/service-worker.js` | The offline page, manifest, icons, hashed build assets. No school data. |
| IndexedDB `vpps-payment-desk-cache` | `lib/payments/payment-desk-summary-cache.ts` | Per-student fee summaries |
| localStorage `vpps.paymentDesk.studentIndex:*` / `studentSummary:*` | `lib/payments/payment-desk-cache.ts` and the summary cache | The same, as a fallback |

`app/auth/login/page.tsx` mounts `<SignedOutCachePurge />`, which clears all of
them. It runs on the login screen rather than in `logoutAction` for two
reasons: a Server Action cannot reach Cache Storage or IndexedDB at all, and
reaching the login page *proves* there is no session (the page redirects to
`/protected` otherwise) — so it also covers the ways a session ends that never
touch the sign-out button, such as expiry or a revoked account.

What it deliberately keeps: payment drafts (`vpps-payment-drafts`), saved table
views, appearance, language, and `vpps.paymentDesk.lastPaymentMode`. Those are
the staffer's own work and preferences, not a cache of server data — and a
draft in particular is an amount somebody typed and has not posted yet, which a
session expiring mid-entry must not also destroy. `lib/cache/signed-out-purge.ts`
holds the list; `tests/unit/signed-out-cache-purge.test.ts` pins both halves.

The reason `/api/manifest` is no longer cached by the service worker belongs
here too: it is role-aware and `private, no-store`, and Cache Storage ignores
`Cache-Control` completely. See `docs/design/design-system.md` §5.10.

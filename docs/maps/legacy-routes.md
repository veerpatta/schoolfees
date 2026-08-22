# Legacy Routes

These routes are kept so old bookmarks and staff habits continue to work.
Do not remove or rename them without a separate route-compatibility review.

| Legacy route | Current target | Shim type |
| --- | --- | --- |
| `/protected/fee-structure` | `/protected/fee-setup` | File shim: `src/app/protected/fee-structure/page.tsx` re-exports the Fee Setup page. |
| `/protected/collections` | `/protected/payments` | File shim: `src/app/protected/collections/page.tsx` redirects to the Payment Desk, reconstructing the query string; also listed as a `navigation.ts` alias. |
| `/protected/dues` | `/protected/transactions` | File shim: `src/app/protected/dues/page.tsx` redirects while preserving query params; also listed as a `navigation.ts` alias. |
| `/protected/admin-tools/whatsapp-reminders` | `/protected/reminders` | File shim: `src/app/protected/admin-tools/whatsapp-reminders/page.tsx` redirects, `append`ing every query param so repeated keys survive. Reminders became a top-level section on 22 Aug 2026; the old path is in bookmarks and browser history. Also a `navigation.ts` alias, so the Reminders tab highlights. |
| `/protected/receipts` | `/protected/transactions` | `navigation.ts` alias entry; the root route still serves receipt search/reprint UI. |
| `/protected/ledger` | `/protected/transactions` | `navigation.ts` alias entry; the root route still serves legacy ledger UI. |
| `/protected/advanced` | `/protected/admin-tools` | File redirect: `src/app/protected/advanced/page.tsx`. |
| `/protected/setup` | `/protected/admin-tools` | Redirect: first-time setup retired; `src/app/protected/setup/page.tsx` redirects to Admin Tools. |
| `/protected/master-data` | `/protected/admin-tools` | `navigation.ts` metadata target for school setup lists. |
| `/protected/finance-controls` | `/protected/admin-tools` | `navigation.ts` metadata target for finance controls. |

Route URLs are stable staff-facing contracts. Prefer adding an alias or shim
over breaking an existing path.

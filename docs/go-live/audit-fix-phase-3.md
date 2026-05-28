# Audit Fix — Phase 3 (P2 — UX risk)

**Branch:** `fix/audit-p2-ux`
**Audit:** `BUG_AUDIT_REPORT_2026-05-28.md` findings 1.16, 1.19, 1.22, 1.23 (with 1.17, 1.18, 1.20 deferred to Phase 3b)
**Status:** Quick-win findings closed with tests. Three larger findings explicitly scoped out for a separate PR — see below.

## Findings closed in this phase

| # | Title | Approach | Tests |
|---|---|---|---|
| 1.22 | PDF export filename | Derive `.pdf` vs `.xlsx` from the format param; pass to `formatExportName`. | `tests/unit/export-pdf-filename.test.ts` |
| 1.23 | Session-delete confirm | Master Data session delete now uses a typed-confirmation prompt that echoes the session label; cancel or mismatch aborts. | `tests/ui/master-data-session-delete.test.ts` |
| 1.19 | Differentiated mobile errors | New `classifyPaymentSummaryError(error)` helper in `payment-desk-mobile.tsx` separates transient (network/timeout) from policy-gap failures. Transient shows "Tap Retry"; policy keeps "Ask admin". Both catch sites route through it. | `tests/ui/mobile-error-classification.test.ts` |
| 1.16 | Sheet focus trap | Added manual focus trap to `components/ui/sheet.tsx` — captures `document.activeElement` on open, moves focus to the first focusable element inside the panel, cycles Tab/Shift+Tab between the first and last focusable, restores focus on close. | `tests/ui/sheet-focus-trap.test.ts` |

## Deferred to Phase 3b (separate PR)

These three findings need broader work than fits in a single PR and are tracked for a follow-up:

| # | Title | Why deferred | Scope sketch |
|---|---|---|---|
| 1.17 | Drop `(supabase as any)` casts | Requires regenerating `lib/db/types.ts` via Supabase MCP `generate_typescript_types`, then removing casts in `lib/activity/events.ts`, `lib/defaulters/contacts.ts`, `lib/whatsapp-templates/data.ts`. Crosses ~12 files and may surface latent type mismatches. | (a) Run MCP type-gen on a TEST Supabase branch; diff `lib/db/types.ts` vs current; (b) drop the casts one file at a time; (c) ensure no runtime field access changes. |
| 1.18 | Standardise finance terminology | Repo-wide rename touching ~20 components and message files. Requires an upfront `TERMINOLOGY_DECISIONS.md` sign-off with raj@vpps.co.in before the mechanical rename. | (a) Write the decisions doc; (b) PR the rename as one commit; (c) update `MoneyGlossaryLink` to match. |
| 1.20 | i18n the Imports module | Add `Imports` namespaces to `messages/en.json` + `messages/hi.json` + `messages/hi-en.json`; thread `useTranslations("Imports")` / `getTranslations` through `components/imports/*` and `app/protected/imports/*`. Large file churn but mechanical. | (a) Extract strings to en.json under `Imports`; (b) translate hi.json + hi-en.json; (c) wire callsites; (d) snapshot existing import workflow tests. |

Phase 3b should be sequenced **after** the Phase 2 logger lands so 1.18's terminology rename uses the new logger for any newly-introduced "noop replace" warnings.

## Validation log

| Step | Result |
|---|---|
| `npm run typecheck` | Clean. |
| `npm run lint` (changed files) | Clean (one pre-existing react-hooks warning). |
| `npm run test` | 673 passing / 1 failing (same pre-existing i18n-string assertion as Phase 1 & 2). |
| `npm run build` | Clean. |

## No migrations in Phase 3

Nothing to apply to TEST or production from this PR.

## TEST-2026-27 verification

1. **1.22** — Download a PDF from `/protected/exports/<anything>?format=pdf`; check the Dashboard recent-activity strip records `.pdf`.
2. **1.23** — On Master Data, click "Delete session" on a non-live session; confirm the prompt asks for the typed label, that a mismatch aborts with an alert, and that the correct label proceeds.
3. **1.19** — Throttle the network in DevTools and trigger a Payment Desk load failure; confirm the notice says "Tap Retry" rather than "Ask admin to check Fee Setup".
4. **1.16** — Open any Sheet (e.g. mobile payment review), Tab through the controls and confirm focus cycles within the panel and never escapes to the background.

## Hard safety rules observed

- No edits to live `2026-27` data.
- No migrations.
- No `NEXT_PUBLIC_*` exposure of the service-role key.
- Payment posting stays gated to the Payment Desk surface.
- Append-only invariant preserved.

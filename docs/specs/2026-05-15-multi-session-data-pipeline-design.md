# Multi-Session Data Pipeline Design

## Context

The fee app must support three working academic sessions at the same time:

- `2025-26`: live production session for old dues, late collections, student updates, receipts, and exports.
- `2026-27`: live production session for current-year operations.
- `TEST-2026-27`: isolated test session for experiments, import rehearsal, fee-rule review, and safe UAT.

The current app already has session-aware building blocks: a view-session cookie, URL `session` parameter, academic session records, active session setting, and session-scoped loaders on several pages. The problem is consistency. Some pages and server actions use the selected session, while other paths still fall back to the global active Fee Setup session or lose the session while linking across tabs.

## Design Goal

Make the app behave like a simple office workbook with a clear selected year:

1. Staff choose a working session in the top bar or from a session-aware page.
2. Every module shows records for that same working session.
3. All links keep the same working session unless staff intentionally changes it.
4. Payments, imports, fee setup, dues refresh, dashboard totals, transactions, defaulters, and exports read and write against the working session.
5. Test-session work remains visibly marked and separate from production sessions.

## Core Rule

The app will use two separate session concepts.

**Working session** is the selected session for the current tab or request. It comes from URL `session`, then the view-session cookie, then the default school session. This controls what the page reads and what session-scoped actions are allowed to change.

**Default school session** is only the default landing session for new work. It should not silently override a page that is already working in `2025-26` or `TEST-2026-27`.

The global default may remain `2026-27`, but both `2025-26` and `2026-27` must remain fully editable and collectable when selected.

## Session Resolver Contract

Add or tighten one canonical server helper that returns a complete working-session object:

- `sessionLabel`
- `source`: `url`, `cookie`, or `default`
- `isTest`
- `isProduction`
- `isCollectable`
- `isEditable`

The helper must validate labels through the existing academic-session parser and only resolve to known sessions where possible. If a URL contains an invalid session, the page should ignore it and fall back safely rather than showing mixed data.

## Data Flow

Every protected module should receive the same resolved working session and pass it into its loaders:

- Dashboard: session-scoped KPIs, class totals, missing dues, refunds, recent receipts, collection trend, and attention items.
- Students: session-scoped class list, student list, add-student defaults, edit links, bulk add, bulk update, and import templates.
- Fee Setup: session-scoped policy, class defaults, route/default display, and dues publish/preview target.
- Payment Desk: session-scoped class picker and student lookup, with payment posting limited to students whose class belongs to the working session.
- Transactions: session-scoped receipts, dues tracker, class register, collection views, and export links.
- Defaulters: session-scoped pending/overdue rows, missing-dues rows, class filters, route summary, and collect shortcuts.
- Exports: session-scoped files by default, with the selected session visible in file names or page labels.
- Admin Tools: troubleshooting and repair actions must show and apply to the selected session, not a hidden global active session.

## Write Safety

Server actions must carry or derive the intended session explicitly.

For payment posting:

1. Resolve selected student and its class session.
2. Compare the student session with the working session submitted by the form.
3. Reject posting if they do not match.
4. Use the student session for cache invalidation and receipt context.
5. Preserve idempotency, duplicate checks, locking, append-only payments, receipts, and adjustments.

For student add/update/import:

1. Use the working session to choose class options and defaults.
2. Reject class/session mismatches.
3. Keep batch traceability for imports.
4. Do not silently move uploaded students into another year.

For Fee Setup and dues refresh:

1. Preview and publish only for the working session.
2. Protect paid, partial, adjusted, or historical rows from silent rewrite.
3. Revalidate cache tags for the affected session and students only.

## Cache And Sync Model

Use a consistent cache tagging pattern:

- `session:<sessionLabel>` for session-wide lists and totals.
- `student:<studentId>` for selected-student summaries and receipts.
- Revalidate both when a write changes financial data for a student.

All session-scoped cached loaders must include `sessionLabel` in the cache key. Any cached financial loader that does not include the session in its key is a sync risk.

## UI Behavior

The top session selector remains the main control. It should make the selected session obvious on every page.

Production sessions:

- `2025-26` and `2026-27` show normal production styling.
- Pages should say the session in the header or status badge where money is shown.

Test session:

- `TEST-2026-27` keeps the existing test visual treatment.
- Payment and import actions are allowed, but labels should make clear that the records are test records.

When navigating between modules, links must preserve the working session. This includes shortcuts from Dashboard, Students, Transactions, Defaulters, receipts, student detail, Payment Desk, exports, and Admin Tools.

## Migration And Data Setup

The implementation should verify that these session records exist:

- `2025-26`
- `2026-27`
- `TEST-2026-27`

Each session needs:

- academic session row
- fee policy config
- classes
- class fee defaults where collection is expected
- workbook dues generation path

The work should not reset real data. If data repair is needed, it must be previewed first and targeted to the affected session.

## Acceptance Checks

The implementation is acceptable when:

1. Opening Dashboard in `2025-26` shows only `2025-26` totals.
2. Opening Dashboard in `2026-27` shows only `2026-27` totals.
3. Opening `TEST-2026-27` shows test styling and test-session data only.
4. Students, Payment Desk, Transactions, Defaulters, and Exports preserve the selected session while navigating.
5. Payment Desk can collect for a `2025-26` student while the school default remains `2026-27`.
6. Payment Desk can collect for a `2026-27` student without affecting `2025-26`.
7. A mismatched student/session payment attempt is rejected with office-friendly wording.
8. Import templates, import batches, dues refresh, and exports use the selected session.
9. Cache refresh after posting a payment updates Dashboard, Payment Desk, Transactions, Defaulters, and student financial views for that same session.
10. `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` are run after implementation, unless the environment blocks a command.

## Implementation Scope

This design should be implemented as pipeline tightening, not a broad redesign. The work should focus on:

- central working-session helper and types
- session propagation through links and forms
- session-scoped loaders and cache keys
- server-action guards for writes
- session setup verification for the three required sessions
- focused tests for session propagation, posting safety, and cache tagging

Avoid parent-facing features, multi-school abstractions, destructive cleanup, or alternate payment edit paths.

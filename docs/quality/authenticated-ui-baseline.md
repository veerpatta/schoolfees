# Authenticated UI baseline

> **Status: never filled in.** Every row in the matrix below still reads "Pending /
> Blocked on local admin state", and it covers 8 of the 24 workspaces. It records an
> intention, not a baseline. The checks that actually run are
> `tests/smoke-readiness/visual-a11y.spec.ts` — zero serious/critical axe violations, zero
> console errors, zero horizontal overflow, first Tab focus-visible. See
> `docs/qa/readiness-smoke.md`.


This baseline covers only the `TEST-2026-27` session. Authentication state and run artifacts are gitignored because they may contain credentials or student information.

## Capture

1. Run `npm run smoke:readiness:auth` and sign in once with an admin staff account.
2. Run `npm run smoke:readiness:visual`.
3. Review the desktop (`1440 x 900`) and mobile (`390 x 844`) HTML report under the configured readiness artifact directory.
4. Record approved, anonymized observations below. Never commit a screenshot containing a real student, phone number, receipt, or financial amount.

## Review matrix

| Workspace | Hierarchy | Overflow / reflow | Loading / empty / error | Focus / keyboard | Contrast / accessibility | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard | Pending authenticated capture | Pending | Pending | Pending | Pending | Blocked on local admin state |
| Students | Pending authenticated capture | Pending | Pending | Pending | Pending | Blocked on local admin state |
| Fee Setup | Pending authenticated capture | Pending | Pending | Pending | Pending | Blocked on local admin state |
| Payment Desk | Pending authenticated capture | Pending | Pending | Pending | Pending | Blocked on local admin state |
| Transactions | Pending authenticated capture | Pending | Pending | Pending | Pending | Blocked on local admin state |
| Defaulters | Pending authenticated capture | Pending | Pending | Pending | Pending | Blocked on local admin state |
| Exports | Pending authenticated capture | Pending | Pending | Pending | Pending | Blocked on local admin state |
| Admin Tools | Pending authenticated capture | Pending | Pending | Pending | Pending | Blocked on local admin state |

The Playwright report also records navigation duration, browser-console errors, HTTP 5xx responses, horizontal overflow, first keyboard focus visibility, and serious/critical axe violations for each workspace and viewport.

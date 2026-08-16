# Deep harness run 202608152016-f28680

**FAIL** · 228 finding(s) · P0 12 · P1 8 · P2 9 · P3 199

## Run

| | |
|---|---|
| Run id | `202608152016-f28680` |
| Target | production |
| Base URL | https://schoolfees-two.vercel.app |
| Session | TEST-2026-27 |
| Started | 2026-08-16T05:39:02.103Z |
| Git | `1d151fd0b1a6` on main (dirty) |
| Node | v24.19.0 |
| Writes | disabled |
| Strict gate | no |
| Env present | NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SCHOOLFEES_DOC_TOKEN, SCHOOLFEES_WORKER_MCP_TOKEN |

_Environment variables are listed by name only; no value from the environment reaches this document._

## Verdict

The gate **failed** for 8 reason(s):

- P1 route.server-component-error on /protected/fee-setup/time-travel?asOf=9999-99-99&session=TEST-2026-27 (production, deterministic).
- P1 route.server-component-error on /protected/dashboard?session=2026-2027&session=TEST-2026-27 (production, deterministic).
- P1 route.server-component-error on /protected/dashboard?session=garbage&session=TEST-2026-27 (production, deterministic).
- P1 route.server-component-error on /protected/dashboard?session=TEST-2026-27&session=TEST-2026-27 (production, deterministic).
- P1 route.server-component-error on /protected/transactions?view=receipts&view=defaulters&session=TEST-2026-27&session=TEST-2026-27 (production, deterministic).
- P1 bridge.wrong-content-type on get_receipt_pdf (mcp, deterministic).
- P1 mcp.tool-error on get_receipt_pdf@2026-27 (mcp, deterministic).
- P1 mcp.tool-error on get_receipt_pdf@TEST-2026-27 (mcp, deterministic).

12 finding(s) matched a live waiver in `tests/deep/baseline/known-findings.json`.

## What this run did NOT test

This run executed 1,594 cases against a full cross-product of about 2,11,680 (role × page × segment × transactions view × viewport) — 0.753%. Single-factor coverage is complete for 13 dimensions; 4 dimensions are covered 2-wise. Declared uncovered: In-page gates behind an interaction.

| Dimension | Strategy | Domain | Visited | Not visited |
|---|---|---:|---:|---|
| `device.viewport` | exhaustive-pairwise | 3 | 3 | — |
| `negative.input` | exhaustive-single-factor | 27 | 27 | — |
| `param.dashboard-days` | exhaustive-single-factor | 2 | 2 | — |
| `param.dashboard-view` | exhaustive-single-factor | 5 | 5 | — |
| `param.export-format` | exhaustive-single-factor | 2 | 2 | — |
| `param.export-type` | exhaustive-single-factor | 11 | 11 | — |
| `param.receipt-filter` | exhaustive-single-factor | 11 | 11 | — |
| `param.session-resolution` | exhaustive-single-factor | 5 | 5 | — |
| `param.student-segment` | exhaustive-single-factor | 28 | 28 | — |
| `param.transaction-view` | exhaustive-single-factor | 14 | 14 | — |
| `rbac.guarded-route` | exhaustive-pairwise | 29 | 29 | — |
| `rbac.in-page-gate` | exhaustive-single-factor | 5 | 5 | — |
| `rbac.in-page-gate-uncovered` | declared-uncovered | 2 | 0 | defaulters.contact-log, defaulters.payment-history |
| `rbac.role` | exhaustive-pairwise | 5 | 5 | — |
| `route.dynamic-page` | targeted-scenarios | 8 | 6 | /protected/students/family/[familyGroupId]/receipts, /protected/students/family/[familyGroupId]/statement |
| `route.family` | exhaustive-pairwise | 14 | 14 | — |
| `route.handler` | exhaustive-single-factor | 25 | 25 | — |
| `route.legacy-alias` | exhaustive-single-factor | 5 | 5 | — |
| `route.page` | exhaustive-single-factor | 36 | 36 | — |
| `write.payment-case` | targeted-scenarios | 18 | 18 | — |

- **param.student-segment** — Segment × role is not covered; only the permission-gated chip is checked per role.
- **rbac.in-page-gate-uncovered** — Controls that only exist after a popover or drawer is opened. Asserting them means driving that interaction per role first; until then the report names them rather than implying they were checked.
- **route.dynamic-page** — Visited only when discovery found an id of the right shape.
- **write.payment-case** — Chosen by equivalence class from date x amount x mode x discount x waiver x duplicate (~2,600 combinations); the full product is not covered.

## Gates

| Verifier | Phase | Result | Exit |
|---|---|---|---:|
| required-sessions | pre | pass | 0 |
| late-fee-health/test | pre | pass | 0 |
| test-data-in-public | pre | pass | 0 |
| late-fee-health/test | post | pass | 0 |
| test-data-in-public | post | pass | 0 |
| live-fee-health | post | pass | 0 |
| deep-test-footprint | post | pass | 0 |

_A verifier that passed before the run and failed after it is this run's doing. That pairing is the whole point of running them twice._

## Findings

### P0-001 Write gate "rendered-session" refused before a preview

```
id:         6d97e76ec83f
rule:       write.gate-refused  [deterministic]
targets:    local     seen: 3×
surface:    payment-case:amount-absurd
role:       —        device: —        session: TEST-2026-27
expected:   The harness can prove it is looking at the test ledger.
actual:     The page is not rendering a test session (body[data-vpps-test-session] is unset).
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/write-refused-amount-absurd.png
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "previews every allocation"
```

### P0-002 Write gate "rendered-session" refused before a preview

```
id:         2db4daf9a47e
rule:       write.gate-refused  [deterministic]
targets:    local     seen: 3×
surface:    payment-case:amount-decimal
role:       —        device: —        session: TEST-2026-27
expected:   The harness can prove it is looking at the test ledger.
actual:     The page is not rendering a test session (body[data-vpps-test-session] is unset).
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/write-refused-amount-decimal.png
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "previews every allocation"
```

### P0-003 Write gate "rendered-session" refused before a preview

```
id:         a760a141edd0
rule:       write.gate-refused  [deterministic]
targets:    local     seen: 3×
surface:    payment-case:amount-negative
role:       —        device: —        session: TEST-2026-27
expected:   The harness can prove it is looking at the test ledger.
actual:     The page is not rendering a test session (body[data-vpps-test-session] is unset).
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/write-refused-amount-negative.png
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "previews every allocation"
```

### P0-004 Write gate "rendered-session" refused before a preview

```
id:         abbe6cacd256
rule:       write.gate-refused  [deterministic]
targets:    local     seen: 3×
surface:    payment-case:amount-non-numeric
role:       —        device: —        session: TEST-2026-27
expected:   The harness can prove it is looking at the test ledger.
actual:     The page is not rendering a test session (body[data-vpps-test-session] is unset).
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/write-refused-amount-non-numeric.png
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "previews every allocation"
```

### P0-005 Write gate "rendered-session" refused before a preview

```
id:         ef4cc29aa341
rule:       write.gate-refused  [deterministic]
targets:    local     seen: 3×
surface:    payment-case:amount-zero
role:       —        device: —        session: TEST-2026-27
expected:   The harness can prove it is looking at the test ledger.
actual:     The page is not rendering a test session (body[data-vpps-test-session] is unset).
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/write-refused-amount-zero.png
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "previews every allocation"
```

### P0-006 Write gate "rendered-session" refused before a preview

```
id:         1f1d0c3a8486
rule:       write.gate-refused  [deterministic]
targets:    local     seen: 3×
surface:    payment-case:preview-back-dated
role:       —        device: —        session: TEST-2026-27
expected:   The harness can prove it is looking at the test ledger.
actual:     The page is not rendering a test session (body[data-vpps-test-session] is unset).
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/write-refused-preview-back-dated.png
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "previews every allocation"
```

### P0-007 Write gate "rendered-session" refused before a preview

```
id:         2c9b45cc9f16
rule:       write.gate-refused  [deterministic]
targets:    local     seen: 3×
surface:    payment-case:preview-emi-student
role:       —        device: —        session: TEST-2026-27
expected:   The harness can prove it is looking at the test ledger.
actual:     The page is not rendering a test session (body[data-vpps-test-session] is unset).
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/write-refused-preview-emi-student.png
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "previews every allocation"
```

### P0-008 Write gate "rendered-session" refused before a preview

```
id:         79444a1dc18c
rule:       write.gate-refused  [deterministic]
targets:    local     seen: 3×
surface:    payment-case:preview-future-dated
role:       —        device: —        session: TEST-2026-27
expected:   The harness can prove it is looking at the test ledger.
actual:     The page is not rendering a test session (body[data-vpps-test-session] is unset).
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/write-refused-preview-future-dated.png
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "previews every allocation"
```

### P0-009 Write gate "rendered-session" refused before a preview

```
id:         e8f197f5a2c1
rule:       write.gate-refused  [deterministic]
targets:    local     seen: 3×
surface:    payment-case:preview-graduated-clear
role:       —        device: —        session: TEST-2026-27
expected:   The harness can prove it is looking at the test ledger.
actual:     The page is not rendering a test session (body[data-vpps-test-session] is unset).
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/write-refused-preview-graduated-clear.png
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "previews every allocation"
```

### P0-010 Write gate "rendered-session" refused before a preview

```
id:         378ea7762852
rule:       write.gate-refused  [deterministic]
targets:    local     seen: 3×
surface:    payment-case:preview-in-credit
role:       —        device: —        session: TEST-2026-27
expected:   The harness can prove it is looking at the test ledger.
actual:     The page is not rendering a test session (body[data-vpps-test-session] is unset).
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/write-refused-preview-in-credit.png
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "previews every allocation"
```

### P0-011 Write gate "rendered-session" refused before a preview

```
id:         9cb644dd71ed
rule:       write.gate-refused  [deterministic]
targets:    local     seen: 3×
surface:    payment-case:preview-late-fee-only
role:       —        device: —        session: TEST-2026-27
expected:   The harness can prove it is looking at the test ledger.
actual:     The page is not rendering a test session (body[data-vpps-test-session] is unset).
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/write-refused-preview-late-fee-only.png
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "previews every allocation"
```

### P0-012 Write gate "rendered-session" refused before a preview

```
id:         17e91d811134
rule:       write.gate-refused  [deterministic]
targets:    local     seen: 3×
surface:    payment-case:preview-today
role:       —        device: —        session: TEST-2026-27
expected:   The harness can prove it is looking at the test ledger.
actual:     The page is not rendering a test session (body[data-vpps-test-session] is unset).
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/write-refused-preview-today.png
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "previews every allocation"
```

### P1-013 A Server Component threw on /protected/fee-setup/time-travel?asOf=9999-99-99&session=TEST-2026-27

```
id:         d92c80964887
rule:       route.server-component-error  [deterministic]
targets:    production     seen: 2×
surface:    /protected/fee-setup/time-travel?asOf=9999-99-99&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   A malformed parameter is handled — skipped, defaulted, or shown as an error — never allowed to throw out of a Server Component.
actual:     Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/server-error-protected-fee-setup-time-travel-asof-9999-99-99-session-test-2026-27.png
console:    Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
repro:      DEEP_TARGET=production npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P1-014 A Server Component threw on /protected/dashboard?session=2026-2027&session=TEST-2026-27

```
id:         cc6c9468cf42
rule:       route.server-component-error  [deterministic]
targets:    production     seen: 1×
surface:    /protected/dashboard?session=2026-2027&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   A malformed parameter is handled — skipped, defaulted, or shown as an error — never allowed to throw out of a Server Component.
actual:     Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/server-error-protected-dashboard-session-2026-2027-session-test-2026-27.png
console:    Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
repro:      DEEP_TARGET=production npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P1-015 A Server Component threw on /protected/dashboard?session=garbage&session=TEST-2026-27

```
id:         f52e3a7ef415
rule:       route.server-component-error  [deterministic]
targets:    production     seen: 1×
surface:    /protected/dashboard?session=garbage&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   A malformed parameter is handled — skipped, defaulted, or shown as an error — never allowed to throw out of a Server Component.
actual:     Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/server-error-protected-dashboard-session-garbage-session-test-2026-27.png
console:    Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
repro:      DEEP_TARGET=production npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P1-016 A Server Component threw on /protected/dashboard?session=TEST-2026-27&session=TEST-2026-27

```
id:         01589294feb8
rule:       route.server-component-error  [deterministic]
targets:    production     seen: 1×
surface:    /protected/dashboard?session=TEST-2026-27&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   A malformed parameter is handled — skipped, defaulted, or shown as an error — never allowed to throw out of a Server Component.
actual:     Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/server-error-protected-dashboard-session-test-2026-27-session-test-2026-27.png
console:    Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
repro:      DEEP_TARGET=production npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P1-017 A Server Component threw on /protected/transactions?view=receipts&view=defaulters&session=TEST-2026-27&session=TEST-2026-27

```
id:         107445737124
rule:       route.server-component-error  [deterministic]
targets:    production     seen: 1×
surface:    /protected/transactions?view=receipts&view=defaulters&session=TEST-2026-27&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   A malformed parameter is handled — skipped, defaulted, or shown as an error — never allowed to throw out of a Server Component.
actual:     Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/server-error-protected-transactions-view-receipts-view-defaulters-session-test-2026-27-ses.png
console:    Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
repro:      DEEP_TARGET=production npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P1-018 The receipt PDF bridge refused a real receipt

```
id:         f9fd4ab087f3
rule:       bridge.wrong-content-type  [deterministic]
targets:    mcp     seen: 1×
surface:    get_receipt_pdf
role:       service        device: —        session: -
expected:   The document bridge returns a PDF for a receipt that exists. It must validate both content-type and x-document-kind, because a Next.js 404 is served as HTTP 200 with HTML.
actual:      "The document service refused the request (503): document bridge is not configured (SCHOOLFEES_DOC_TOKEN unset)."
repro:      node tests/deep/mcp/run.mjs --session TEST-2026-27
```

### P1-019 get_receipt_pdf failed on 2026-27

```
id:         7b027814ed91
rule:       mcp.tool-error  [deterministic]
targets:    mcp     seen: 1×
surface:    get_receipt_pdf@2026-27
role:       service        device: —        session: 2026-27
expected:   A tool called with its documented minimal arguments answers.
actual:     svc: get_receipt_pdf returned isError [{"type":"text","text":"The document service refused the request (503): document bridge is not configured (SCHOOLFEES_DOC_TOKEN unset)."}]
repro:      node tests/deep/mcp/run.mjs --session 2026-27
```

### P1-020 get_receipt_pdf failed on TEST-2026-27

```
id:         750035b02b48
rule:       mcp.tool-error  [deterministic]
targets:    mcp     seen: 1×
surface:    get_receipt_pdf@TEST-2026-27
role:       service        device: —        session: TEST-2026-27
expected:   A tool called with its documented minimal arguments answers.
actual:     svc: get_receipt_pdf returned isError [{"type":"text","text":"The document service refused the request (503): document bridge is not configured (SCHOOLFEES_DOC_TOKEN unset)."}]
repro:      node tests/deep/mcp/run.mjs --session TEST-2026-27
```

### P2-021 Hydration failed on /protected/students/9999999?session=TEST-2026-27

```
id:         dd9756827507
rule:       route.hydration-mismatch  [deterministic]
targets:    production     seen: 2×
surface:    /protected/students/9999999?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   The server-rendered HTML matches what the client renders.
actual:     pageerror: Minified React error #419; visit https://react.dev/errors/419 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
            pageerror: Minified React error #419; visit https://react.dev/errors/419 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
console:    pageerror: Minified React error #419; visit https://react.dev/errors/419 for the full message or use the non-minified dev environment for full errors and additional helpful warnings. / pageerror: Minified React error #419; visit https://react.dev/errors/419 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
repro:      DEEP_TARGET=production npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P2-022 Console or runtime errors on /protected/imports?session=TEST-2026-27

```
id:         1507ff30c703
rule:       route.console-error  [heuristic]
targets:    production     seen: 3×
surface:    /protected/imports?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     pageerror: Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
console:    pageerror: Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
repro:      DEEP_TARGET=production npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P2-023 Console or runtime errors on /protected/students/family/00000000-0000-0000-0000-000000000000/pay?session=TEST-2026-27

```
id:         f26cf8c98071
rule:       route.console-error  [heuristic]
targets:    production     seen: 3×
surface:    /protected/students/family/00000000-0000-0000-0000-000000000000/pay?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 404 ()
console:    Failed to load resource: the server responded with a status of 404 ()
network:    404 https://schoolfees-two.vercel.app/protected/students/family/00000000-0000-0000-0000-000000000000/pay?session=TEST-2026-27
repro:      DEEP_TARGET=production npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P2-024 Console or runtime errors on /protected?session=TEST-2026-27

```
id:         15c8f5ca5498
rule:       route.console-error  [heuristic]
targets:    production     seen: 1×
surface:    /protected?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     pageerror: Minified React error #310; visit https://react.dev/errors/310 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
console:    pageerror: Minified React error #310; visit https://react.dev/errors/310 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
repro:      DEEP_TARGET=production npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P2-025 Console or runtime errors on /protected/dashboard?session=2026-2027&session=TEST-2026-27

```
id:         1fc65de8a112
rule:       route.console-error  [heuristic]
targets:    production     seen: 1×
surface:    /protected/dashboard?session=2026-2027&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
console:    Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
repro:      DEEP_TARGET=production npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P2-026 Console or runtime errors on /protected/dashboard?session=garbage&session=TEST-2026-27

```
id:         13011fa706a9
rule:       route.console-error  [heuristic]
targets:    production     seen: 1×
surface:    /protected/dashboard?session=garbage&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
console:    Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
repro:      DEEP_TARGET=production npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P2-027 Console or runtime errors on /protected/fee-setup/time-travel?asOf=9999-99-99&session=TEST-2026-27

```
id:         18b800d8fcb6
rule:       route.console-error  [heuristic]
targets:    production     seen: 1×
surface:    /protected/fee-setup/time-travel?asOf=9999-99-99&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
console:    Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
repro:      DEEP_TARGET=production npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P2-028 Console or runtime errors on /protected/students/9999999?session=TEST-2026-27

```
id:         66c2212ef72f
rule:       route.console-error  [heuristic]
targets:    production     seen: 1×
surface:    /protected/students/9999999?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     pageerror: Minified React error #419; visit https://react.dev/errors/419 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
            pageerror: Minified React error #419; visit https://react.dev/errors/419 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
console:    pageerror: Minified React error #419; visit https://react.dev/errors/419 for the full message or use the non-minified dev environment for full errors and additional helpful warnings. / pageerror: Minified React error #419; visit https://react.dev/errors/419 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
repro:      DEEP_TARGET=production npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P2-029 Console or runtime errors on /protected/transactions?view=not_a_view&session=TEST-2026-27

```
id:         d6ae59babddf
rule:       route.console-error  [heuristic]
targets:    production     seen: 1×
surface:    /protected/transactions?view=not_a_view&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Access to fetch at 'https://o4511485074407424.ingest.de.sentry.io/api/4511485112877136/envelope/?sentry_version=7&sentry_key=b5204339a4d02c8c92eedbafc60f3a24&sentry_client=sentry.javascript.nextjs%2F10.68.0' from origin 'https://schoolfees-two.vercel.app' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
            Failed to load resource: net::ERR_FAILED
console:    Access to fetch at 'https://o4511485074407424.ingest.de.sentry.io/api/4511485112877136/envelope/?sentry_version=7&sentry_key=b5204339a4d02c8c92eedbafc60f3a24&sentry_client=sentry.javascript.nextjs%2F10.68.0' from origin 'https://schoolfees-two.vercel.app' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource. / Failed to load resource: net::ERR_FAILED
repro:      DEEP_TARGET=production npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-030 Console or runtime errors on /protected/exports?session=TEST-2026-27

```
id:         0717d5538ae0
rule:       route.console-error  [heuristic]
targets:    local     seen: 3×
surface:    /protected/exports?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-031 Console or runtime errors on /protected/ledger?session=TEST-2026-27

```
id:         3bf6dd230910
rule:       route.console-error  [heuristic]
targets:    local     seen: 3×
surface:    /protected/ledger?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2 / 403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-032 Console or runtime errors on /protected/receipts?session=TEST-2026-27

```
id:         ebc49b6e3e9a
rule:       route.console-error  [heuristic]
targets:    local     seen: 3×
surface:    /protected/receipts?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-033 Console or runtime errors on /protected/settings?session=TEST-2026-27

```
id:         bbb748a7459f
rule:       route.console-error  [heuristic]
targets:    local     seen: 3×
surface:    /protected/settings?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-034 Console or runtime errors on /protected/admin-tools?session=TEST-2026-27

```
id:         9ad77d5ff93e
rule:       route.console-error  [heuristic]
targets:    local     seen: 2×
surface:    /protected/admin-tools?session=TEST-2026-27
role:       —        device: tablet        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=tablet
```

### P3-035 Console or runtime errors on /protected/defaulters?session=TEST-2026-27

```
id:         75c37e88b45e
rule:       route.console-error  [heuristic]
targets:    local     seen: 2×
surface:    /protected/defaulters?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-036 Console or runtime errors on /protected/fee-structure?session=TEST-2026-27

```
id:         32f544318334
rule:       route.console-error  [heuristic]
targets:    local     seen: 2×
surface:    /protected/fee-structure?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-037 2 dynamic route(s) had no discoverable id

```
id:         e984159da81a
rule:       ux.observation  [heuristic]
targets:    local · production     seen: 2×
surface:    discovery
role:       —        device: —        session: TEST-2026-27
expected:   Discovery finds an id of the right shape for every dynamic route.
actual:     /protected/students/family/[familyGroupId]/receipts, /protected/students/family/[familyGroupId]/statement
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "dynamic pages"
```

### P3-038 Console or runtime errors on /

```
id:         9845ebf3aa81
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=MuxxLbd_NMJl3ji2zWzCS' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=MuxxLbd_NMJl3ji2zWzCS' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "public pages render without a session" --project=desktop
```

### P3-039 Console or runtime errors on /auth/login

```
id:         b18ddce0de81
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /auth/login
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Hjuyhmq1SQwJnvUyIDChi' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Hjuyhmq1SQwJnvUyIDChi' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "public pages render without a session" --project=desktop
```

### P3-040 Console or runtime errors on /protected

```
id:         633c3a6c09a6
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=HLb--46htM5XquuxSqlBk' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=HLb--46htM5XquuxSqlBk' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=CmNjWKxo2BC1HgHiWPFDd' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=HLb--46htM5XquuxSqlBk' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=HLb--46htM5XquuxSqlBk' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2 / 403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "protected root sends an admin to the dashboard" --project=desktop
```

### P3-041 Console or runtime errors on /protected?session=TEST-2026-27

```
id:         c41fbde1567f
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=bvhbLyLjzQArzWIOHnFli' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=bvhbLyLjzQArzWIOHnFli' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=bvhbLyLjzQArzWIOHnFli' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=bvhbLyLjzQArzWIOHnFli' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-042 Console or runtime errors on /protected/access-denied?session=TEST-2026-27

```
id:         56ae68b36bac
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/access-denied?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gD9gf-tWDGbHqi7Z_alQ4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gD9gf-tWDGbHqi7Z_alQ4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gD9gf-tWDGbHqi7Z_alQ4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gD9gf-tWDGbHqi7Z_alQ4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-043 Console or runtime errors on /protected/admin-tools?session=TEST-2026-27

```
id:         6a8afbe330f1
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/admin-tools?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gD9gf-tWDGbHqi7Z_alQ4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gD9gf-tWDGbHqi7Z_alQ4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Em29yDljqRXFovR8d5xhX' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Em29yDljqRXFovR8d5xhX' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gD9gf-tWDGbHqi7Z_alQ4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gD9gf-tWDGbHqi7Z_alQ4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Em29yDljqRXFovR8d5xhX' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-044 Slow initial render on /protected/admin-tools?session=TEST-2026-27

```
id:         1f0bf70da21a
rule:       perf.slow-render  [heuristic]
targets:    local     seen: 1×
surface:    /protected/admin-tools?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   Initial render under 5000ms.
actual:     5530ms to DOM/network-idle capture.
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gD9gf-tWDGbHqi7Z_alQ4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gD9gf-tWDGbHqi7Z_alQ4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Em29yDljqRXFovR8d5xhX' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-045 Console or runtime errors on /protected/admin-tools/activity?session=TEST-2026-27

```
id:         6bbeb329e54f
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/admin-tools/activity?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ryDbJPtu3oevK4qXATMVE' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ryDbJPtu3oevK4qXATMVE' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ryDbJPtu3oevK4qXATMVE' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ryDbJPtu3oevK4qXATMVE' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-046 Console or runtime errors on /protected/admin-tools/prev-year-dues?session=TEST-2026-27

```
id:         101e16f488ce
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/admin-tools/prev-year-dues?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=DANt-O2VDJ-gu5eDSs_Z6' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=DANt-O2VDJ-gu5eDSs_Z6' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=DANt-O2VDJ-gu5eDSs_Z6' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=DANt-O2VDJ-gu5eDSs_Z6' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-047 Console or runtime errors on /protected/admin-tools/promotion?session=TEST-2026-27

```
id:         fb293d08c800
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/admin-tools/promotion?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ovWALF8m8npYlgNMcHaPY' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ovWALF8m8npYlgNMcHaPY' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ovWALF8m8npYlgNMcHaPY' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ovWALF8m8npYlgNMcHaPY' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ovWALF8m8npYlgNMcHaPY' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ovWALF8m8npYlgNMcHaPY' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-048 Console or runtime errors on /protected/admin-tools/promotion/65b4c425-93bc-4cd8-884b-16bf478d7bed?session=TEST-2026-27

```
id:         79363d020079
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/admin-tools/promotion/65b4c425-93bc-4cd8-884b-16bf478d7bed?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=wIjbc5LxP0WusrbvOh122' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=wIjbc5LxP0WusrbvOh122' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=wIjbc5LxP0WusrbvOh122' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=wIjbc5LxP0WusrbvOh122' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=wIjbc5LxP0WusrbvOh122' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=wIjbc5LxP0WusrbvOh122' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=wIjbc5LxP0WusrbvOh122' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=wIjbc5LxP0WusrbvOh122' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=wIjbc5LxP0WusrbvOh122' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "dynamic pages render with a discovered id" --project=desktop
```

### P3-049 Slow initial render on /protected/admin-tools/promotion/65b4c425-93bc-4cd8-884b-16bf478d7bed?session=TEST-2026-27

```
id:         7be8b4e6dd4c
rule:       perf.slow-render  [heuristic]
targets:    local     seen: 1×
surface:    /protected/admin-tools/promotion/65b4c425-93bc-4cd8-884b-16bf478d7bed?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   Initial render under 5000ms.
actual:     9733ms to DOM/network-idle capture.
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=wIjbc5LxP0WusrbvOh122' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=wIjbc5LxP0WusrbvOh122' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=wIjbc5LxP0WusrbvOh122' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "dynamic pages render with a discovered id" --project=desktop
```

### P3-050 A missing record renders an empty workspace: /protected/admin-tools/promotion/deep-missing-run?session=TEST-2026-27

```
id:         d3badd137381
rule:       ux.observation  [heuristic]
targets:    local     seen: 1×
surface:    /protected/admin-tools/promotion/deep-missing-run?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   An id that cannot exist says so — a not-found message, not a blank content area.
actual:     Only the navigation chrome rendered (383 chars of text, no message). Body: VPPS · FEE OFFICE
            
            Fee Management
            
            Shri Veer Patta SSS
            
            DAILY
            
            Dashboard
            Students
            Payment Desk
            Defaulters
            483
            
            RECORDS
            
            Fee Setup
            Transactions
            Exports
            Admin Tools
            
            2026-27
            
            DAY SO FAR
            
            ₹0
            
            0 receipts 
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=PhBbuwruiuGFPskJGtbUU' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Ish6gaG59LUbIm-Orf4lc' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-051 Console or runtime errors on /protected/admin-tools/promotion/deep-missing-run?session=TEST-2026-27

```
id:         4083d8e1704e
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/admin-tools/promotion/deep-missing-run?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=PhBbuwruiuGFPskJGtbUU' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Ish6gaG59LUbIm-Orf4lc' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=PhBbuwruiuGFPskJGtbUU' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Ish6gaG59LUbIm-Orf4lc' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-052 Console or runtime errors on /protected/admin-tools/recovery?session=TEST-2026-27

```
id:         6afff067247f
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/admin-tools/recovery?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=hDjFDAbMH5sGRZDZcDuq0' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=hDjFDAbMH5sGRZDZcDuq0' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2 / 403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-053 Console or runtime errors on /protected/admin-tools/session-health?session=TEST-2026-27

```
id:         9cbb24f5eedd
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/admin-tools/session-health?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Qcy42p98pjVAChXIWq8p9' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Qcy42p98pjVAChXIWq8p9' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-054 Console or runtime errors on /protected/admin-tools/whatsapp-templates?session=TEST-2026-27

```
id:         c477c823fe2f
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/admin-tools/whatsapp-templates?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-055 Console or runtime errors on /protected/advanced?session=TEST-2026-27

```
id:         b555f535cc68
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/advanced?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-056 Console or runtime errors on /protected/advanced?session=TEST-2026-27

```
id:         a98767d0582d
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/advanced?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=nopztHZYL2lioznW2GKhp' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=nopztHZYL2lioznW2GKhp' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=lf_qgc8FCki9zLR1FRaSG' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=lf_qgc8FCki9zLR1FRaSG' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=lf_qgc8FCki9zLR1FRaSG' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=nopztHZYL2lioznW2GKhp' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=nopztHZYL2lioznW2GKhp' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2 / 403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "legacy aliases still land where staff bookmarks expect" --project=desktop
```

### P3-057 Slow initial render on /protected/advanced?session=TEST-2026-27

```
id:         06d26ed7eb39
rule:       perf.slow-render  [heuristic]
targets:    local     seen: 1×
surface:    /protected/advanced?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   Initial render under 5000ms.
actual:     5203ms to DOM/network-idle capture.
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=nopztHZYL2lioznW2GKhp' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=nopztHZYL2lioznW2GKhp' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2 / 403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "legacy aliases still land where staff bookmarks expect" --project=desktop
```

### P3-058 Console or runtime errors on /protected/collections?session=TEST-2026-27

```
id:         53bab708cae9
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/collections?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-059 Console or runtime errors on /protected/collections?session=TEST-2026-27

```
id:         68c00c2306fb
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/collections?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=xiV9gVHhmUi7VNxfL8x3-' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=xiV9gVHhmUi7VNxfL8x3-' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=4KXB3fKz33xfArQl6HaE4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=xiV9gVHhmUi7VNxfL8x3-' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=xiV9gVHhmUi7VNxfL8x3-' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2 / 403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "legacy aliases still land where staff bookmarks expect" --project=desktop
```

### P3-060 Console or runtime errors on /protected/dashboard

```
id:         8d3603ffbbc2
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=jFIM3CeAivjCsxdmKI5Mb' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=jFIM3CeAivjCsxdmKI5Mb' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=jFIM3CeAivjCsxdmKI5Mb' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=jFIM3CeAivjCsxdmKI5Mb' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "session label resolution: url, cookie, default" --project=desktop
```

### P3-061 Console or runtime errors on /protected/dashboard?session=

```
id:         7110432531ab
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?session=
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=WEd2L3DGfK48Jzh2tEVue' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=WEd2L3DGfK48Jzh2tEVue' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=WEd2L3DGfK48Jzh2tEVue' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=WEd2L3DGfK48Jzh2tEVue' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "session label resolution: url, cookie, default" --project=desktop
```

### P3-062 Console or runtime errors on /protected/dashboard?session=2026-2027

```
id:         206d05b7c9d6
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?session=2026-2027
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Qapd38DMV47Xb6pangC3e' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Qapd38DMV47Xb6pangC3e' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Qapd38DMV47Xb6pangC3e' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Qapd38DMV47Xb6pangC3e' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "session label resolution: url, cookie, default" --project=desktop
```

### P3-063 Console or runtime errors on /protected/dashboard?session=2026-2027&session=TEST-2026-27

```
id:         7dabebf3a6b1
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?session=2026-2027&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-064 Console or runtime errors on /protected/dashboard?session=garbage

```
id:         abb668c68ac3
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?session=garbage
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=rc9FXIlqh0M1cIrRHmls2' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=rc9FXIlqh0M1cIrRHmls2' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=rc9FXIlqh0M1cIrRHmls2' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=rc9FXIlqh0M1cIrRHmls2' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "session label resolution: url, cookie, default" --project=desktop
```

### P3-065 Console or runtime errors on /protected/dashboard?session=garbage&session=TEST-2026-27

```
id:         a4726a7ecd36
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?session=garbage&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-066 Console or runtime errors on /protected/dashboard?session=TEST-2026-27

```
id:         a3d7b629b593
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-067 Console or runtime errors on /protected/dashboard?session=TEST-2026-27

```
id:         27420c9481f7
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=SoJ1LsGnuZnEUJmVsCYLG' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=SoJ1LsGnuZnEUJmVsCYLG' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=SoJ1LsGnuZnEUJmVsCYLG' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=SoJ1LsGnuZnEUJmVsCYLG' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "session label resolution: url, cookie, default" --project=desktop
```

### P3-068 Console or runtime errors on /protected/dashboard?session=TEST-2026-27

```
id:         1424d72df5fc
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?session=TEST-2026-27
role:       —        device: tablet        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Q33CJPbwUoa8NtQhgcfwI' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Q33CJPbwUoa8NtQhgcfwI' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Q33CJPbwUoa8NtQhgcfwI' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Q33CJPbwUoa8NtQhgcfwI' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Q33CJPbwUoa8NtQhgcfwI' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=tablet
```

### P3-069 Console or runtime errors on /protected/dashboard?session=TEST-2026-27

```
id:         e6b836bdfc5c
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?session=TEST-2026-27
role:       —        device: mobile        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=qg1t514qtLONtIQeDgSfD' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=qg1t514qtLONtIQeDgSfD' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=qg1t514qtLONtIQeDgSfD' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=qg1t514qtLONtIQeDgSfD' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=mobile
```

### P3-070 Console or runtime errors on /protected/dashboard?view=bogus&session=TEST-2026-27

```
id:         266c821046b1
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?view=bogus&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=iVY16qKG58ansl9lW7m6N' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=iVY16qKG58ansl9lW7m6N' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=iVY16qKG58ansl9lW7m6N' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=iVY16qKG58ansl9lW7m6N' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-071 Console or runtime errors on /protected/dashboard?view=classes&session=TEST-2026-27

```
id:         351336d2369d
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?view=classes&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gD34N6qGt4RAr8neZ8HBP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gD34N6qGt4RAr8neZ8HBP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gD34N6qGt4RAr8neZ8HBP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gD34N6qGt4RAr8neZ8HBP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every dashboard board renders" --project=desktop
```

### P3-072 Console or runtime errors on /protected/dashboard?view=collection&days=14&session=TEST-2026-27

```
id:         f130ecd6c266
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?view=collection&days=14&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=TYawlBckM46ySCmJaHJv9' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=TYawlBckM46ySCmJaHJv9' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every dashboard board renders" --project=desktop
```

### P3-073 Console or runtime errors on /protected/dashboard?view=collection&days=30&session=TEST-2026-27

```
id:         f02987581c3f
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?view=collection&days=30&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=X3kqY1alpdGsCU4D8j1VK' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=X3kqY1alpdGsCU4D8j1VK' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every dashboard board renders" --project=desktop
```

### P3-074 Console or runtime errors on /protected/dashboard?view=collection&days=999&session=TEST-2026-27

```
id:         92967ab115d9
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?view=collection&days=999&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=pO0z25vEOvWeNBZ59wOvF' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=c2jhEgL1kqQ_tL-3mTpWM' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=pO0z25vEOvWeNBZ59wOvF' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=c2jhEgL1kqQ_tL-3mTpWM' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-075 Console or runtime errors on /protected/dashboard?view=collection&session=TEST-2026-27

```
id:         5132aa1bc9c8
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?view=collection&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=LNYkRbM5KlYxPwhFXReHE' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=LNYkRbM5KlYxPwhFXReHE' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=LNYkRbM5KlYxPwhFXReHE' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=LNYkRbM5KlYxPwhFXReHE' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every dashboard board renders" --project=desktop
```

### P3-076 Console or runtime errors on /protected/dashboard?view=latefee&session=TEST-2026-27

```
id:         86fc1e7e823e
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?view=latefee&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=LH3RIuw45cGftbQPeb1Nz' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=LH3RIuw45cGftbQPeb1Nz' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=LH3RIuw45cGftbQPeb1Nz' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=LH3RIuw45cGftbQPeb1Nz' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every dashboard board renders" --project=desktop
```

### P3-077 Console or runtime errors on /protected/dashboard?view=overview&session=TEST-2026-27

```
id:         cda1063f8c67
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?view=overview&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=BKiH-x8gKslXvUvegYxr0' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=BKiH-x8gKslXvUvegYxr0' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=BKiH-x8gKslXvUvegYxr0' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=BKiH-x8gKslXvUvegYxr0' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every dashboard board renders" --project=desktop
```

### P3-078 Console or runtime errors on /protected/dashboard?view=overview&view=collection&session=TEST-2026-27

```
id:         f91f470fe0e3
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?view=overview&view=collection&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=pO0z25vEOvWeNBZ59wOvF' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=pO0z25vEOvWeNBZ59wOvF' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-079 Console or runtime errors on /protected/dashboard?view=recovery&session=TEST-2026-27

```
id:         931f876ef15f
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dashboard?view=recovery&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=kUao6jdiXgREj4uY-Z5vJ' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=kUao6jdiXgREj4uY-Z5vJ' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=kUao6jdiXgREj4uY-Z5vJ' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=kUao6jdiXgREj4uY-Z5vJ' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every dashboard board renders" --project=desktop
```

### P3-080 Console or runtime errors on /protected/defaulters?minPendingAmount=-500&session=TEST-2026-27

```
id:         db9a453b0fcb
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/defaulters?minPendingAmount=-500&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-081 Console or runtime errors on /protected/defaulters?minPendingAmount=5000&session=TEST-2026-27

```
id:         ae579ad30165
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/defaulters?minPendingAmount=5000&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=NyFvShIlQQV-w4pAhSQIv' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=NyFvShIlQQV-w4pAhSQIv' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=NyFvShIlQQV-w4pAhSQIv' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=NyFvShIlQQV-w4pAhSQIv' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "defaulters filters" --project=desktop
```

### P3-082 Console or runtime errors on /protected/defaulters?overdue=overdue&session=TEST-2026-27

```
id:         dc5736a2547f
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/defaulters?overdue=overdue&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=viuHmSvKJHuUVDa0nay_q' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=viuHmSvKJHuUVDa0nay_q' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=viuHmSvKJHuUVDa0nay_q' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=viuHmSvKJHuUVDa0nay_q' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "defaulters filters" --project=desktop
```

### P3-083 Console or runtime errors on /protected/defaulters?prevYearDues=prevYear&session=TEST-2026-27

```
id:         08fa5a66d3b1
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/defaulters?prevYearDues=prevYear&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=1t89l1YpfwOVwRjNzuf_W' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=1t89l1YpfwOVwRjNzuf_W' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=1t89l1YpfwOVwRjNzuf_W' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=1t89l1YpfwOVwRjNzuf_W' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "defaulters filters" --project=desktop
```

### P3-084 Console or runtime errors on /protected/defaulters?query=')%3B%20--%20O'Brien%20%F0%9F%98%80%20%D8%A7%D8%AE%D8%AA%D8%A8%D8%A7%D8%B1&session=TEST-2026-27

```
id:         9e7522daf00e
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/defaulters?query=')%3B%20--%20O'Brien%20%F0%9F%98%80%20%D8%A7%D8%AE%D8%AA%D8%A8%D8%A7%D8%B1&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=j1S4CeQNex-eqVF4YTF2o' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=_OoleMNpnxql3atAkY3kI' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=_OoleMNpnxql3atAkY3kI' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=j1S4CeQNex-eqVF4YTF2o' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=_OoleMNpnxql3atAkY3kI' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "a hostile search string finds nothing and breaks nothing" --project=desktop
```

### P3-085 Console or runtime errors on /protected/defaulters?query=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx&session=TEST-2026-27

```
id:         6756b7dbb468
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/defaulters?query=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-086 Console or runtime errors on /protected/defaulters?session=TEST-2026-27

```
id:         69f2c42f9669
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/defaulters?session=TEST-2026-27
role:       —        device: mobile        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=arvKq0VKsQL9dHtjBPDtx' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=arvKq0VKsQL9dHtjBPDtx' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=mobile
```

### P3-087 Console or runtime errors on /protected/dues?session=TEST-2026-27

```
id:         fd24ee942c88
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dues?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-088 Console or runtime errors on /protected/dues?session=TEST-2026-27

```
id:         0646fa9e6ad1
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/dues?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=YKaXsp4NZQK3xRRKKAO79' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=YKaXsp4NZQK3xRRKKAO79' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=zISsjP53qVB2xf8DlDwnF' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=zISsjP53qVB2xf8DlDwnF' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=zISsjP53qVB2xf8DlDwnF' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=YKaXsp4NZQK3xRRKKAO79' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=YKaXsp4NZQK3xRRKKAO79' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2 / 403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "legacy aliases still land where staff bookmarks expect" --project=desktop
```

### P3-089 Console or runtime errors on /protected/fee-setup?section=basic&session=TEST-2026-27

```
id:         af2a30d2998f
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/fee-setup?section=basic&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=aiLXlnswkjfjvajVQ_dYr' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=aiLXlnswkjfjvajVQ_dYr' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=aiLXlnswkjfjvajVQ_dYr' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=aiLXlnswkjfjvajVQ_dYr' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "fee setup sections and time travel" --project=desktop
```

### P3-090 Console or runtime errors on /protected/fee-setup?section=classes&session=TEST-2026-27

```
id:         81cbc185fc08
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/fee-setup?section=classes&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Wrx7oL3AtGerwagcvUoD3' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Wrx7oL3AtGerwagcvUoD3' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Wrx7oL3AtGerwagcvUoD3' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Wrx7oL3AtGerwagcvUoD3' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "fee setup sections and time travel" --project=desktop
```

### P3-091 Console or runtime errors on /protected/fee-setup?section=discounts&session=TEST-2026-27

```
id:         10f599b22b41
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/fee-setup?section=discounts&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=xSmbVYEwsQ3DvSiQqoeCP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=xSmbVYEwsQ3DvSiQqoeCP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=xSmbVYEwsQ3DvSiQqoeCP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=xSmbVYEwsQ3DvSiQqoeCP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "fee setup sections and time travel" --project=desktop
```

### P3-092 Console or runtime errors on /protected/fee-setup?section=fee-heads&session=TEST-2026-27

```
id:         20488a957ab9
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/fee-setup?section=fee-heads&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Et0O-8dtZr_nbp0zbm3u5' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Et0O-8dtZr_nbp0zbm3u5' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Et0O-8dtZr_nbp0zbm3u5' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Et0O-8dtZr_nbp0zbm3u5' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "fee setup sections and time travel" --project=desktop
```

### P3-093 Console or runtime errors on /protected/fee-setup?section=installments&session=TEST-2026-27

```
id:         8f955ce5bf72
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/fee-setup?section=installments&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=JMFj92EtVka__P048zSFp' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=JMFj92EtVka__P048zSFp' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "fee setup sections and time travel" --project=desktop
```

### P3-094 Console or runtime errors on /protected/fee-setup?section=session&session=TEST-2026-27

```
id:         262f7471f280
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/fee-setup?section=session&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=-hdbVXT6CFeNLBDUULdPi' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=-hdbVXT6CFeNLBDUULdPi' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=-hdbVXT6CFeNLBDUULdPi' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=-hdbVXT6CFeNLBDUULdPi' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "fee setup sections and time travel" --project=desktop
```

### P3-095 Console or runtime errors on /protected/fee-setup?section=transport&session=TEST-2026-27

```
id:         b00f209bc79e
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/fee-setup?section=transport&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=IhB3-UySUu4NPs7iJlhbs' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=IhB3-UySUu4NPs7iJlhbs' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=IhB3-UySUu4NPs7iJlhbs' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=IhB3-UySUu4NPs7iJlhbs' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "fee setup sections and time travel" --project=desktop
```

### P3-096 Console or runtime errors on /protected/fee-setup?session=TEST-2026-27

```
id:         0300453d2d77
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/fee-setup?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-097 Console or runtime errors on /protected/fee-setup?session=TEST-2026-27

```
id:         896146175785
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/fee-setup?session=TEST-2026-27
role:       —        device: tablet        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=XGbU2rcRqb8PM0ZG1ANT2' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=CHy_onVhpLr2TnfMPaGt4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=CHy_onVhpLr2TnfMPaGt4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=CHy_onVhpLr2TnfMPaGt4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=XGbU2rcRqb8PM0ZG1ANT2' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=CHy_onVhpLr2TnfMPaGt4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=CHy_onVhpLr2TnfMPaGt4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=tablet
```

### P3-098 Console or runtime errors on /protected/fee-setup?session=TEST-2026-27

```
id:         0db0142d1260
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/fee-setup?session=TEST-2026-27
role:       —        device: mobile        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=yBVscEDhJHAN9A-OPlFbE' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=yBVscEDhJHAN9A-OPlFbE' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=yBVscEDhJHAN9A-OPlFbE' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=_E8Y-1YNf5PCPs0caR1Kg' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=yBVscEDhJHAN9A-OPlFbE' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=yBVscEDhJHAN9A-OPlFbE' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2 / 403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=mobile
```

### P3-099 Console or runtime errors on /protected/fee-setup/generate?session=TEST-2026-27

```
id:         774c7e12972d
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/fee-setup/generate?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=05OwrAsg_sDBqkPrcZwPJ' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=05OwrAsg_sDBqkPrcZwPJ' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=05OwrAsg_sDBqkPrcZwPJ' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=05OwrAsg_sDBqkPrcZwPJ' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=05OwrAsg_sDBqkPrcZwPJ' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=05OwrAsg_sDBqkPrcZwPJ' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-100 Slow initial render on /protected/fee-setup/generate?session=TEST-2026-27

```
id:         6fd897f5db4f
rule:       perf.slow-render  [heuristic]
targets:    local     seen: 1×
surface:    /protected/fee-setup/generate?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   Initial render under 5000ms.
actual:     16614ms to DOM/network-idle capture.
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=05OwrAsg_sDBqkPrcZwPJ' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=05OwrAsg_sDBqkPrcZwPJ' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-101 Console or runtime errors on /protected/fee-setup/time-travel?asOf=2026-07-01&session=TEST-2026-27

```
id:         e50dcb5e1e6b
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/fee-setup/time-travel?asOf=2026-07-01&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=1rY22FHmVDWeRPJKd7HSW' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=1rY22FHmVDWeRPJKd7HSW' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "fee setup sections and time travel" --project=desktop
```

### P3-102 Console or runtime errors on /protected/fee-setup/time-travel?asOf=9999-99-99&session=TEST-2026-27

```
id:         9f5f1e8ff583
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/fee-setup/time-travel?asOf=9999-99-99&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-103 Console or runtime errors on /protected/fee-setup/time-travel?session=TEST-2026-27

```
id:         1e6e3a695416
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/fee-setup/time-travel?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=jZoi-6I2z_YhLhC9WFOCk' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=jZoi-6I2z_YhLhC9WFOCk' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-104 Console or runtime errors on /protected/finance-controls?date=not-a-date&session=TEST-2026-27

```
id:         951998678af4
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/finance-controls?date=not-a-date&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-105 Console or runtime errors on /protected/finance-controls?session=TEST-2026-27

```
id:         1ca1fc33d20e
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/finance-controls?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-106 Console or runtime errors on /protected/finance-controls?session=TEST-2026-27

```
id:         5a93dd18c879
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/finance-controls?session=TEST-2026-27
role:       —        device: tablet        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=NN4_TTXi7I0tI59R-fQjh' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=NN4_TTXi7I0tI59R-fQjh' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=tablet
```

### P3-107 Console or runtime errors on /protected/finance-controls?session=TEST-2026-27

```
id:         b8c82d3d0254
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/finance-controls?session=TEST-2026-27
role:       —        device: mobile        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2 / 403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=mobile
```

### P3-108 Console or runtime errors on /protected/imports?session=TEST-2026-27

```
id:         75a12a9d52fb
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/imports?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=RI8aIRCFqI2KW2sLZgN17' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=RI8aIRCFqI2KW2sLZgN17' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-109 Console or runtime errors on /protected/imports?session=TEST-2026-27

```
id:         d37ec6ced7a4
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/imports?session=TEST-2026-27
role:       —        device: tablet        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=LJomrqbdgvSmwsPmZc5JV' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=LJomrqbdgvSmwsPmZc5JV' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=tablet
```

### P3-110 Console or runtime errors on /protected/imports?session=TEST-2026-27

```
id:         f383a6d16955
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/imports?session=TEST-2026-27
role:       —        device: mobile        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2 / 403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=mobile
```

### P3-111 Console or runtime errors on /protected/ledger?query=')%3B%20--%20O'Brien%20%F0%9F%98%80%20%D8%A7%D8%AE%D8%AA%D8%A8%D8%A7%D8%B1&session=TEST-2026-27

```
id:         ebb94c27712b
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/ledger?query=')%3B%20--%20O'Brien%20%F0%9F%98%80%20%D8%A7%D8%AE%D8%AA%D8%A8%D8%A7%D8%B1&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=uyrT5xsw41wvxwlUKZKw9' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=uyrT5xsw41wvxwlUKZKw9' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "a hostile search string finds nothing and breaks nothing" --project=desktop
```

### P3-112 Console or runtime errors on /protected/master-data?session=TEST-2026-27

```
id:         772c1681aafa
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/master-data?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-113 Console or runtime errors on /protected/password?session=TEST-2026-27

```
id:         9653e39b29cb
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/password?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-114 Could not find the collect action for post-cash-partial

```
id:         d1d2375d45d7
rule:       ux.observation  [heuristic]
targets:    local-prod     seen: 1×
surface:    /protected/payments
role:       —        device: —        session: TEST-2026-27
expected:   The desk offers a "Collect ₹… · <mode>" button once an amount is entered.
actual:     No button matching /^collect / was present.
evidence:   docs/smoke-reports/deep/202608152016-f28680/screenshots/no-collect-post-cash-partial.png
repro:      DEEP_TARGET=local-prod npx playwright test -c tests/deep/deep.config.ts --grep "posts the sanctioned" --project=writes
```

### P3-115 Console or runtime errors on /protected/payments?session=TEST-2026-27

```
id:         22b77fd27705
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/payments?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-116 Console or runtime errors on /protected/payments?session=TEST-2026-27

```
id:         3bde9c41e75d
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/payments?session=TEST-2026-27
role:       —        device: tablet        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=lf2v2vXozCH6vCjNZ9rjX' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=lf2v2vXozCH6vCjNZ9rjX' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=tablet
```

### P3-117 Console or runtime errors on /protected/payments?session=TEST-2026-27

```
id:         7f557bab84cd
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/payments?session=TEST-2026-27
role:       —        device: mobile        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=u452nSpLAKH9bvSkwW3zc' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=u452nSpLAKH9bvSkwW3zc' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=mobile
```

### P3-118 Console or runtime errors on /protected/payments/bulk?session=TEST-2026-27

```
id:         ad135cbe96df
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/payments/bulk?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-119 Console or runtime errors on /protected/receipts?closeouts=1&session=TEST-2026-27

```
id:         f8158a95e68b
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts?closeouts=1&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=SVZ0IgYqeJggb4U82esb5' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=9ldHgCJNXApwPqTJYAzRB' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=SVZ0IgYqeJggb4U82esb5' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=9ldHgCJNXApwPqTJYAzRB' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "receipt lookup filters" --project=desktop
```

### P3-120 Console or runtime errors on /protected/receipts?date=custom&from=2026-04-01&to=2026-08-01&session=TEST-2026-27

```
id:         b8674d2a6af1
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts?date=custom&from=2026-04-01&to=2026-08-01&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=NouGhasQICWMycRDbKpJu' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=NouGhasQICWMycRDbKpJu' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "receipt lookup filters" --project=desktop
```

### P3-121 Console or runtime errors on /protected/receipts?date=month&session=TEST-2026-27

```
id:         c960bf4d37cd
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts?date=month&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=LTeAUc6R7cIqWBq0ciPtZ' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=LTeAUc6R7cIqWBq0ciPtZ' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "receipt lookup filters" --project=desktop
```

### P3-122 Console or runtime errors on /protected/receipts?date=session&session=TEST-2026-27

```
id:         fc73c6b7e12f
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts?date=session&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=oW54a9_Mk-3JOYaaUzlnf' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=oW54a9_Mk-3JOYaaUzlnf' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "receipt lookup filters" --project=desktop
```

### P3-123 Console or runtime errors on /protected/receipts?date=today&session=TEST-2026-27

```
id:         e41b5d2080cf
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts?date=today&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=a8wOAbaQ53wWUT6ARRLwA' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=a8wOAbaQ53wWUT6ARRLwA' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "receipt lookup filters" --project=desktop
```

### P3-124 Console or runtime errors on /protected/receipts?date=week&session=TEST-2026-27

```
id:         a8bd4898b585
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts?date=week&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=TZMfKHjAKyvTwusCDZ7fv' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=TZMfKHjAKyvTwusCDZ7fv' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "receipt lookup filters" --project=desktop
```

### P3-125 Console or runtime errors on /protected/receipts?date=yesterday&session=TEST-2026-27

```
id:         00e18b833135
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts?date=yesterday&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=6Aa1nBSMnHYdvtbmwohfy' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=6Aa1nBSMnHYdvtbmwohfy' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "receipt lookup filters" --project=desktop
```

### P3-126 Console or runtime errors on /protected/receipts?facets=1&session=TEST-2026-27

```
id:         2ba47f30d64c
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts?facets=1&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=TrQZRumf7omCreHZ5uQBt' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=TrQZRumf7omCreHZ5uQBt' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "receipt lookup filters" --project=desktop
```

### P3-127 Console or runtime errors on /protected/receipts?modes=cash,upi&session=TEST-2026-27

```
id:         457318ad5e20
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts?modes=cash,upi&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=nshechKvSZokWej4_h3N_' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=nshechKvSZokWej4_h3N_' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "receipt lookup filters" --project=desktop
```

### P3-128 Console or runtime errors on /protected/receipts?query=')%3B%20--%20O'Brien%20%F0%9F%98%80%20%D8%A7%D8%AE%D8%AA%D8%A8%D8%A7%D8%B1&session=TEST-2026-27

```
id:         bc0f30aba8fc
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts?query=')%3B%20--%20O'Brien%20%F0%9F%98%80%20%D8%A7%D8%AE%D8%AA%D8%A8%D8%A7%D8%B1&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=3MvognpvwltEEf87RmVfc' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=3MvognpvwltEEf87RmVfc' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "a hostile search string finds nothing and breaks nothing" --project=desktop
```

### P3-129 Console or runtime errors on /protected/receipts?reversed=1&session=TEST-2026-27

```
id:         085bb80a03e5
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts?reversed=1&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=SVZ0IgYqeJggb4U82esb5' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=SVZ0IgYqeJggb4U82esb5' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "receipt lookup filters" --project=desktop
```

### P3-130 Console or runtime errors on /protected/receipts?sort=amount&session=TEST-2026-27

```
id:         491cbd65c825
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts?sort=amount&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=5on9hk22i4yIYwtaPJUxz' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=5on9hk22i4yIYwtaPJUxz' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "receipt lookup filters" --project=desktop
```

### P3-131 Console or runtime errors on /protected/receipts?sort=newest&session=TEST-2026-27

```
id:         ad5f90fde843
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts?sort=newest&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=JXb4lUARDZt0blWvd_dHV' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=JXb4lUARDZt0blWvd_dHV' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "receipt lookup filters" --project=desktop
```

### P3-132 Console or runtime errors on /protected/receipts/03827d4d-44e9-4fd5-857b-252af2b7a0e0?session=TEST-2026-27

```
id:         89fe3e205549
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts/03827d4d-44e9-4fd5-857b-252af2b7a0e0?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gW_WFJizt-aCcGdBmyatP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gW_WFJizt-aCcGdBmyatP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gW_WFJizt-aCcGdBmyatP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gW_WFJizt-aCcGdBmyatP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "dynamic pages render with a discovered id" --project=desktop
```

### P3-133 A missing record renders an empty workspace: /protected/receipts/not-a-receipt?returnTo=//evil.example&session=TEST-2026-27

```
id:         163dd7e98790
rule:       ux.observation  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts/not-a-receipt?returnTo=//evil.example&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   An id that cannot exist says so — a not-found message, not a blank content area.
actual:     Only the navigation chrome rendered (302 chars of text, no message). Body: VPPS · FEE OFFICE
            
            Fee Management
            
            Shri Veer Patta SSS
            
            DAILY
            
            Dashboard
            Students
            Payment Desk
            Defaulters
            483
            
            RECORDS
            
            Fee Setup
            Transactions
            Exports
            Admin Tools
            
            2026-27
            
            DAY SO FAR
            
            ₹0
            
            0 receipts 
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-134 Console or runtime errors on /protected/receipts/not-a-receipt?returnTo=//evil.example&session=TEST-2026-27

```
id:         94570a7bd6fe
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts/not-a-receipt?returnTo=//evil.example&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-135 A missing record renders an empty workspace: /protected/receipts/not-a-receipt?session=TEST-2026-27

```
id:         e150b3c90b7e
rule:       ux.observation  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts/not-a-receipt?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   An id that cannot exist says so — a not-found message, not a blank content area.
actual:     Only the navigation chrome rendered (302 chars of text, no message). Body: VPPS · FEE OFFICE
            
            Fee Management
            
            Shri Veer Patta SSS
            
            DAILY
            
            Dashboard
            Students
            Payment Desk
            Defaulters
            483
            
            RECORDS
            
            Fee Setup
            Transactions
            Exports
            Admin Tools
            
            2026-27
            
            DAY SO FAR
            
            ₹0
            
            0 receipts 
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=PhBbuwruiuGFPskJGtbUU' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-136 Console or runtime errors on /protected/receipts/not-a-receipt?session=TEST-2026-27

```
id:         bf41966a16b2
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/receipts/not-a-receipt?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=PhBbuwruiuGFPskJGtbUU' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=PhBbuwruiuGFPskJGtbUU' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-137 Console or runtime errors on /protected/reports?session=TEST-2026-27

```
id:         a5cf98a42125
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/reports?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Oi0Vyi45Q6ohpR3mSdJvv' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Oi0Vyi45Q6ohpR3mSdJvv' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Oi0Vyi45Q6ohpR3mSdJvv' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Oi0Vyi45Q6ohpR3mSdJvv' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Oi0Vyi45Q6ohpR3mSdJvv' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Oi0Vyi45Q6ohpR3mSdJvv' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Oi0Vyi45Q6ohpR3mSdJvv' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-138 Slow initial render on /protected/reports?session=TEST-2026-27

```
id:         70d9426b212a
rule:       perf.slow-render  [heuristic]
targets:    local     seen: 1×
surface:    /protected/reports?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   Initial render under 5000ms.
actual:     34686ms to DOM/network-idle capture.
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Oi0Vyi45Q6ohpR3mSdJvv' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Oi0Vyi45Q6ohpR3mSdJvv' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-139 Console or runtime errors on /protected/reports/ledger/1402f2e3-232c-4ae8-9e8e-ed8127931440/print?session=TEST-2026-27

```
id:         b52432e5e5e2
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/reports/ledger/1402f2e3-232c-4ae8-9e8e-ed8127931440/print?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gW_WFJizt-aCcGdBmyatP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=lwLmSKL1azwwgQBDP4XK5' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=lwLmSKL1azwwgQBDP4XK5' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=gW_WFJizt-aCcGdBmyatP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=lwLmSKL1azwwgQBDP4XK5' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "dynamic pages render with a discovered id" --project=desktop
```

### P3-140 Console or runtime errors on /protected/settings/glossary?session=TEST-2026-27

```
id:         6647f0c352ca
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/settings/glossary?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-141 Console or runtime errors on /protected/setup?session=TEST-2026-27

```
id:         981480b9f9ec
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/setup?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-142 Console or runtime errors on /protected/setup?session=TEST-2026-27

```
id:         988167cef52c
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/setup?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=8lvox6f7A0fkkao_cc7_N' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=8lvox6f7A0fkkao_cc7_N' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2 / 403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "legacy aliases still land where staff bookmarks expect" --project=desktop
```

### P3-143 Console or runtime errors on /protected/staff?session=TEST-2026-27

```
id:         b7c918889ab6
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/staff?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-144 Console or runtime errors on /protected/students?classId=not-a-uuid&session=TEST-2026-27

```
id:         1bed2f96e88e
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?classId=not-a-uuid&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-145 Console or runtime errors on /protected/students?page=2&session=TEST-2026-27

```
id:         78acdd000bea
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?page=2&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=CQ3fjfAVnokmc6ejeGGdC' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=CQ3fjfAVnokmc6ejeGGdC' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "student list controls: sort, status, class, page" --project=desktop
```

### P3-146 Console or runtime errors on /protected/students?query=')%3B%20--%20O'Brien%20%F0%9F%98%80%20%D8%A7%D8%AE%D8%AA%D8%A8%D8%A7%D8%B1&session=TEST-2026-27

```
id:         d28db3c0a728
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?query=')%3B%20--%20O'Brien%20%F0%9F%98%80%20%D8%A7%D8%AE%D8%AA%D8%A8%D8%A7%D8%B1&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=j1S4CeQNex-eqVF4YTF2o' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=j1S4CeQNex-eqVF4YTF2o' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "a hostile search string finds nothing and breaks nothing" --project=desktop
```

### P3-147 Console or runtime errors on /protected/students?query=%27%29%3B--%20O%27Brien%20%F0%9F%98%80&session=TEST-2026-27

```
id:         b1ccabb3ad3a
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?query=%27%29%3B--%20O%27Brien%20%F0%9F%98%80&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-148 Console or runtime errors on /protected/students?seg=active,hasDues,missingPhone&session=TEST-2026-27

```
id:         57d07d1ed14f
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=active,hasDues,missingPhone&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ASc2j5JVcFGB9Zx0zQSsY' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=6Qm9yX3tQTT7h5XXGNLjA' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ASc2j5JVcFGB9Zx0zQSsY' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=6Qm9yX3tQTT7h5XXGNLjA' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "segment combinations re-emit in definition order" --project=desktop
```

### P3-149 Console or runtime errors on /protected/students?seg=active&session=TEST-2026-27

```
id:         ef6e992cac49
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=active&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-150 Console or runtime errors on /protected/students?seg=discountRte&session=TEST-2026-27

```
id:         7da6d3d557a1
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=discountRte&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-151 Console or runtime errors on /protected/students?seg=discountStaffChild&session=TEST-2026-27

```
id:         517616b3e297
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=discountStaffChild&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-152 Console or runtime errors on /protected/students?seg=discountThirdChild&session=TEST-2026-27

```
id:         90f9acb390bb
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=discountThirdChild&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-153 Console or runtime errors on /protected/students?seg=duesNotPrepared&session=TEST-2026-27

```
id:         b30ea91ebb40
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=duesNotPrepared&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-154 Console or runtime errors on /protected/students?seg=duplicateSr&session=TEST-2026-27

```
id:         c1a7b65fc83a
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=duplicateSr&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-155 Console or runtime errors on /protected/students?seg=emiDue&session=TEST-2026-27

```
id:         c8953330e79f
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=emiDue&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-156 Console or runtime errors on /protected/students?seg=emiMissed&session=TEST-2026-27

```
id:         f35bae2121e8
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=emiMissed&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-157 Console or runtime errors on /protected/students?seg=feeException&session=TEST-2026-27

```
id:         4c9a2cb7c163
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=feeException&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-158 Console or runtime errors on /protected/students?seg=fullyPaid&session=TEST-2026-27

```
id:         f0c54db109d4
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=fullyPaid&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-159 Console or runtime errors on /protected/students?seg=graduated&session=TEST-2026-27

```
id:         8cdbbf5b350e
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=graduated&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-160 Console or runtime errors on /protected/students?seg=hasDiscount&session=TEST-2026-27

```
id:         65cc59cfe567
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=hasDiscount&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=OluGREz_AnKVHLPEdBAF3' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=OluGREz_AnKVHLPEdBAF3' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-161 Console or runtime errors on /protected/students?seg=hasDues&session=TEST-2026-27

```
id:         6a4b9aa696d8
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=hasDues&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=t5yg1Sduzv5W3lXDVfw5A' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=t5yg1Sduzv5W3lXDVfw5A' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-162 Console or runtime errors on /protected/students?seg=lateFeePending,yearClear&session=TEST-2026-27

```
id:         cd372fb02de2
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=lateFeePending,yearClear&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=6Qm9yX3tQTT7h5XXGNLjA' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=BDRIgUJy_0WZ9q-eFy-cw' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=BDRIgUJy_0WZ9q-eFy-cw' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=6Qm9yX3tQTT7h5XXGNLjA' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=BDRIgUJy_0WZ9q-eFy-cw' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "segment combinations re-emit in definition order" --project=desktop
```

### P3-163 Console or runtime errors on /protected/students?seg=lateFeePending&session=TEST-2026-27

```
id:         687a187ae170
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=lateFeePending&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=BRp4dZPYKY1mm0q86mLKM' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=BRp4dZPYKY1mm0q86mLKM' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=BRp4dZPYKY1mm0q86mLKM' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=BRp4dZPYKY1mm0q86mLKM' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-164 Console or runtime errors on /protected/students?seg=lateFeeWaived&session=TEST-2026-27

```
id:         bda202fd24dd
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=lateFeeWaived&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-165 Console or runtime errors on /protected/students?seg=left&session=TEST-2026-27

```
id:         7b5dfe9cc011
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=left&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-166 Console or runtime errors on /protected/students?seg=leftOwing&session=TEST-2026-27

```
id:         819953ce5ed2
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=leftOwing&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-167 Console or runtime errors on /protected/students?seg=missingDob&session=TEST-2026-27

```
id:         a9ea6fe386ee
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=missingDob&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-168 Console or runtime errors on /protected/students?seg=missingPhone&session=TEST-2026-27

```
id:         a18a2fae7f05
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=missingPhone&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-169 Console or runtime errors on /protected/students?seg=neverPaid&session=TEST-2026-27

```
id:         dffdd19cbcf4
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=neverPaid&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=rt6ZP9JMJCT7iK3mhOucY' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=rt6ZP9JMJCT7iK3mhOucY' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=rt6ZP9JMJCT7iK3mhOucY' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=rt6ZP9JMJCT7iK3mhOucY' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-170 Console or runtime errors on /protected/students?seg=newThisYear&session=TEST-2026-27

```
id:         34fb754c76fc
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=newThisYear&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-171 Console or runtime errors on /protected/students?seg=notasegment,overdue&session=TEST-2026-27

```
id:         63af23337a5d
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=notasegment,overdue&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=V-uFk43rfG8Mv1blSfbiR' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=V-uFk43rfG8Mv1blSfbiR' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-172 Console or runtime errors on /protected/students?seg=oldBalanceDue&session=TEST-2026-27

```
id:         1b0fc1f600fc
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=oldBalanceDue&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=EKYpUsSqjBIj2LfY8vl2t' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=EKYpUsSqjBIj2LfY8vl2t' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=EKYpUsSqjBIj2LfY8vl2t' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=EKYpUsSqjBIj2LfY8vl2t' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-173 Console or runtime errors on /protected/students?seg=onEmi&session=TEST-2026-27

```
id:         522fbdfcbe24
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=onEmi&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=KgdA97D88ouLWO0inXoUY' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=KgdA97D88ouLWO0inXoUY' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-174 Console or runtime errors on /protected/students?seg=onTransport,overdue&session=TEST-2026-27

```
id:         9ac44e53fecc
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=onTransport,overdue&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=G2qNCyjbVxP2AcWPr59er' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ASc2j5JVcFGB9Zx0zQSsY' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=G2qNCyjbVxP2AcWPr59er' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ASc2j5JVcFGB9Zx0zQSsY' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "segment combinations re-emit in definition order" --project=desktop
```

### P3-175 Console or runtime errors on /protected/students?seg=onTransport&session=TEST-2026-27

```
id:         b9d60ba9f434
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=onTransport&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-176 Console or runtime errors on /protected/students?seg=overdue,onTransport&session=TEST-2026-27

```
id:         87b60e200c1e
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=overdue,onTransport&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=G2qNCyjbVxP2AcWPr59er' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=G2qNCyjbVxP2AcWPr59er' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "segment combinations re-emit in definition order" --project=desktop
```

### P3-177 Console or runtime errors on /protected/students?seg=overdue&session=TEST-2026-27

```
id:         9d31544efeaf
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=overdue&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ftVfHQ_CP5_3a7Ih6pw0a' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ftVfHQ_CP5_3a7Ih6pw0a' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ftVfHQ_CP5_3a7Ih6pw0a' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ftVfHQ_CP5_3a7Ih6pw0a' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-178 Console or runtime errors on /protected/students?seg=partlyPaid&session=TEST-2026-27

```
id:         284a1aa93a54
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=partlyPaid&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=TpFu8p3By7SlH0DoBElGl' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=TpFu8p3By7SlH0DoBElGl' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-179 Console or runtime errors on /protected/students?seg=pendingSr&session=TEST-2026-27

```
id:         0c393ca7528f
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=pendingSr&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-180 Console or runtime errors on /protected/students?seg=yearClear&session=TEST-2026-27

```
id:         799adedf2e30
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?seg=yearClear&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=TpFu8p3By7SlH0DoBElGl' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=MmD4KI2Kalaj1wBAwlrTg' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=TpFu8p3By7SlH0DoBElGl' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=MmD4KI2Kalaj1wBAwlrTg' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every student segment chip filters" --project=desktop
```

### P3-181 Console or runtime errors on /protected/students?session=TEST-2026-27

```
id:         f6912d8aff17
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=3EwwfvZUEiFHQ_zJMXtm_' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=3EwwfvZUEiFHQ_zJMXtm_' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-182 Console or runtime errors on /protected/students?session=TEST-2026-27

```
id:         68cde7a2edde
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?session=TEST-2026-27
role:       —        device: tablet        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=8nj_2weugoj3NXBU5kSuX' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=8nj_2weugoj3NXBU5kSuX' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=8nj_2weugoj3NXBU5kSuX' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=8nj_2weugoj3NXBU5kSuX' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=tablet
```

### P3-183 Console or runtime errors on /protected/students?session=TEST-2026-27

```
id:         53e43f82a13e
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?session=TEST-2026-27
role:       —        device: mobile        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=7xvJvfJKwMg6CaewODxZ4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=7xvJvfJKwMg6CaewODxZ4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=7xvJvfJKwMg6CaewODxZ4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=7xvJvfJKwMg6CaewODxZ4' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=mobile
```

### P3-184 Console or runtime errors on /protected/students?sort=class&session=TEST-2026-27

```
id:         1fc4f0200878
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?sort=class&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=oGxhGxT8eZiBIJ-KdpBWs' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=oGxhGxT8eZiBIJ-KdpBWs' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "student list controls: sort, status, class, page" --project=desktop
```

### P3-185 Console or runtime errors on /protected/students?sort=name&session=TEST-2026-27

```
id:         f804fc674c61
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?sort=name&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=CuNkHp78Rj5aAS4DT8fgt' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=CuNkHp78Rj5aAS4DT8fgt' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=CuNkHp78Rj5aAS4DT8fgt' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=CuNkHp78Rj5aAS4DT8fgt' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "student list controls: sort, status, class, page" --project=desktop
```

### P3-186 Console or runtime errors on /protected/students?status=active&session=TEST-2026-27

```
id:         212f53bfcdb1
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?status=active&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=oGxhGxT8eZiBIJ-KdpBWs' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=WvSRRuCqQetPrh6__tdtc' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=oGxhGxT8eZiBIJ-KdpBWs' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=WvSRRuCqQetPrh6__tdtc' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "student list controls: sort, status, class, page" --project=desktop
```

### P3-187 Console or runtime errors on /protected/students?status=graduated&session=TEST-2026-27

```
id:         e561035554f9
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?status=graduated&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=H7OQ8rslp7PCyBevTmrpM' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=H7OQ8rslp7PCyBevTmrpM' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "student list controls: sort, status, class, page" --project=desktop
```

### P3-188 Console or runtime errors on /protected/students?status=inactive&session=TEST-2026-27

```
id:         ea3b4a356561
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?status=inactive&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=d0waTdqeIr4aNp7exRCBx' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=d0waTdqeIr4aNp7exRCBx' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "student list controls: sort, status, class, page" --project=desktop
```

### P3-189 Console or runtime errors on /protected/students?status=left&session=TEST-2026-27

```
id:         1139569ff95d
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students?status=left&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=WvSRRuCqQetPrh6__tdtc' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=d1ESt6I54fMJUk0XAQRl2' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=WvSRRuCqQetPrh6__tdtc' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=d1ESt6I54fMJUk0XAQRl2' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "student list controls: sort, status, class, page" --project=desktop
```

### P3-190 Console or runtime errors on /protected/students/1402f2e3-232c-4ae8-9e8e-ed8127931440?session=TEST-2026-27

```
id:         8c7031881e0d
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students/1402f2e3-232c-4ae8-9e8e-ed8127931440?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=0OSUNX-QkCN2y9f12Kw5l' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=0OSUNX-QkCN2y9f12Kw5l' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=0OSUNX-QkCN2y9f12Kw5l' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=0OSUNX-QkCN2y9f12Kw5l' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "dynamic pages render with a discovered id" --project=desktop
```

### P3-191 Console or runtime errors on /protected/students/1402f2e3-232c-4ae8-9e8e-ed8127931440?session=TEST-2026-27

```
id:         d0fc08e5d188
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students/1402f2e3-232c-4ae8-9e8e-ed8127931440?session=TEST-2026-27
role:       —        device: tablet        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=8nj_2weugoj3NXBU5kSuX' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=XGbU2rcRqb8PM0ZG1ANT2' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=XGbU2rcRqb8PM0ZG1ANT2' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=8nj_2weugoj3NXBU5kSuX' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=XGbU2rcRqb8PM0ZG1ANT2' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=tablet
```

### P3-192 Console or runtime errors on /protected/students/1402f2e3-232c-4ae8-9e8e-ed8127931440?session=TEST-2026-27

```
id:         f511bd5620c6
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students/1402f2e3-232c-4ae8-9e8e-ed8127931440?session=TEST-2026-27
role:       —        device: mobile        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=S3g63tiSb0ouV73I0HqJP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=S3g63tiSb0ouV73I0HqJP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Hnz3qIyyvlm_B0zTqkvd1' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=S3g63tiSb0ouV73I0HqJP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=S3g63tiSb0ouV73I0HqJP' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=mobile
```

### P3-193 Console or runtime errors on /protected/students/1402f2e3-232c-4ae8-9e8e-ed8127931440/edit?session=TEST-2026-27

```
id:         e6f015fa821d
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students/1402f2e3-232c-4ae8-9e8e-ed8127931440/edit?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=uKyaTT7NG6Sp67fg7LVK-' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=uKyaTT7NG6Sp67fg7LVK-' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "dynamic pages render with a discovered id" --project=desktop
```

### P3-194 Console or runtime errors on /protected/students/1402f2e3-232c-4ae8-9e8e-ed8127931440/statement?session=TEST-2026-27

```
id:         767af232a835
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students/1402f2e3-232c-4ae8-9e8e-ed8127931440/statement?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=xhbpKCF6UQBmyX8RI5OJM' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=xhbpKCF6UQBmyX8RI5OJM' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "dynamic pages render with a discovered id" --project=desktop
```

### P3-195 A missing record renders an empty workspace: /protected/students/9999999?returnTo=https://example.com&session=TEST-2026-27

```
id:         8c70978efbf5
rule:       ux.observation  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students/9999999?returnTo=https://example.com&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   An id that cannot exist says so — a not-found message, not a blank content area.
actual:     Only the navigation chrome rendered (298 chars of text, no message). Body: VPPS · FEE OFFICE
            
            Fee Management
            
            Shri Veer Patta SSS
            
            DAILY
            
            Dashboard
            Students
            Payment Desk
            Defaulters
            483
            
            RECORDS
            
            Fee Setup
            Transactions
            Exports
            Admin Tools
            
            2026-27
            
            DAY SO FAR
            
            ₹0
            
            0 receipts 
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-196 Console or runtime errors on /protected/students/9999999?returnTo=https://example.com&session=TEST-2026-27

```
id:         da20bc682c54
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students/9999999?returnTo=https://example.com&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-197 A missing record renders an empty workspace: /protected/students/9999999?session=TEST-2026-27

```
id:         7dd1dfb060be
rule:       ux.observation  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students/9999999?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   An id that cannot exist says so — a not-found message, not a blank content area.
actual:     Only the navigation chrome rendered (298 chars of text, no message). Body: VPPS · FEE OFFICE
            
            Fee Management
            
            Shri Veer Patta SSS
            
            DAILY
            
            Dashboard
            Students
            Payment Desk
            Defaulters
            483
            
            RECORDS
            
            Fee Setup
            Transactions
            Exports
            Admin Tools
            
            2026-27
            
            DAY SO FAR
            
            ₹0
            
            0 receipts 
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ouzPxVzxpgfynjMkVtH0Z' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-198 Console or runtime errors on /protected/students/9999999?session=TEST-2026-27

```
id:         d02ec23c0c20
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students/9999999?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ouzPxVzxpgfynjMkVtH0Z' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=ouzPxVzxpgfynjMkVtH0Z' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-199 Console or runtime errors on /protected/students/bulk-update?session=TEST-2026-27

```
id:         6f89ba84ec17
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students/bulk-update?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-200 A missing record renders an empty workspace: /protected/students/families?session=TEST-2026-27

```
id:         278b5fb09b28
rule:       ux.observation  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students/families?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   An id that cannot exist says so — a not-found message, not a blank content area.
actual:     Only the navigation chrome rendered (298 chars of text, no message). Body: VPPS · FEE OFFICE
            
            Fee Management
            
            Shri Veer Patta SSS
            
            DAILY
            
            Dashboard
            Students
            Payment Desk
            Defaulters
            483
            
            RECORDS
            
            Fee Setup
            Transactions
            Exports
            Admin Tools
            
            2026-27
            
            DAY SO FAR
            
            ₹0
            
            0 receipts 
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=e7N8f81ove5h1UjFQsy29' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-201 Console or runtime errors on /protected/students/families?session=TEST-2026-27

```
id:         12ad5dab747f
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students/families?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=e7N8f81ove5h1UjFQsy29' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=e7N8f81ove5h1UjFQsy29' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-202 Console or runtime errors on /protected/students/family/00000000-0000-0000-0000-000000000000/pay?session=TEST-2026-27

```
id:         ca085b5837f8
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students/family/00000000-0000-0000-0000-000000000000/pay?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 404 (Not Found)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Sa_r6JGpOcCc7HxV9vCZx' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 404 (Not Found) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Sa_r6JGpOcCc7HxV9vCZx' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    404 http://127.0.0.1:3000/protected/students/family/00000000-0000-0000-0000-000000000000/pay?session=TEST-2026-27 / 403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-203 Console or runtime errors on /protected/students/new?session=TEST-2026-27

```
id:         bb9a191b68e2
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students/new?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-204 A missing record renders an empty workspace: /protected/students/not-a-uuid-at-all?session=TEST-2026-27

```
id:         fbf2eeb2da12
rule:       ux.observation  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students/not-a-uuid-at-all?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   An id that cannot exist says so — a not-found message, not a blank content area.
actual:     Only the navigation chrome rendered (298 chars of text, no message). Body: VPPS · FEE OFFICE
            
            Fee Management
            
            Shri Veer Patta SSS
            
            DAILY
            
            Dashboard
            Students
            Payment Desk
            Defaulters
            483
            
            RECORDS
            
            Fee Setup
            Transactions
            Exports
            Admin Tools
            
            2026-27
            
            DAY SO FAR
            
            ₹0
            
            0 receipts 
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Ar9oqf88Kcrl_7ZEO27Yk' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-205 Console or runtime errors on /protected/students/not-a-uuid-at-all?session=TEST-2026-27

```
id:         8b4a2d491dc7
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/students/not-a-uuid-at-all?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Ar9oqf88Kcrl_7ZEO27Yk' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Ar9oqf88Kcrl_7ZEO27Yk' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-206 Console or runtime errors on /protected/transactions?fromDate=2027-01-01&toDate=2026-01-01&session=TEST-2026-27

```
id:         f32b67ca5eee
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?fromDate=2027-01-01&toDate=2026-01-01&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-207 Console or runtime errors on /protected/transactions?session=TEST-2026-27

```
id:         6673807491e8
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every static protected page renders" --project=desktop
```

### P3-208 Console or runtime errors on /protected/transactions?session=TEST-2026-27

```
id:         13e3397f16dc
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?session=TEST-2026-27
role:       —        device: tablet        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=8zJ9IJssvzQUVwHrADSoX' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=8zJ9IJssvzQUVwHrADSoX' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=tablet
```

### P3-209 Console or runtime errors on /protected/transactions?session=TEST-2026-27

```
id:         873da4255e40
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?session=TEST-2026-27
role:       —        device: mobile        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=SHk8mUIA42CEMftXPvcfh' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=SHk8mUIA42CEMftXPvcfh' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "route families render without overflow on this device" --project=mobile
```

### P3-210 Console or runtime errors on /protected/transactions?view=all_transactions&session=TEST-2026-27

```
id:         c1d80f23a5f8
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?view=all_transactions&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every transactions view renders, aliases included" --project=desktop
```

### P3-211 Console or runtime errors on /protected/transactions?view=class_register&session=TEST-2026-27

```
id:         419614855d59
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?view=class_register&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=K9GwDL_zt1M0DvT3AAhW2' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=K9GwDL_zt1M0DvT3AAhW2' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every transactions view renders, aliases included" --project=desktop
```

### P3-212 Console or runtime errors on /protected/transactions?view=collection_today&session=TEST-2026-27

```
id:         05f7b880175d
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?view=collection_today&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=0jJEWlMBZyYYD8Y8fwkLC' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=0jJEWlMBZyYYD8Y8fwkLC' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every transactions view renders, aliases included" --project=desktop
```

### P3-213 Console or runtime errors on /protected/transactions?view=defaulters&session=TEST-2026-27

```
id:         da5b1783c2ae
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?view=defaulters&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=LN_TXVbwaVSQJTblu2mCC' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Cm9r6mF_J7S3EN2W6k5mq' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=LN_TXVbwaVSQJTblu2mCC' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Cm9r6mF_J7S3EN2W6k5mq' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every transactions view renders, aliases included" --project=desktop
```

### P3-214 Console or runtime errors on /protected/transactions?view=dues&session=TEST-2026-27

```
id:         c065998a8040
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?view=dues&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every transactions view renders, aliases included" --project=desktop
```

### P3-215 Console or runtime errors on /protected/transactions?view=exports&session=TEST-2026-27

```
id:         71160c55a4ee
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?view=exports&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every transactions view renders, aliases included" --project=desktop
```

### P3-216 Console or runtime errors on /protected/transactions?view=import_issues&session=TEST-2026-27

```
id:         e15c65abaf67
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?view=import_issues&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Zv6D7yyQEUNV3q668RjkX' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Zv6D7yyQEUNV3q668RjkX' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every transactions view renders, aliases included" --project=desktop
```

### P3-217 Console or runtime errors on /protected/transactions?view=installments&session=TEST-2026-27

```
id:         3aea6b8f1c95
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?view=installments&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=LN_TXVbwaVSQJTblu2mCC' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=LN_TXVbwaVSQJTblu2mCC' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every transactions view renders, aliases included" --project=desktop
```

### P3-218 Console or runtime errors on /protected/transactions?view=not_a_view&session=TEST-2026-27

```
id:         a1d6de558d8a
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?view=not_a_view&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=jOq0YkBdqbuK6Ys1jKsAo' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=jOq0YkBdqbuK6Ys1jKsAo' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "malformed routes and parameters answer without a server error" --project=desktop
```

### P3-219 Console or runtime errors on /protected/transactions?view=receipt_register&session=TEST-2026-27

```
id:         ed87d489a455
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?view=receipt_register&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every transactions view renders, aliases included" --project=desktop
```

### P3-220 Console or runtime errors on /protected/transactions?view=receipts_today&session=TEST-2026-27

```
id:         94d5cd863c99
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?view=receipts_today&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every transactions view renders, aliases included" --project=desktop
```

### P3-221 Console or runtime errors on /protected/transactions?view=receipts&session=TEST-2026-27

```
id:         f082bdabe70f
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?view=receipts&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=0jJEWlMBZyYYD8Y8fwkLC' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=3kKJF6ZgPvpKQmoTC4zWs' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=3kKJF6ZgPvpKQmoTC4zWs' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=0jJEWlMBZyYYD8Y8fwkLC' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=3kKJF6ZgPvpKQmoTC4zWs' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every transactions view renders, aliases included" --project=desktop
```

### P3-222 Console or runtime errors on /protected/transactions?view=statements&session=TEST-2026-27

```
id:         87a9739c55ba
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?view=statements&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every transactions view renders, aliases included" --project=desktop
```

### P3-223 Console or runtime errors on /protected/transactions?view=student_dues&session=TEST-2026-27

```
id:         12fc5e1eb871
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?view=student_dues&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=pW2ffu8YuiyHox_Opq7-j' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=pW2ffu8YuiyHox_Opq7-j' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=pW2ffu8YuiyHox_Opq7-j' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=pW2ffu8YuiyHox_Opq7-j' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every transactions view renders, aliases included" --project=desktop
```

### P3-224 Console or runtime errors on /protected/transactions?view=transactions&session=TEST-2026-27

```
id:         d58b390270a5
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /protected/transactions?view=transactions&session=TEST-2026-27
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Per_IwJsrpXWdsHpxfwor' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
            WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Per_IwJsrpXWdsHpxfwor' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Per_IwJsrpXWdsHpxfwor' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden) / WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=Per_IwJsrpXWdsHpxfwor' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "every transactions view renders, aliases included" --project=desktop
```

### P3-225 Console or runtime errors on /r/%3Cscript%3E

```
id:         1a4a01f2e40d
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /r/%3Cscript%3E
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=nv7a-bNyk1IAS9LSzl9X1' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=nv7a-bNyk1IAS9LSzl9X1' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "public receipt verification refuses junk without touching the database" --project=desktop
```

### P3-226 Console or runtime errors on /r/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

```
id:         0a772e0af0b1
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /r/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=rYP4ef4huOCqMt71k76Qr' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=rYP4ef4huOCqMt71k76Qr' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "public receipt verification refuses junk without touching the database" --project=desktop
```

### P3-227 Console or runtime errors on /r/SVP-NO-SUCH-RECEIPT

```
id:         94c7124c1dfd
rule:       route.console-error  [heuristic]
targets:    local     seen: 1×
surface:    /r/SVP-NO-SUCH-RECEIPT
role:       —        device: desktop        session: TEST-2026-27
expected:   No console errors, page errors, or hydration warnings.
actual:     WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=pxtuO4Ueb4Bbk-8i-2w8N' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
            Failed to load resource: the server responded with a status of 403 (Forbidden)
console:    WebSocket connection to 'ws://127.0.0.1:3000/_next/webpack-hmr?id=pxtuO4Ueb4Bbk-8i-2w8N' failed: Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE / Failed to load resource: the server responded with a status of 403 (Forbidden)
network:    403 http://127.0.0.1:3000/__nextjs_font/geist-latin.woff2
repro:      DEEP_TARGET=local npx playwright test -c tests/deep/deep.config.ts --grep "public receipt verification refuses junk without touching the database" --project=desktop
```

### P3-228 Scenario student graduatedClear was not found in TEST-2026-27

```
id:         2a344c51367d
rule:       ux.observation  [heuristic]
targets:    local-prod     seen: 1×
surface:    payment-case:preview-graduated-clear
role:       —        device: —        session: TEST-2026-27
expected:   docs/qa/smoke-test-data.md lists this student: Nothing owed and no longer on the roll.
actual:     Discovery did not return a student with that admission number.
repro:      DEEP_TARGET=local-prod npx playwright test -c tests/deep/deep.config.ts --grep "previews every allocation"
```

## Write ledger

Nothing was written. (`DEEP_ALLOW_WRITES=1` enables the write suite.)

## MCP conformance

Worker: 1.0.0 · lanes: service, oauth:admin, oauth:accountant, oauth:collector

| Tool | 2026-27 | TEST-2026-27 |
|---|:--:|:--:|
| `describe_capabilities` | ok | ok |
| `list_sessions` | ok | ok |
| `get_system_health` | ok | ok |
| `search_students` | ok | ok |
| `get_student` | ok | ok |
| `query_students` | ok | ok |
| `get_student_financial_history` | ok | ok |
| `get_family` | ok | ok |
| `get_session_money_summary` | ok | ok |
| `get_dashboard_analytics` | ok | ok |
| `get_class_due_summary` | ok | ok |
| `get_installments` | ok | ok |
| `get_fee_structure` | ok | ok |
| `get_ai_analysis_context` | ok | ok |
| `get_recent_payments` | ok | ok |
| `search_receipts` | ok | ok |
| `get_receipt` | ok | ok |
| `get_collection_report` | ok | ok |
| `today_fee_collection_brief` | ok | ok |
| `list_defaulters_for_followup` | ok | ok |
| `get_student_due_status` | ok | ok |
| `get_recovery_queue` | ok | ok |
| `get_promise_due_list` | ok | ok |
| `get_parent_followup_context` | ok | ok |
| `draft_recovery_plan` | ok | ok |
| `prepare_followup_messages` | ok | ok |
| `daily_recovery_digest` | ok | ok |
| `get_left_student_recovery` | ok | ok |
| `get_prev_year_dues` | ok | ok |
| `get_student_photo` | ok | ok |
| `get_defaulter_voice_note` | ok | ok |
| `get_receipt_pdf` | FAIL | FAIL |

| Role | Tools visible | Refused at /authorize |
|---|---:|:--:|
| teacher | 0 | yes |
| viewonly | 0 | yes |
| svc | 32 | no |
| admin | 32 | no |
| accountant | 32 | no |
| collector | 31 | no |

| Figure | MCP | Postgres | Delta |
|---|---:|---:|---:|
| 2026-27 headcount on roll | 507 | 507 | 0 |
| 2026-27 money students | 510 | 510 | 0 |
| 2026-27 expected fees | 13380400 | 13380400 | 0 |
| 2026-27 collected | 2776584 | 2776584 | 0 |
| 2026-27 fees pending | 10612816 | 10612816 | 0 |
| 2026-27 late fee pending | 12000 | 12000 | 0 |
| 2026-27 families with fees pending | 485 | 485 | 0 |
| 2026-27 families with late fee pending | 12 | 12 | 0 |
| TEST-2026-27 headcount on roll | 76 | 76 | 0 |
| TEST-2026-27 money students | 77 | 77 | 0 |
| TEST-2026-27 expected fees | 1628000 | 1628000 | 0 |
| TEST-2026-27 collected | 215181 | 215181 | 0 |
| TEST-2026-27 fees pending | 1422069 | 1422069 | 0 |
| TEST-2026-27 late fee pending | 18250 | 18250 | 0 |
| TEST-2026-27 families with fees pending | 71 | 71 | 0 |
| TEST-2026-27 families with late fee pending | 18 | 18 | 0 |

| Paging tool | Pages | Rows | Duplicates | Gaps |
|---|---:|---:|---:|---:|
| `search_students` | 12 | 77 | 0 | 0 |
| `query_students` | 11 | 77 | 0 | 0 |
| `get_installments` | 41 | 287 | 0 | 0 |
| `get_recent_payments` | 4 | 25 | 0 | 0 |
| `search_receipts` | 8 | 52 | 0 | 0 |

## Timing

445 navigations · p50 1490ms · p95 2975ms · max 34686ms

| Surface | Device | ms |
|---|---|---:|
| /protected/reports?session=TEST-2026-27 | desktop | 34686 |
| /protected/fee-setup/generate?session=TEST-2026-27 | desktop | 16614 |
| /protected/admin-tools/promotion/65b4c425-93bc-4cd8-884b-16bf478d7bed?session=TEST-2026-27 | desktop | 9733 |
| /protected/transactions?view=not_a_view&session=TEST-2026-27 | desktop | 5662 |
| /protected/admin-tools?session=TEST-2026-27 | desktop | 5530 |
| /protected/advanced?session=TEST-2026-27 | desktop | 5203 |
| /protected/dues?session=TEST-2026-27 | desktop | 4910 |
| /protected/students/1402f2e3-232c-4ae8-9e8e-ed8127931440/statement?session=TEST-2026-27 | desktop | 4856 |
| /protected/students?query=')%3B%20--%20O'Brien%20%F0%9F%98%80%20%D8%A7%D8%AE%D8%AA%D8%A8%D8%A7%D8%B1&session=TEST-2026-27 | desktop | 3891 |
| /protected/students?classId=not-a-uuid&session=TEST-2026-27 | desktop | 3818 |

## Environment appendix

The enumerations as the harness saw them, so a future reader can tell "not tested" apart from "did not exist yet".

- **device.viewport** (3): desktop, tablet, mobile
- **negative.input** (27): student-numeric-id, student-junk-id, students-families-stale-link, family-pay-stale-link, receipt-junk-id, promotion-missing-run, dashboard-unknown-view, dashboard-repeated-view, dashboard-unknown-days, transactions-unknown-view, students-unknown-segment, students-junk-classid, students-hostile-query, students-returnto-escape, receipts-returnto-escape, session-unknown-label, session-repeated-param, view-and-session-repeated, session-malformed-year, defaulters-negative-amount, defaulters-overlong-query, finance-controls-bad-date, fee-setup-bad-asof, transactions-inverted-range, verify-overlong-code, verify-illegal-characters, verify-unknown-code
- **param.dashboard-days** (2): 14, 30
- **param.dashboard-view** (5): overview, collection, recovery, classes, latefee
- **param.export-format** (2): xlsx, pdf
- **param.export-type** (11): all-students, student-master, conventional-discount-students, class-wise-dues, defaulters, previous-year-dues, left-student-dues, emi-plans, emi-schedule, receipt-register, ai-context-bundle
- **param.receipt-filter** (11): today, yesterday, week, month, session, custom, newest, amount, reversed=1, closeouts=1, facets=1
- **param.session-resolution** (5): valid-test, unknown-label, malformed-year, empty, absent
- **param.student-segment** (28): oldBalanceDue, overdue, lateFeePending, neverPaid, partlyPaid, yearClear, hasDues, onEmi, emiDue, emiMissed, active, left, leftOwing, graduated, newThisYear, missingPhone, duesNotPrepared, missingDob, duplicateSr, pendingSr, onTransport, hasDiscount, discountRte, discountStaffChild, discountThirdChild, feeException, lateFeeWaived, fullyPaid
- **param.transaction-view** (14): transactions, collection_today, receipts, student_dues, installments, defaulters, class_register, import_issues, exports, receipts_today, statements, dues, all_transactions, receipt_register
- **rbac.guarded-route** (29): /protected/dashboard, /protected/students, /protected/students/new, /protected/students/bulk-update, /protected/fee-setup, /protected/fee-setup/generate, /protected/fee-setup/time-travel, /protected/payments, /protected/payments/bulk, /protected/transactions, /protected/receipts, /protected/ledger, /protected/defaulters, /protected/exports, /protected/reports, /protected/imports, /protected/admin-tools, /protected/admin-tools/activity, /protected/admin-tools/prev-year-dues, /protected/admin-tools/promotion, /protected/admin-tools/recovery, /protected/admin-tools/session-health, /protected/admin-tools/whatsapp-templates, /protected/master-data, /protected/finance-controls, /protected/staff, /protected/settings, /protected/settings/glossary, /protected/password
- **rbac.in-page-gate** (5): payments.posting-enabled-badge, payments.read-only-badge, students.add-button, students.bulk-update, receipts.print
- **rbac.in-page-gate-uncovered** (2): defaulters.contact-log, defaulters.payment-history
- **rbac.role** (5): admin, accountant, teacher, fee_collector, view_only
- **route.dynamic-page** (8): /protected/admin-tools/promotion/[runId], /protected/receipts/[receiptId], /protected/reports/ledger/[studentId]/print, /protected/students/[studentId], /protected/students/[studentId]/edit, /protected/students/[studentId]/statement, /protected/students/family/[familyGroupId]/receipts, /protected/students/family/[familyGroupId]/statement
- **route.family** (14): dashboard, students, studentDetail, feeSetup, payments, transactions, receipts, defaulters, exports, imports, adminTools, financeControls, settings, ledger
- **route.handler** (25): /api/admin/repair-discount-drift, /api/command/receipts, /api/command/students, /api/cron/auto-day-close, /api/cron/nightly-backup, /api/imports/payments/upload, /api/imports/students/upload, /api/manifest, /api/service/documents, /auth/confirm, /protected/defaulters/contact-log, /protected/defaulters/fee-breakdown, /protected/defaulters/voice-note, /protected/finance-controls/export, /protected/imports/template, /protected/payments/bulk/template, /protected/payments/preview, /protected/payments/student-summary, /protected/receipts/search, /protected/reports/export, /protected/students/bulk-update/template, /protected/students/index, /protected/students/photo, /protected/transactions/data, /protected/transactions/export
- **route.legacy-alias** (5): /protected/collections, /protected/dues, /protected/advanced, /protected/setup, /protected/fee-structure
- **route.page** (36): /protected, /protected/access-denied, /protected/admin-tools, /protected/admin-tools/activity, /protected/admin-tools/prev-year-dues, /protected/admin-tools/promotion, /protected/admin-tools/recovery, /protected/admin-tools/session-health, /protected/admin-tools/whatsapp-templates, /protected/advanced, /protected/collections, /protected/dashboard, /protected/defaulters, /protected/dues, /protected/exports, /protected/fee-setup, /protected/fee-setup/generate, /protected/fee-setup/time-travel, /protected/fee-structure, /protected/finance-controls, /protected/imports, /protected/ledger, /protected/master-data, /protected/password, /protected/payments, /protected/payments/bulk, /protected/receipts, /protected/reports, /protected/settings, /protected/settings/glossary, /protected/setup, /protected/staff, /protected/students, /protected/students/bulk-update, /protected/students/new, /protected/transactions
- **write.payment-case** (18): amount-zero, amount-negative, amount-decimal, amount-non-numeric, amount-absurd, preview-back-dated, preview-today, preview-future-dated, preview-late-fee-only, preview-emi-student, preview-in-credit, preview-graduated-clear, post-cash-partial, post-upi, post-bank-transfer, post-cheque, post-idempotent-retry, post-late-fee-only-student


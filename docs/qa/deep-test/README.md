# The deep harness

A permutation sweep over the whole app plus a live conformance suite against the
MCP Worker, with a gate that actually fails.

It exists because the two suites before it did not. `tests/smoke-2026-05` ended
on `expect(coverage.length).toBeGreaterThan(0)` and `special-flows.spec.ts` on
`expect(P0count).toBeGreaterThanOrEqual(0)` — both always true. Findings were
written to JSONL and thrown away, so a P0 could be recorded and shipped in the
same afternoon.

```bash
npm run deep              # local, then production, one merged report
npm run deep:local        # one leg
npm run deep:mcp          # MCP conformance only (read-only, ~2 min)
npm run deep:report       # re-render and re-gate the newest run
npm run deep:footprint    # what past runs left in the test ledger
```

Writes are opt-in and never implicit:

```bash
node tests/deep/run-all.mjs --targets local --writes
```

## What it covers

| Dimension | Domain | How |
|---|---|---|
| Protected pages | globbed off `app/protected/**/page.tsx` | exhaustive |
| Route handlers | globbed off `**/route.ts` | exhaustive, via the API context |
| Dashboard boards | 5 `?view=` + 2 `?days=` | exhaustive |
| Transactions views | 9 + 5 aliases | exhaustive |
| Student segments | 27 + 1 alias, imported from `lib/segments` | exhaustive singly, 4 combos |
| Export types × format | 11 × 2, every file parsed | exhaustive |
| Receipt filters | 6 date modes, 2 sorts, 3 flags | exhaustive singly |
| Roles × guarded routes | 5 × 29 | exhaustive 2-wise |
| In-page permission gates | 6 | only the roles that discriminate |
| Devices × route families | 3 × 14 | 2-wise |
| Malformed input | 25 cases | exhaustive |
| Payment Desk | 18 scenarios by equivalence class | targeted |
| MCP tools × sessions | 32 × 2, plus 6 auth lanes | exhaustive |

**Coverage is a claim the harness has to earn.** Every dimension declares a
strategy in `tests/deep/surface/`, and `assertNoSilentGaps()` fails the run if
one declared exhaustive left a value unvisited. The report opens with what was
*not* tested, before any finding, so a short findings list can never be misread
as "everything passed" when it might mean "very little ran".

## The gate

| Severity | Fails the run? |
|---|---|
| P0 | Always. Any confidence. |
| P1 | When `confidence: deterministic`. Heuristic P1 reports unless `DEEP_STRICT=1`. |
| P2 / P3 | Never on presence — only when the count for a rule exceeds the budget in `tests/deep/baseline/known-findings.json`. |
| Expired waiver | Always, on its own. Nothing is muted forever. |

The P2/P3 count-regression rule is what lets a repo with existing noise adopt a
hard gate today: 41 console errors against a baseline of 38 fails and names only
the 3 new ids.

Severities and confidences live in `tests/deep/lib/rules.mjs` — one table, shared
by the TypeScript recorder inside Playwright and the plain-Node reporter, because
a second copy of a severity table is how a P0 quietly becomes a P2.

## Writes

The write suite posts six ₹100 receipts per run. It is gated four ways, and the
fourth is the one that matters:

1. the student's admission number starts with `TEST-`;
2. the base URL is in an allowlist;
3. the `vpps_view_session` **cookie** says `TEST-2026-27`;
4. the page actually rendered a test session.

Lock 3 exists because `app/protected/layout.tsx` resolves the session from the
cookie only — App Router layouts get no `searchParams` — while the page resolves
`?session=` first. A browser whose cookie says `2026-27` renders a TEST page
inside live chrome, and the desk posts against what the *page* resolved. The old
suite posted on exactly that arrangement and treated the query string as proof.

Nothing is cleaned up afterwards, deliberately: receipts are append-only, a
correction is a `payment_adjustment`, and a test harness that deletes from a
financial table teaches the wrong reflex. Instead the footprint is bounded and
`scripts/verify-deep-test-footprint.mjs` fails when a run exceeds it — a run over
budget means `client_request_id` stopped deduping, which in production is a
family charged twice.

## Where things go

```
docs/qa/deep-test/            committed — no PII
  runs/<runId>.md             the report
  latest.md                   a copy of the newest
  findings.json               merged, machine-readable
  coverage.json               the ledger

docs/smoke-reports/deep/      gitignored
  <runId>/                    JSONL streams, traces, downloads, ALL screenshots
                              — a screenshot here is a picture of a class list,
                              which is why none of them are committed
```

## Prerequisites

- `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` —
  sessions are minted through `/auth/confirm` with a one-time magic-link token,
  so no password is typed, stored or logged.
- `docs/qa/credentials.local.md` (gitignored) or `SMOKE_TEST_STAFF_PASSWORD` for
  the MCP OAuth lanes.
- `SCHOOLFEES_MCP_TOKEN` for the MCP service lane. Without it the admin OAuth
  lane substitutes and only the `/svc/mcp` auth negatives are lost.

The QA logins are created by `node scripts/bootstrap-test-staff.mjs`. The student
scenarios the suite depends on are catalogued in `docs/qa/smoke-test-data.md`.

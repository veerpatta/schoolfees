# The scan

A source-level sweep, an adversarially-verified AI review, and an HTTP fuzzer —
gated by the same severity table as `tests/deep`, streaming into the same
finding shape, waivable in the same way.

```bash
npm run scan               # static only, ~2 min, offline, no API cost
npm run scan:fast          # same, minus the npm-audit check (~15s)
npm run scan:ai            # subsystem reviewers + adversarial refuters
npm run scan:fuzz -- --base-url http://127.0.0.1:3000
npm run scan:all           # all three layers, one report
npm run scan:baseline      # accept today's P2/P3 volume as the budget
```

## Why it exists

`tests/deep` walks the running app, and its own report is honest about the
limit: 1,594 cases against a cross-product of about 211,680. That is not a
smaller half of the problem, it is a different one. A permission missing from
one route handler is invisible to a run that never held that role. A rounding
rule that disagrees with its own database is invisible to any number of page
loads. A secret that would ship to the browser is invisible to a browser.

Source is a surface too, and unlike the running app it is exhaustively
enumerable. So the scan enumerates it — 1,126 modules, 193 migrations, 3 locale
files, every route handler, every server action — and asserts things a sweep
structurally cannot reach.

## The three layers

| Layer | What it does | Cost | Needs |
|---|---|---|---|
| `static` | 11 checks over source, SQL and config | ~2 min | nothing |
| `ai` | 7 subsystem reviewers, then 3 refuters per claim | tokens | `claude` on PATH |
| `fuzz` | 51 payloads × 28 route handlers | ~1 min | a running server |

### static

| Check | Rules it can emit |
|---|---|
| `guards` | `scan.route-unguarded`, `scan.route-unauthorised` |
| `client-boundary` | `scan.service-role-client-reachable`, `scan.secret-in-client-bundle`, `scan.server-client-boundary` |
| `session-safety` | `scan.live-session-hardcoded-write` |
| `money` | `scan.money-split-not-conserving`, `scan.money-round-then-validate`, `scan.money-format-raw`, `scan.rounding-policy-mixed` |
| `async-safety` | `scan.floating-promise`, `scan.error-swallowed` |
| `mirror-drift` | `scan.mirror-drift` |
| `sql-safety` | `scan.sql-risk` |
| `i18n` | `scan.i18n-key-missing` |
| `dead-code` | `scan.dead-export` |
| `config-risk` | `scan.config-risk` |
| `deps` | `scan.dependency-vulnerable` |

Three of these are worth singling out.

**`guards`** knows the difference between *unguarded* and *unauthorised*, and
they are different findings because the fix is different. `proxy.ts` redirects
unauthenticated traffic away from `/protected` only — it does not cover
`/api/**` at all — so a handler there with no helper call is open to anyone with
the URL. A handler that calls `getAuthenticatedStaff()` and stops is open to the
whole staff roll, `view_only` included. It follows one import hop before it
accuses anybody, because the promotion actions delegate their guard to
`lib/promotion/data.ts` and four false positives is how a P0 rule gets muted.

**`mirror-drift`** is the highest-value check here. This codebase writes several
rules twice — once in TypeScript, once in PL/pgSQL — and says so out loud
(`>>> SHARED LATE FEE RULE <<<`, "Edit both or neither"). Migration
`20260812001114` edited one copy and EMI late fees went invisible to every read
surface for four days. The check pins a normalised hash of each side of eight
declared pairs in `baseline/mirrors.json`; a reformat is not a finding, a
changed operator is. Re-pin with `npm run scan:mirrors`.

**`money`** deliberately does not duplicate `scripts/audit-money-formatting.mjs`.
That script owns raw `₹`/`Rs.`/`en-IN` formatting in `app/` and `components/`;
this extends the same idea into `lib/` and `workers/` (which it never scans),
catches `Rs ` without the period its regex requires, and owns everything the
line-regex cannot see: split conservation, round-then-validate ordering, and
rounding-policy divergence.

### ai

Seven subsystem reviewers (fees, payments, session, receipts, rbac,
import-export, mcp), each given its file scope and the CLAUDE.md invariants it
must uphold, verbatim. Each returns at most five claims, and a claim without a
concrete failure scenario is rejected by the prompt before it is written.

Then every claim is attacked. A mechanical pre-check kills any claim whose
`file:line` does not resolve — no model needs to be paid to vouch for a citation
that is not there. What survives goes to three refuters in parallel, each with a
different lens: does the code do what the claim says, is there a guard elsewhere
that already prevents it, is the scenario reachable in how the app is used. Each
is told to default to *refuted* when uncertain. A claim survives on ≥2 of 3.

Survivors are recorded as `ai.defect-confirmed` — **P1 heuristic**, never
deterministic. A model that agrees with itself three times is still a model.
It reports loudly and gates only under `--strict`. The day it earns better,
promote it in `tests/deep/lib/rules.mjs` and nowhere else.

### fuzz

51 payloads at each route handler: empty bodies, non-JSON under a JSON
content-type, 5 MB bodies, prototype pollution, NUL and astral unicode, PostgREST
metacharacters, path traversal, duplicated query params, unsupported methods.

It refuses to run against anything not allowlisted, refuses the live session
label outright, and sends GET and HEAD only unless `--fuzz-writes` is passed —
which itself refuses unless the session carries a `TEST-`, `UAT-` or `DEMO-`
prefix. It mirrors `tests/deep/lib/writes.ts`, because the posture that file
established is the right one and a second, laxer posture in the same repo is how
the first one stops being followed.

A finding is the route, not the payload. Fifty-one payloads that all 500 on one
handler is one bug; the payloads become `variants` on the single finding, which
then reads "reached by 51 inputs, including …".

## The gate

Identical to `tests/deep`, because it *is* `tests/deep/report/gate.mjs`:

| Severity | Fails the run? |
|---|---|
| P0 | Always. |
| P1 | When `deterministic`. Heuristic P1 reports unless `--strict`. |
| P2 / P3 | Never on presence — only when the count for a rule exceeds the budget in `baseline/known-findings.json`. |
| Expired waiver | Always, on its own. |
| A check that threw | Always. Its surface is unscanned, not clean. |

That last row is the one this file adds. A static check that dies on its first
file produces exactly the same silence as one that swept 1,100 files and found
nothing, so the coverage ledger records the death and the report refuses to pass
on it.

Waivers live in `baseline/known-findings.json` and need an owner and an
`expiresOn`. An expired waiver fails the run by itself — nothing here can be
muted forever by being forgotten.

## Where things go

```
docs/qa/scan/                 committed — source paths only, no PII
  runs/<runId>.md             the report
  latest.md                   a copy of the newest
  findings.json               machine-readable
  coverage.json               what was and was not looked at

docs/smoke-reports/scan/      gitignored
  <runId>/                    findings.jsonl, AI transcripts, fuzz request log
```

The AI transcripts and the fuzz request/response log stay in the gitignored
directory. Nothing the static layer writes contains PII — it is source — but a
response body from this app is a class list, so one rule covers the whole run
directory rather than one rule per layer.

## Reading the report

Coverage comes before findings, for the same reason it does in the deep report:
a short findings list is ambiguous. It can mean the code is healthy, or it can
mean two checks threw. The table at the top is what tells those apart.

/**
 * The rule table: what each kind of finding is worth, and whether it can flake.
 *
 * Plain JS on purpose. Two very different consumers need the same table and
 * neither should own a copy: the TypeScript recorder that runs inside Playwright
 * workers, and the plain-Node reporter that applies the gate after the MCP
 * runner has also contributed findings. A second copy of a severity table is
 * how a P0 quietly becomes a P2.
 *
 * `confidence` is the load-bearing column:
 *   deterministic — an assertion. If it fires, something is wrong.
 *   heuristic     — an observation that can legitimately vary between runs
 *                   (render timing, axe on data-dependent pages, console noise).
 * Only deterministic findings gate by default.
 *
 * @typedef {"P0"|"P1"|"P2"|"P3"} Severity
 * @typedef {"deterministic"|"heuristic"} Confidence
 * @typedef {{ severity: Severity, confidence: Confidence }} RulePolicy
 */

/** @type {Record<string, RulePolicy>} */
export const RULES = {
  // ── P0: the run fails, always ──────────────────────────────────────────
  "route.500": { severity: "P0", confidence: "deterministic" },
  "route.framework-overlay": { severity: "P0", confidence: "deterministic" },
  "rbac.guard-missing": { severity: "P0", confidence: "deterministic" },
  "rbac.false-denial": { severity: "P0", confidence: "deterministic" },
  "write.not-persisted": { severity: "P0", confidence: "deterministic" },
  "write.wrong-amount": { severity: "P0", confidence: "deterministic" },
  "write.idempotency-broken": { severity: "P0", confidence: "deterministic" },
  "write.gate-refused": { severity: "P0", confidence: "deterministic" },
  "session.write-crossed-into-live": { severity: "P0", confidence: "deterministic" },
  "mcp.oracle-mismatch": { severity: "P0", confidence: "deterministic" },
  "mcp.tool-visible-without-permission": { severity: "P0", confidence: "deterministic" },
  // A count of 0 where a read failed. Worse than an error, because it is
  // quotable: get_system_health reported "0 students on the roll" for months
  // and the only other student number in that payload counted leavers too.
  "mcp.silent-zero": { severity: "P0", confidence: "deterministic" },
  // A session label that names no ledger, answered with zeros instead of
  // refused — "₹0 collected in 2019-20" reported as fact.
  "mcp.phantom-session": { severity: "P0", confidence: "deterministic" },
  "gate.post-run-invariant-broken": { severity: "P0", confidence: "deterministic" },

  // ── P1: fails when deterministic ───────────────────────────────────────
  // A Server Component that throws is not console noise. It is a server-side
  // failure that production deliberately redacts ("the specific message is
  // omitted…"), so it looks like a warning and reads like a crash. Separated
  // from route.console-error precisely so it cannot hide in the P2 budget.
  "route.server-component-error": { severity: "P1", confidence: "deterministic" },
  "route.hydration-mismatch": { severity: "P2", confidence: "deterministic" },
  "route.404-expected-200": { severity: "P1", confidence: "deterministic" },
  "route.500-on-bad-uuid": { severity: "P1", confidence: "deterministic" },
  "export.invalid-xlsx": { severity: "P1", confidence: "deterministic" },
  "export.missing-link": { severity: "P1", confidence: "deterministic" },
  "alias.no-redirect": { severity: "P1", confidence: "deterministic" },
  "alias.params-dropped": { severity: "P1", confidence: "deterministic" },
  "param.unknown-value-crashes": { severity: "P1", confidence: "deterministic" },
  "mcp.cursor-overlap": { severity: "P1", confidence: "deterministic" },
  "mcp.cursor-gap": { severity: "P1", confidence: "deterministic" },
  "mcp.scope-drift": { severity: "P1", confidence: "deterministic" },
  // A tool whose population changes with a parameter the response never echoes.
  "mcp.scope-not-echoed": { severity: "P1", confidence: "deterministic" },
  // Two tools spelling the same scope rule differently, so a client comparing
  // them sees a difference that is not one.
  "mcp.scope-rule-drift": { severity: "P1", confidence: "deterministic" },
  // A cursor that returns the offset it was given: paging never terminates.
  "mcp.cursor-does-not-advance": { severity: "P1", confidence: "deterministic" },
  // Payload shape discoverable only by calling the tool.
  "mcp.no-output-schema": { severity: "P1", confidence: "deterministic" },
  "mcp.tool-missing-for-role": { severity: "P1", confidence: "deterministic" },
  "mcp.tool-error": { severity: "P1", confidence: "deterministic" },
  "mcp.transport-error": { severity: "P1", confidence: "deterministic" },
  "mcp.auth-not-enforced": { severity: "P0", confidence: "deterministic" },
  "bridge.wrong-content-type": { severity: "P1", confidence: "deterministic" },
  "a11y.serious": { severity: "P1", confidence: "heuristic" },
  "a11y.critical": { severity: "P1", confidence: "heuristic" },
  "waiver.expired": { severity: "P1", confidence: "deterministic" },
  "gate.pre-run-dirty": { severity: "P1", confidence: "deterministic" },

  // ── P2: gates only on count regression against the baseline ────────────
  "route.console-error": { severity: "P2", confidence: "heuristic" },
  "layout.horizontal-overflow": { severity: "P2", confidence: "heuristic" },
  "asset.broken-image": { severity: "P2", confidence: "deterministic" },
  "a11y.button-no-name": { severity: "P2", confidence: "deterministic" },
  "a11y.focus-not-visible": { severity: "P2", confidence: "deterministic" },
  "mcp.cursor-phantom-page": { severity: "P2", confidence: "deterministic" },
  "doc.drift": { severity: "P2", confidence: "deterministic" },

  // ── P3: recorded, reported, never gating on presence ───────────────────
  "perf.slow-render": { severity: "P3", confidence: "heuristic" },
  "ux.observation": { severity: "P3", confidence: "heuristic" },

  /* ── specs 09-10: interaction gates and resilience ────────────────────
   * Two dimensions the sweep above could not reach.
   *
   * Spec 04 asserts the controls a page renders on load. The two gates it
   * declared uncovered live behind a popover and a drawer, so a locator run
   * against a freshly loaded page matched nothing and reported two confident
   * P0s about permissions that were working. Spec 09 drives the interaction
   * instead — and when it cannot, says so as a finding rather than as silence,
   * which is what `harness.gate-unreachable` is for. A gate nobody asserted is
   * not a gate that passed.
   *
   * Spec 10 breaks the network on purpose. Every route in this app is one
   * fetch away from a page that renders nothing: the sweep loads pages on a
   * working connection, so "what does the cashier see when Supabase times out"
   * had no answer anywhere in the harness. A skeleton that never resolves is
   * the single most common shape of a support call. */
  "harness.gate-unreachable": { severity: "P1", confidence: "deterministic" },
  "resilience.no-error-state": { severity: "P1", confidence: "deterministic" },
  "resilience.infinite-skeleton": { severity: "P1", confidence: "deterministic" },
  "resilience.no-loading-state": { severity: "P2", confidence: "heuristic" },
  // One gesture, two identical writes. The Payment Desk dedupes on
  // `client_request_id`; everything else in the app relies on the button
  // disabling itself, which is a race, not a guard.
  "resilience.double-submit-unguarded": { severity: "P1", confidence: "deterministic" },
  // The bug f5ad190 fixed: a filter you set, navigated away from, and came
  // back to was gone. Cheap to regress, invisible to a route sweep that never
  // presses Back.
  "state.filter-not-restored": { severity: "P1", confidence: "deterministic" },

  /* ═══════════════════════════════════════════════════════════════════════
   * tests/scan — the source-level sweep.
   *
   * The dynamic harness above can only find a bug on a path it walked. Half
   * this app's dangerous code is reachable only with a particular role, a
   * particular session and a particular row: a permission check missing from
   * one route handler is invisible to a sweep that never held that role.
   * Source is a surface too, and it is exhaustively enumerable — so the scan
   * rules below gate on the same table, with the same severities, and stream
   * into the same findings.jsonl.
   *
   * Naming: `scan.*` deterministic source facts, `ai.*` model-authored claims
   * that survived an adversarial refutation pass, `fuzz.*` live malformed-input
   * probes. A model claim is never deterministic — see `ai.defect-confirmed`.
   * ══════════════════════════════════════════════════════════════════════ */

  // ── scan P0: money, permissions, or a secret leaving the server ────────
  // A route handler or server action under app/ that neither authenticates
  // nor authorises. proxy.ts redirects unauthenticated traffic away from
  // /protected only — an app/api/** handler with no helper call is open.
  "scan.route-unguarded": { severity: "P0", confidence: "deterministic" },
  // Authenticated but never authorised: any signed-in staff member, including
  // view_only, reaches it. Distinct from unguarded because the fix differs.
  "scan.route-unauthorised": { severity: "P0", confidence: "deterministic" },
  // createAdminClient()/SERVICE_ROLE reachable from a "use client" module, or
  // from a module a client component imports. RLS is bypassed by that key.
  "scan.service-role-client-reachable": { severity: "P0", confidence: "deterministic" },
  // A server-only secret referenced in a file that ships to the browser.
  "scan.secret-in-client-bundle": { severity: "P0", confidence: "deterministic" },
  // A hardcoded live session label on a write path. The whole test protocol
  // rests on writes never naming 2026-27 by hand.
  "scan.live-session-hardcoded-write": { severity: "P0", confidence: "deterministic" },

  // ── scan P1: correctness that does not flake ──────────────────────────
  // money / count without a remainder-preserving splitter: n × round(a/n) ≠ a,
  // so the parts stop summing to the whole and a family is billed the drift.
  "scan.money-split-not-conserving": { severity: "P1", confidence: "deterministic" },
  // Math.round(parsed) upstream of the Number.isInteger() that was supposed to
  // reject it — 1000.6 is written off as 1001 instead of refused.
  "scan.money-round-then-validate": { severity: "P1", confidence: "deterministic" },
  // A TS↔SQL pair the source itself declares must stay byte-identical, whose
  // pinned hash no longer matches. 20260812001114 edited one copy and EMI late
  // fees went invisible to every read surface for four days.
  "scan.mirror-drift": { severity: "P1", confidence: "deterministic" },
  // A promise nobody awaits inside an async function: the error lands in an
  // unhandledRejection, after the response has already been sent.
  "scan.floating-promise": { severity: "P1", confidence: "deterministic" },
  // catch {} / catch (e) {} with an empty body — the failure is now silent.
  "scan.error-swallowed": { severity: "P1", confidence: "deterministic" },
  // A dependency with a known high/critical advisory.
  "scan.dependency-vulnerable": { severity: "P1", confidence: "deterministic" },
  // A `use client` module importing a `server-only` module (or vice versa)
  // — a build-time error waiting for the first route that renders it.
  "scan.server-client-boundary": { severity: "P1", confidence: "deterministic" },

  // ── scan P2: budgeted noise ───────────────────────────────────────────
  // Raw ₹ / Rs / en-IN formatting outside lib/helpers/currency.ts. Extends
  // scripts/audit-money-formatting.mjs into lib/ and workers/, and catches
  // "Rs " without the period that its regex requires.
  "scan.money-format-raw": { severity: "P2", confidence: "deterministic" },
  // Math.trunc in the domain core, Math.round at the edges, for the same
  // quantity. One rounding direction per layer, or neither is the policy.
  "scan.rounding-policy-mixed": { severity: "P2", confidence: "heuristic" },
  // A message key present in one locale file and absent from another: the UI
  // falls back to the key name, in production, in front of a parent.
  "scan.i18n-key-missing": { severity: "P2", confidence: "deterministic" },
  // An exported symbol nothing imports. Dead code that still typechecks is
  // code a future reader will trust.
  "scan.dead-export": { severity: "P2", confidence: "deterministic" },
  // A config value that only bites in production (ignoreBuildErrors, a
  // missing region, an unbounded maxDuration).
  "scan.config-risk": { severity: "P2", confidence: "deterministic" },
  // String-concatenated SQL, or a migration without a matching down/guard.
  "scan.sql-risk": { severity: "P2", confidence: "heuristic" },

  // ── scan P3 ───────────────────────────────────────────────────────────
  "scan.observation": { severity: "P3", confidence: "heuristic" },

  /* ── ai.*: model-authored, adversarially verified ──────────────────────
   * A reviewer agent proposes a defect; independent refuters try to kill it.
   * Only a claim that survives with a concrete failure scenario and a named
   * file:line becomes `ai.defect-confirmed`. Even then it is *heuristic*: a
   * model that agrees with itself three times is still a model. It reports
   * loudly and gates only under DEEP_STRICT=1 — the day it earns better,
   * promote it here and nowhere else. */
  "ai.defect-confirmed": { severity: "P1", confidence: "heuristic" },
  "ai.defect-suspected": { severity: "P2", confidence: "heuristic" },
  "ai.invariant-unenforced": { severity: "P2", confidence: "heuristic" },

  /* ── fuzz.*: live malformed input against a running server ─────────────
   * These are observations of a real response, not of source, so they are
   * deterministic in the sense that matters: the same payload gets the same
   * status twice. */
  "fuzz.route-500": { severity: "P0", confidence: "deterministic" },
  "fuzz.stack-leaked": { severity: "P1", confidence: "deterministic" },
  "fuzz.unhandled-rejection": { severity: "P1", confidence: "deterministic" },
  "fuzz.auth-bypassed": { severity: "P0", confidence: "deterministic" },
  "fuzz.wrong-status": { severity: "P2", confidence: "heuristic" },
  "fuzz.slow-path": { severity: "P3", confidence: "heuristic" },
};

/** @type {Record<Severity, number>} */
export const SEVERITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function isKnownRule(rule) {
  return Object.prototype.hasOwnProperty.call(RULES, rule);
}

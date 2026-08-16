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
};

/** @type {Record<Severity, number>} */
export const SEVERITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function isKnownRule(rule) {
  return Object.prototype.hasOwnProperty.call(RULES, rule);
}

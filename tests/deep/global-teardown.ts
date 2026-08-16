import { writeFileSync } from "node:fs";
import path from "node:path";

import { coverageGaps, coverageLedger, coverageStatement, markPair, markVisited } from "./lib/coverage";
import { POST_GATES, runVerifier, type GateResult } from "./lib/gates";
import { resolveTarget } from "./lib/identity";
import { bulkDir } from "./lib/artifacts";
import { readCoverageEvents, writeFinding } from "./lib/stream";
import { findingId, fingerprintOf } from "./lib/findings";

// Registering the surface modules is what puts the dimensions in the registry.
// Teardown runs in a fresh process from the workers, so the registry starts
// empty and the coverage stream is replayed into it below.
import "./surface/routes";
import "./surface/params";
import "./surface/permissions";
import "./surface/devices";
import "./surface/negatives";
import "./surface/payment-cases";

/**
 * What the run actually covered, and what it broke.
 *
 * Playwright workers are separate processes, so nothing they marked as visited
 * survives into here — the coverage stream is replayed instead. That replay is
 * also the only place `assertNoSilentGaps()` can run with the full picture.
 *
 * The gate itself is deliberately NOT here. The MCP conformance runner
 * contributes findings after Playwright exits, so the verdict is computed once,
 * last, by `tests/deep/report/render.mjs` over the merged stream.
 */

function replayCoverage() {
  for (const event of readCoverageEvents()) {
    try {
      if (event.kind === "visit") markVisited(event.dimension, event.value);
      else markPair(event.dimension, event.a, event.b);
    } catch {
      // A dimension recorded by a spec that teardown does not import would throw.
      // The ledger below reports it as unvisited, which is the honest outcome.
    }
  }
}

export default async function globalTeardown() {
  const target = resolveTarget();
  const runDir = bulkDir();

  replayCoverage();
  const ledger = coverageLedger();
  const gaps = coverageGaps(ledger);

  writeFileSync(
    path.join(runDir, "coverage.json"),
    `${JSON.stringify({ statement: coverageStatement(ledger), gaps, ...ledger }, null, 2)}\n`,
    "utf8",
  );

  const gates: GateResult[] = [];
  for (const spec of POST_GATES) {
    const result = runVerifier(spec.name, spec.args);
    gates.push(result);

    if (!result.ok) {
      const actual = `${result.stdoutTail}\n${result.stderrTail}`.trim() || `exit ${result.exitCode}`;
      const fingerprint = fingerprintOf(actual);
      writeFinding({
        id: findingId("gate.post-run-invariant-broken", spec.name, fingerprint),
        rule: "gate.post-run-invariant-broken",
        severity: "P0",
        confidence: "deterministic",
        target,
        surface: `verifier:${spec.name}`,
        role: null,
        device: null,
        session: process.env.SCHOOLFEES_SMOKE_SESSION ?? "TEST-2026-27",
        title: `Post-run invariant broken: ${spec.name}`,
        expected: spec.note,
        actual,
        fingerprint,
        evidence: { reproCommand: result.command },
        seenCount: 1,
        firstSeenAt: new Date().toISOString(),
      });
    }
  }

  writeFileSync(
    path.join(runDir, "post-gates.json"),
    `${JSON.stringify(gates, null, 2)}\n`,
    "utf8",
  );

  if (gaps.length > 0) {
    // Reported, not thrown: throwing here loses the run's report, and an
    // incomplete run is exactly when the report matters most. The renderer
    // turns this into a failed verdict.
    console.warn(
      "[deep] coverage gaps in dimensions declared exhaustive:\n" +
        gaps.map((gap) => `  ${gap.dimension}: ${gap.missing.join(", ")}`).join("\n"),
    );
  }

  console.log(`[deep] ${coverageStatement(ledger)}`);
  console.log(`[deep] artifacts: ${path.relative(process.cwd(), runDir)}`);
}

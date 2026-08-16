import { RULES } from "../lib/rules.mjs";

/**
 * The verdict.
 *
 * The suite this replaces ended on `expect(coverage.length).toBeGreaterThan(0)`
 * — always true — so a P0 could be written to disk and shipped. The problem
 * with simply reversing that is the opposite failure: a gate that fails on
 * every console warning in a repo that already has forty of them gets switched
 * off within a week.
 *
 * So the policy is graded by what a finding can prove about itself:
 *
 *  - **P0 fails, always.** No confidence caveat; these are assertions about
 *    money, permissions, or a route being down.
 *  - **P1 fails when deterministic.** A missing export link and a cursor that
 *    skips a row do not flake. A heuristic P1 — axe on a data-dependent page —
 *    reports unless DEEP_STRICT=1.
 *  - **P2/P3 never fail on presence. They fail on count regression** against a
 *    committed budget: 41 console errors against a baseline of 38 fails and
 *    names only the 3 new ids. That is what lets a repo with existing noise
 *    turn the gate on today instead of after a cleanup that never happens.
 *  - **An expired waiver fails on its own**, so nothing is muted forever.
 */

export const EMPTY_BASELINE = {
  generatedAt: new Date(0).toISOString(),
  waivers: [],
  noiseBudget: {},
};

export function evaluateGate(findings, baseline = EMPTY_BASELINE, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const strict = options.strict === true;

  const reasons = [];
  const failingIds = [];
  const waivedIds = [];

  const liveWaivers = new Map();
  for (const waiver of baseline.waivers ?? []) {
    if (new Date(waiver.expiresOn).getTime() < now.getTime()) {
      failingIds.push(`waiver:${waiver.id}`);
      reasons.push(
        `Waiver for ${waiver.rule} on ${waiver.surface} expired on ${waiver.expiresOn} ` +
          `(owner: ${waiver.owner}).`,
      );
      continue;
    }
    liveWaivers.set(waiver.id, waiver);
  }

  const seenIds = new Set(findings.map((finding) => finding.id));
  const resolvedWaiverIds = [...liveWaivers.keys()].filter((id) => !seenIds.has(id));

  const countsByRule = new Map();

  for (const finding of findings) {
    countsByRule.set(finding.rule, (countsByRule.get(finding.rule) ?? 0) + 1);
    const waived = liveWaivers.has(finding.id);

    if (finding.severity === "P0") {
      if (waived) {
        waivedIds.push(finding.id);
        continue;
      }
      failingIds.push(finding.id);
      reasons.push(`P0 ${finding.rule} on ${finding.surface} (${finding.target}).`);
      continue;
    }

    if (finding.severity === "P1") {
      if (waived) {
        waivedIds.push(finding.id);
        continue;
      }
      if (finding.confidence === "deterministic" || strict) {
        failingIds.push(finding.id);
        reasons.push(
          `P1 ${finding.rule} on ${finding.surface} (${finding.target}, ${finding.confidence}).`,
        );
      }
      continue;
    }

    if (waived) waivedIds.push(finding.id);
  }

  for (const [rule, count] of countsByRule) {
    const policy = RULES[rule];
    if (!policy || (policy.severity !== "P2" && policy.severity !== "P3")) continue;

    const budget = baseline.noiseBudget?.[rule];
    // No budget recorded yet: the first run establishes it rather than failing.
    if (budget === undefined) continue;

    if (count > budget) {
      const newOnes = findings
        .filter((finding) => finding.rule === rule && !liveWaivers.has(finding.id))
        .slice(budget)
        .map((finding) => finding.id);
      failingIds.push(...newOnes);
      reasons.push(
        `${rule} regressed: ${count} findings against a baseline budget of ${budget}.`,
      );
    }
  }

  return {
    pass: failingIds.length === 0,
    reasons,
    failingIds: [...new Set(failingIds)],
    waivedIds: [...new Set(waivedIds)],
    resolvedWaiverIds,
  };
}

/** What the next baseline should record, given this run's findings. */
export function proposeNoiseBudget(findings) {
  const budget = {};
  for (const finding of findings) {
    const policy = RULES[finding.rule];
    if (!policy) continue;
    if (policy.severity !== "P2" && policy.severity !== "P3") continue;
    budget[finding.rule] = (budget[finding.rule] ?? 0) + 1;
  }
  return budget;
}

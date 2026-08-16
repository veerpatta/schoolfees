import { createHash } from "node:crypto";

import { RULES, SEVERITY_ORDER } from "./rules.mjs";
import type { DeepTarget, SmokeRoleKey } from "./identity";

/**
 * What the harness found.
 *
 * The suite this replaces recorded findings to JSONL and then ended on
 * `expect(coverage.length).toBeGreaterThan(0)` — always true. A P0 could be
 * written to disk and shipped. This module and `report/render.mjs` exist so
 * that stops being possible without making the harness fail on its own noise:
 *
 *  - `fingerprint` is the normalised `actual`, so 145 RBAC visits that all hit
 *    the same console error dedupe to one finding rather than 145.
 *  - `confidence` (from `rules.mjs`) separates an assertion from an
 *    observation. A missing export link does not flake; a cold-lambda render
 *    time does.
 *  - `target` travels with the finding, because a `next dev` strict-mode
 *    warning and a production console error are not the same fact.
 *
 * The severity table lives in `rules.mjs` rather than here so the plain-Node
 * reporter and this TypeScript recorder cannot disagree about what a P0 is.
 */

export type Severity = "P0" | "P1" | "P2" | "P3";
export type Confidence = "deterministic" | "heuristic";
export type RuleId = keyof typeof RULES & string;

export { RULES };

export type FindingEvidence = {
  screenshot?: string;
  trace?: string;
  consoleTail?: string[];
  networkTail?: string[];
  request?: { method: string; url: string; status: number };
  /** The exact command that re-runs only this case. Non-negotiable. */
  reproCommand?: string;
};

export type Finding = {
  id: string;
  rule: string;
  severity: Severity;
  confidence: Confidence;
  target: DeepTarget | string;
  surface: string;
  role: SmokeRoleKey | "service" | null;
  device: string | null;
  session: string;
  title: string;
  expected: string;
  actual: string;
  fingerprint: string;
  evidence: FindingEvidence;
  suspectedFile?: string;
  seenCount: number;
  firstSeenAt: string;
};

export type RecordInput = {
  rule: RuleId;
  surface: string;
  title: string;
  expected: string;
  actual: string;
  target: DeepTarget | string;
  session: string;
  role?: SmokeRoleKey | "service" | null;
  device?: string | null;
  evidence?: FindingEvidence;
  suspectedFile?: string;
  /** Overrides the rule's default severity. Used only to downgrade dev noise. */
  severity?: Severity;
};

/**
 * Strip everything that varies between two runs of the same bug.
 *
 * Without this, every RBAC visit produces a "unique" console finding because
 * the message carries a request id, and the report becomes 145 rows of one
 * problem.
 */
export function fingerprintOf(actual: string): string {
  return actual
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "<timestamp>")
    .replace(/\d{4}-\d{2}-\d{2}/g, "<date>")
    .replace(/\b\d+\s?ms\b/gi, "<ms>")
    .replace(/₹\s?[\d,]+(?:\.\d+)?/g, "<money>")
    .replace(/\b\d{10,}\b/g, "<digits>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

export function findingId(rule: string, surface: string, fingerprint: string): string {
  return createHash("sha1")
    .update(`${rule}|${surface}|${fingerprint}`)
    .digest("hex")
    .slice(0, 12);
}

export class FindingSink {
  private readonly byId = new Map<string, Finding>();

  record(input: RecordInput): Finding {
    const policy = RULES[input.rule];
    if (!policy) throw new Error(`Unknown finding rule "${input.rule}".`);

    const fingerprint = fingerprintOf(input.actual);
    const id = findingId(input.rule, input.surface, fingerprint);
    const existing = this.byId.get(id);

    if (existing) {
      existing.seenCount += 1;
      // Keep the first screenshot; later ones are the same bug.
      return existing;
    }

    const finding: Finding = {
      id,
      rule: input.rule,
      severity: (input.severity ?? policy.severity) as Severity,
      confidence: policy.confidence as Confidence,
      target: input.target,
      surface: input.surface,
      role: input.role ?? null,
      device: input.device ?? null,
      session: input.session,
      title: input.title,
      expected: input.expected,
      actual: input.actual.slice(0, 2000),
      fingerprint,
      evidence: input.evidence ?? {},
      suspectedFile: input.suspectedFile,
      seenCount: 1,
      firstSeenAt: new Date().toISOString(),
    };

    this.byId.set(id, finding);
    return finding;
  }

  all(): Finding[] {
    return [...this.byId.values()].sort((a, b) => {
      const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (bySeverity !== 0) return bySeverity;
      if (a.confidence !== b.confidence) return a.confidence === "deterministic" ? -1 : 1;
      if (a.seenCount !== b.seenCount) return b.seenCount - a.seenCount;
      return a.surface.localeCompare(b.surface);
    });
  }

  countsBySeverity(): Record<Severity, number> {
    const counts: Record<Severity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    for (const finding of this.byId.values()) counts[finding.severity] += 1;
    return counts;
  }

  get size(): number {
    return this.byId.size;
  }
}

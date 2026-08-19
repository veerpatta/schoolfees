/**
 * Recording a finding, in the one shape this repo already understands.
 *
 * `tests/deep/lib/findings.ts` defines that shape for the Playwright harness.
 * This is the plain-Node twin: same fields, same fingerprinting, same id
 * derivation, streaming to the same `findings.jsonl` — so `tests/deep/report/
 * render.mjs` can render a static finding and a browser finding in one
 * document, and `gate.mjs` can fail on either without knowing which is which.
 *
 * The id is `sha1(rule|surface|fingerprint)`, exactly as the TypeScript sink
 * derives it, which is what lets a scan finding be *waived* in
 * `tests/deep/baseline/known-findings.json` like any other. A second waiver
 * mechanism for static findings would have been a second place to forget.
 *
 * One difference, deliberate: `surface` for a scan finding is `file:line`.
 * That is the string a person needs, it is stable across runs in a way a URL
 * with a session id is not, and it makes `repro` honest — the repro command
 * for a static finding is opening the file.
 */

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { RULES, SEVERITY_ORDER } from "../../deep/lib/rules.mjs";

/**
 * How many distinct inputs a single finding lists before it stops counting.
 *
 * Twelve is enough to see the shape of what reaches the defect — "every JSON
 * payload" reads differently from "only the two with a NUL byte" — and short
 * enough that the finding stays one screen.
 */
const VARIANT_LIMIT = 12;

/** Identical to `fingerprintOf` in tests/deep/lib/findings.ts. Keep them equal. */
export function fingerprintOf(actual) {
  return String(actual)
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

export function findingId(rule, surface, fingerprint) {
  return createHash("sha1").update(`${rule}|${surface}|${fingerprint}`).digest("hex").slice(0, 12);
}

export class ScanSink {
  /**
   * @param {object} options
   * @param {string|null} options.runDir where findings.jsonl is appended, or
   *                                     null to collect in memory only — which
   *                                     is what the unit tests and a dry run
   *                                     want, and what a check being exercised
   *                                     on a synthetic fixture must have
   * @param {string} [options.target]    "static" | "ai" | "fuzz" — travels with
   *                                     the finding so the report can say which
   *                                     layer found it
   */
  constructor({ runDir, target = "static" }) {
    this.runDir = runDir;
    this.target = target;
    this.byId = new Map();
    if (runDir) mkdirSync(runDir, { recursive: true });
    this.streamPath = runDir ? path.join(runDir, "findings.jsonl") : null;
  }

  /**
   * @param {object} input
   * @param {string} input.rule       must exist in tests/deep/lib/rules.mjs
   * @param {string} input.file       repo-relative path
   * @param {number} [input.line]     1-based
   * @param {string} input.title      one line, imperative-free, reads as a fact
   * @param {string} input.expected   what should have been true
   * @param {string} input.actual     what is true — this is what fingerprints
   * @param {string} [input.evidence] the offending source line, verbatim
   * @param {string} [input.why]      why it matters, in this codebase
   * @param {string} [input.fix]      the smallest change that resolves it
   * @param {string} [input.variant]  the distinct input that reached this
   *                                  defect. Repeats collapse onto one finding
   *                                  and collect here — see the note in the
   *                                  duplicate branch below
   * @param {string} [input.target]   overrides the sink's layer for one finding
   * @param {string} [input.severity] overrides the rule's default. Downgrades
   *                                  only; a rule that needs a higher severity
   *                                  needs a different rule
   * @param {string} [input.reproCommand] overrides the default repro line
   */
  record(input) {
    const policy = RULES[input.rule];
    if (!policy) throw new Error(`Unknown finding rule "${input.rule}".`);

    const surface = input.line ? `${input.file}:${input.line}` : input.file;
    const fingerprint = fingerprintOf(input.actual);
    const id = findingId(input.rule, surface, fingerprint);

    const existing = this.byId.get(id);
    if (existing) {
      existing.seenCount += 1;
      // The same defect reached by a different input. The fuzz layer sends 51
      // payloads at each of 28 targets; without this, one broken handler
      // becomes fifty-one "findings" and the report is useless at exactly the
      // moment it matters. The bug is the route, not the payload — so the
      // payload becomes a variant, and the finding stays one row that says
      // which inputs reach it.
      if (input.variant && !existing.variants.includes(input.variant)) {
        if (existing.variants.length < VARIANT_LIMIT) existing.variants.push(input.variant);
        else existing.variantsTruncated = true;
      }
      return existing;
    }

    const finding = {
      id,
      rule: input.rule,
      severity: input.severity ?? policy.severity,
      confidence: policy.confidence,
      target: input.target ?? this.target,
      surface,
      role: null,
      device: null,
      session: "n/a",
      title: input.title,
      expected: input.expected,
      actual: String(input.actual).slice(0, 2000),
      fingerprint,
      evidence: {
        // The offending line, so the report is readable without the repo open.
        consoleTail: input.evidence ? [String(input.evidence).trim().slice(0, 300)] : undefined,
        reproCommand:
          input.reproCommand
          ?? `npm run scan -- --only ${input.rule} --file ${input.file}`,
      },
      suspectedFile: input.file,
      why: input.why,
      fix: input.fix,
      /** The distinct inputs that reach this one defect. See `record`. */
      variants: input.variant ? [input.variant] : [],
      variantsTruncated: false,
      seenCount: 1,
      firstSeenAt: new Date().toISOString(),
    };

    this.byId.set(id, finding);
    if (this.streamPath) appendFileSync(this.streamPath, `${JSON.stringify(finding)}\n`, "utf8");
    return finding;
  }

  all() {
    return [...this.byId.values()].sort((a, b) => {
      const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (bySeverity !== 0) return bySeverity;
      if (a.confidence !== b.confidence) return a.confidence === "deterministic" ? -1 : 1;
      return a.surface.localeCompare(b.surface);
    });
  }

  counts() {
    const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
    for (const finding of this.byId.values()) counts[finding.severity] += 1;
    return counts;
  }

  get size() {
    return this.byId.size;
  }
}

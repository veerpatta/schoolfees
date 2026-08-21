/**
 * The coverage ledger — the harness's honesty mechanism.
 *
 * "All permutations and combinations" of this app is 5 roles x 43 pages x 27
 * segments x 14 transaction views x 3 devices, about 244,000 page loads. No
 * suite runs that. The risk is not that a harness covers a subset; it is that
 * it covers a subset and the report reads as if it covered everything.
 *
 * So every dimension declares its own strategy up front, and:
 *
 *  - a dimension declared `exhaustive-single-factor` FAILS the run if any value
 *    in its domain went unvisited — which is what stops a stale hand-copied
 *    list from silently shrinking coverage when the app grows a 28th segment;
 *  - a dimension declared `declared-uncovered` is printed in the report, by
 *    name, under "What this run did not test", before any finding.
 *
 * Domains are imported from application source wherever one exists
 * (`SEGMENT_IDS` from `src/modules/students/domain/student-segments.ts`, pages globbed off
 * `src/app/protected/**` + "/page.tsx"), never re-typed here.
 */

export type CoverageStrategy =
  | "exhaustive-single-factor"
  | "exhaustive-pairwise"
  | "targeted-scenarios"
  | "declared-uncovered";

export type DimensionSpec = {
  id: string;
  /** Human sentence for the report. */
  label: string;
  domain: readonly string[];
  strategy: CoverageStrategy;
  /** Dimension ids this one is combined with. Empty declares the hole. */
  pairedWith?: readonly string[];
  /** Why a dimension is not covered — required for `declared-uncovered`. */
  note?: string;
};

export type DimensionLedger = {
  id: string;
  label: string;
  strategy: CoverageStrategy;
  domainSize: number;
  visited: string[];
  notVisited: string[];
  pairsCovered: string[];
  pairedWith: string[];
  note?: string;
};

export type CoverageLedger = {
  dimensions: DimensionLedger[];
  /** Product of every registered domain — the cartesian the report cites. */
  cartesianSize: number;
  casesExecuted: number;
};

const registry = new Map<string, DimensionSpec>();
const visits = new Map<string, Set<string>>();
const pairs = new Map<string, Set<string>>();
let casesExecuted = 0;

export function registerDimension(spec: DimensionSpec): DimensionSpec {
  if (spec.strategy === "declared-uncovered" && !spec.note) {
    throw new Error(
      `Dimension "${spec.id}" is declared uncovered but gives no reason. ` +
        "An unexplained gap in the report is worse than no report.",
    );
  }
  registry.set(spec.id, spec);
  if (!visits.has(spec.id)) visits.set(spec.id, new Set());
  if (!pairs.has(spec.id)) pairs.set(spec.id, new Set());
  return spec;
}

export function registerDimensions(specs: readonly DimensionSpec[]): void {
  for (const spec of specs) registerDimension(spec);
}

/** Record that a value in a dimension's domain was actually exercised. */
export function markVisited(dimensionId: string, value: string): void {
  const spec = registry.get(dimensionId);
  if (!spec) {
    throw new Error(
      `markVisited("${dimensionId}") — no such dimension. Register it in tests/deep/surface/ first.`,
    );
  }
  visits.get(dimensionId)!.add(value);
  casesExecuted += 1;
}

/**
 * Record a 2-wise combination, e.g. role x route.
 *
 * Also marks whichever half belongs to this dimension's own domain as visited.
 * Without that the ledger printed all 29 guarded routes as "not visited" on a
 * run that had just checked every one of them against all five roles — a table
 * that undersells the run is as misleading as one that oversells it.
 */
export function markPair(dimensionId: string, a: string, b: string): void {
  const spec = registry.get(dimensionId);
  if (!spec) {
    throw new Error(`markPair("${dimensionId}") — no such dimension.`);
  }
  pairs.get(dimensionId)!.add(`${a} × ${b}`);

  const seen = visits.get(dimensionId)!;
  for (const half of [a, b]) {
    if (spec.domain.includes(half)) seen.add(half);
  }

  casesExecuted += 1;
}

export function resetCoverage(): void {
  visits.clear();
  pairs.clear();
  casesExecuted = 0;
  for (const id of registry.keys()) {
    visits.set(id, new Set());
    pairs.set(id, new Set());
  }
}

/**
 * The dimensions the "how much of the whole space" figure is computed over.
 *
 * Multiplying all thirteen domains gives 2.8 x 10^19, which is arithmetically
 * true and rhetorically useless — a number that large reads as a joke and the
 * reader stops trusting the rest of the ledger. These five are the ones a case
 * could genuinely cross: a role, on a page, with a segment filter, on a
 * transactions view, at a viewport. The report names them, so the percentage
 * is a claim someone can check rather than a flourish.
 */
const CARTESIAN_DIMENSIONS = [
  "rbac.role",
  "route.page",
  "param.student-segment",
  "param.transaction-view",
  "device.viewport",
] as const;

export function coverageLedger(): CoverageLedger {
  const dimensions: DimensionLedger[] = [];
  let cartesianSize = 1;

  for (const spec of registry.values()) {
    const seen = visits.get(spec.id) ?? new Set<string>();
    const domain = [...spec.domain];
    if (
      domain.length > 0 &&
      (CARTESIAN_DIMENSIONS as readonly string[]).includes(spec.id)
    ) {
      cartesianSize *= domain.length;
    }

    dimensions.push({
      id: spec.id,
      label: spec.label,
      strategy: spec.strategy,
      domainSize: domain.length,
      visited: domain.filter((value) => seen.has(value)),
      notVisited: domain.filter((value) => !seen.has(value)),
      pairsCovered: [...(pairs.get(spec.id) ?? [])].sort(),
      pairedWith: [...(spec.pairedWith ?? [])],
      note: spec.note,
    });
  }

  return {
    dimensions: dimensions.sort((a, b) => a.id.localeCompare(b.id)),
    cartesianSize,
    casesExecuted,
  };
}

export type CoverageGap = { dimension: string; missing: string[] };

/**
 * The claim a dimension has to earn.
 *
 * If `SEGMENT_IDS` grows to 28 and a spec loops over a stale copy of 27, this
 * is what turns that into a failed run rather than a report that quietly says
 * "exhaustive".
 */
export function coverageGaps(ledger: CoverageLedger = coverageLedger()): CoverageGap[] {
  return ledger.dimensions
    .filter(
      (dimension) =>
        dimension.strategy === "exhaustive-single-factor" && dimension.notVisited.length > 0,
    )
    .map((dimension) => ({ dimension: dimension.id, missing: dimension.notVisited }));
}

export function assertNoSilentGaps(ledger: CoverageLedger = coverageLedger()): void {
  const gaps = coverageGaps(ledger);
  if (gaps.length === 0) return;

  const detail = gaps
    .map((gap) => `  ${gap.dimension}: ${gap.missing.join(", ")}`)
    .join("\n");

  throw new Error(
    "Dimensions declared exhaustive left values unvisited. Either the run was " +
      "cut short, or the app grew a value the harness does not know about:\n" +
      detail,
  );
}

/** The one-line honesty statement the report opens with. */
export function coverageStatement(ledger: CoverageLedger = coverageLedger()): string {
  const exhaustive = ledger.dimensions.filter(
    (dimension) => dimension.strategy === "exhaustive-single-factor",
  ).length;
  const pairwise = ledger.dimensions.filter(
    (dimension) => dimension.strategy === "exhaustive-pairwise",
  ).length;
  const uncovered = ledger.dimensions.filter(
    (dimension) => dimension.strategy === "declared-uncovered",
  );

  const percent = ledger.cartesianSize
    ? ((ledger.casesExecuted / ledger.cartesianSize) * 100).toFixed(3)
    : "0";

  return (
    `This run executed ${ledger.casesExecuted.toLocaleString("en-IN")} cases against a ` +
    `full cross-product of about ${ledger.cartesianSize.toLocaleString("en-IN")} ` +
    `(role × page × segment × transactions view × viewport) — ${percent}%. ` +
    `Single-factor coverage is complete for ${exhaustive} dimensions; ` +
    `${pairwise} dimensions are covered 2-wise. ` +
    (uncovered.length
      ? `Declared uncovered: ${uncovered.map((dimension) => dimension.label).join("; ")}.`
      : "Nothing is declared uncovered.")
  );
}

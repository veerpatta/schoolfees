import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RULES } from "../deep/lib/rules.mjs";
import { EMPTY_BASELINE, evaluateGate } from "../deep/report/gate.mjs";
import { ScanSink, fingerprintOf, findingId } from "../scan/lib/sink.mjs";
import { ScanCoverage } from "../scan/lib/coverage.mjs";
import { createProject } from "../scan/lib/project.mjs";
import * as guards from "../scan/checks/guards.mjs";
import { CHECKS } from "../scan/checks/index.mjs";

/**
 * The scanner's own tests.
 *
 * A bug-finding tool that is quietly broken is worse than no tool: it reports
 * zero findings and the zero reads as health. Three things are asserted here
 * that would otherwise be invisible.
 *
 *   1. The sink derives ids the same way `tests/deep/lib/findings.ts` does. If
 *      it did not, a scan finding could never be waived in the shared baseline
 *      and nobody would notice until they tried.
 *   2. Every check registers rules that exist. A typo in a rule id throws at
 *      record time — which means it throws on the first repository that
 *      actually has that defect, not on any repository that does not.
 *   3. The guard check fires on a genuinely unguarded route. It reports zero
 *      against this repo today, and zero is only good news if the detector
 *      works.
 */

const REPO_ROOT = path.resolve(__dirname, "../..");

describe("the scan sink speaks the deep harness's finding shape", () => {
  it("derives ids exactly as tests/deep/lib/findings.ts does", () => {
    // Same inputs, same algorithm — this is what lets one waiver list cover
    // both harnesses.
    const fingerprint = fingerprintOf("route answered 500 at 2026-08-19T10:00:00Z");
    expect(fingerprint).toContain("<timestamp>");
    expect(findingId("scan.route-unguarded", "src/app/api/x/route.ts:1", fingerprint)).toHaveLength(12);
  });

  it("normalises away everything that varies between two runs of one bug", () => {
    const a = fingerprintOf("student 3f2b8c4d-1a2b-3c4d-5e6f-708192a3b4c5 owes ₹12,500 (412ms)");
    const b = fingerprintOf("student 9911aabb-ccdd-eeff-0011-223344556677 owes ₹9,000 (17ms)");
    expect(a).toBe(b);
  });

  it("collapses repeats into one finding and keeps the inputs that reach it", () => {
    const sink = new ScanSink({ runDir: null, target: "fuzz" });
    for (const variant of ["empty-body", "nul-byte", "5mb-body"]) {
      sink.record({
        rule: "fuzz.route-500",
        file: "src/app/api/imports/students/upload/route.ts",
        line: 10,
        title: "answers 500",
        expected: "400",
        actual: "POST /api/imports/students/upload → 500.",
        variant,
      });
    }

    expect(sink.size).toBe(1);
    const [finding] = sink.all();
    expect(finding.seenCount).toBe(3);
    expect(finding.variants).toEqual(["empty-body", "nul-byte", "5mb-body"]);
  });

  it("refuses a rule that is not in the shared severity table", () => {
    const sink = new ScanSink({ runDir: null });
    expect(() =>
      sink.record({
        rule: "scan.route-unguardedd",
        file: "a.ts",
        title: "t",
        expected: "e",
        actual: "a",
      }),
    ).toThrow(/Unknown finding rule/);
  });
});

describe("every check emits a rule that exists", () => {
  it("registers an id and a title", () => {
    for (const check of CHECKS) {
      expect(typeof check.id, `${check.id} has no id`).toBe("string");
      expect(typeof check.title, `${check.id} has no title`).toBe("string");
      expect(typeof check.run, `${check.id} has no run`).toBe("function");
    }
  });

  it("names only rules the table knows", async () => {
    // Source-text assertion on purpose: a check can only emit a rule it names,
    // and naming one the table lacks is a runtime throw on the day the defect
    // first appears. Catching it here costs nothing.
    const { readFileSync, readdirSync } = await import("node:fs");
    const dir = path.join(REPO_ROOT, "tests/scan");
    const files: string[] = [];
    const walk = (at: string) => {
      for (const entry of readdirSync(at, { withFileTypes: true })) {
        const full = path.join(at, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".mjs")) files.push(full);
      }
    };
    walk(dir);

    const named = new Set<string>();
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/rule:\s*["'`]([a-z][a-z0-9.-]+)["'`]/g)) {
        named.add(match[1]);
      }
    }

    expect(named.size).toBeGreaterThan(10);
    const unknown = [...named].filter((rule) => !Object.hasOwn(RULES, rule));
    expect(unknown, `rules named in tests/scan but missing from rules.mjs`).toEqual([]);
  });
});

describe("the guard check actually detects an unguarded route", () => {
  it("fires on a handler with no auth and no permission, and stays quiet on a guarded one", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "scan-guards-"));
    try {
      mkdirSync(path.join(root, "src/app/api/open"), { recursive: true });
      mkdirSync(path.join(root, "src/app/api/closed"), { recursive: true });
      writeFileSync(
        path.join(root, "src/app/api/open/route.ts"),
        [
          'import { createClient } from "@/platform/supabase/server";',
          "export async function GET() {",
          "  const supabase = await createClient();",
          '  const { data } = await supabase.from("students").select("*");',
          "  return Response.json(data);",
          "}",
        ].join("\n"),
        "utf8",
      );
      writeFileSync(
        path.join(root, "src/app/api/closed/route.ts"),
        [
          'import { requireStaffPermission } from "@/platform/supabase/session";',
          "export async function GET() {",
          '  await requireStaffPermission("students:view");',
          "  return Response.json({ ok: true });",
          "}",
        ].join("\n"),
        "utf8",
      );

      const project = await createProject(root);
      const sink = new ScanSink({ runDir: null });
      const coverage = new ScanCoverage();
      await guards.run({ project, sink, coverage });

      const surfaces = sink.all().map((finding) => finding.surface);
      expect(surfaces).toContain("src/app/api/open/route.ts:1");
      expect(surfaces.some((surface) => surface.startsWith("src/app/api/closed"))).toBe(false);
      expect(sink.all()[0].severity).toBe("P0");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports nothing against this repository, because every surface is guarded", async () => {
    const project = await createProject(REPO_ROOT);
    const sink = new ScanSink({ runDir: null });
    const coverage = new ScanCoverage();
    await guards.run({ project, sink, coverage });

    // If this ever fails, read the finding before touching the allowlist: a new
    // public route is a decision, and PUBLIC_BY_DESIGN is where the decision
    // gets written down.
    expect(sink.all().map((finding) => `${finding.rule} ${finding.surface}`)).toEqual([]);
    expect(coverage.entries[0].domainSize).toBeGreaterThan(100);
    expect(coverage.entries[0].examined).toBe(coverage.entries[0].domainSize);
  });
});

describe("a check that throws cannot pass the gate", () => {
  it("records the death rather than dropping the check", () => {
    const coverage = new ScanCoverage();
    coverage.errored("money", new Error("boom"));
    expect(coverage.hasErrors()).toBe(true);
    expect(coverage.statement()).toContain("threw and contributed nothing");
  });

  it("still fails the run when the findings list is empty", async () => {
    // The dangerous case: no findings AND a broken check. Without the errored
    // rows the report would read PASS, which is the exact lie the ledger is
    // for. `renderScanReport` is what enforces it; this pins the two halves.
    const { renderScanReport } = await import("../scan/lib/report.mjs");
    const coverage = new ScanCoverage();
    coverage.errored("money", new Error("boom"));

    const report = renderScanReport({
      runId: "test",
      manifest: {
        layers: ["static"],
        git: { sha: "0".repeat(40), branch: "main", dirty: false },
        node: process.version,
        fileCount: 0,
        startedAt: new Date(0).toISOString(),
        durationMs: 0,
      },
      findings: [],
      coverage: coverage.toJSON(),
      baseline: { ...EMPTY_BASELINE, waivers: [], noiseBudget: {} },
      strict: false,
    });

    expect(report.findings).toHaveLength(0);
    expect(report.verdict.pass).toBe(false);
    expect(report.markdown).toContain("**FAIL**");
  });

  it("keeps the shared gate policy: P0 always, deterministic P1, P2 on budget", () => {
    const p0 = { id: "a", rule: "scan.route-unguarded", severity: "P0", confidence: "deterministic", surface: "x", target: "static" };
    const p1heuristic = { id: "b", rule: "ai.defect-confirmed", severity: "P1", confidence: "heuristic", surface: "y", target: "ai" };
    const p2 = { id: "c", rule: "scan.dead-export", severity: "P2", confidence: "deterministic", surface: "z", target: "static" };

    expect(evaluateGate([p0], { ...EMPTY_BASELINE, waivers: [], noiseBudget: {} }).pass).toBe(false);
    expect(evaluateGate([p1heuristic], { ...EMPTY_BASELINE, waivers: [], noiseBudget: {} }).pass).toBe(true);
    expect(evaluateGate([p1heuristic], { ...EMPTY_BASELINE, waivers: [], noiseBudget: {} }, { strict: true }).pass).toBe(false);
    expect(evaluateGate([p2], { ...EMPTY_BASELINE, waivers: [], noiseBudget: { "scan.dead-export": 1 } }).pass).toBe(true);
    expect(evaluateGate([p2], { ...EMPTY_BASELINE, waivers: [], noiseBudget: { "scan.dead-export": 0 } }).pass).toBe(false);
  });
});

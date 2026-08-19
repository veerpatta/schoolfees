#!/usr/bin/env node
/**
 * The scan: one command, three layers, one verdict.
 *
 * `tests/deep` walks the running app. It can only find a bug on a path it
 * actually walked, and its own report says so — 1,594 cases against a cross
 * product of about 211,680. The half of this app that a sweep cannot reach is
 * not a smaller half: a permission missing from one route handler is invisible
 * to a run that never held that role, and a rounding rule that disagrees with
 * its own database is invisible to any number of page loads.
 *
 * Source is a surface too, and unlike the running app it is exhaustively
 * enumerable. So:
 *
 *   static — 11 checks over 1,100 modules, 193 migrations and 3 locale files.
 *            Deterministic, offline, ~1 minute, no API cost.
 *   ai     — subsystem reviewers that read the code the way a person would,
 *            then adversarial refuters that try to kill each claim. Anything
 *            that survives is recorded as heuristic, because a model agreeing
 *            with itself three times is still a model.
 *   fuzz   — malformed payloads against a running server. Needs a base URL.
 *
 * All three stream into one `findings.jsonl` in the shape
 * `tests/deep/lib/findings.ts` defines, are gated by the same
 * `tests/deep/report/gate.mjs`, and can be waived in the same way. There is
 * one severity table in this repo and it lives in `tests/deep/lib/rules.mjs`.
 *
 *   npm run scan                      # static only
 *   npm run scan -- --layers static,ai
 *   npm run scan -- --layers fuzz --base-url http://localhost:3000
 *   npm run scan -- --only guards,money
 *   npm run scan -- --write-baseline  # accept today's P2/P3 volume as the budget
 *   npm run scan -- --strict          # heuristic P1 gates too
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createProject } from "./lib/project.mjs";
import { ScanSink } from "./lib/sink.mjs";
import { ScanCoverage } from "./lib/coverage.mjs";
import { loadBaseline, writeBaseline, renderScanReport } from "./lib/report.mjs";
import { selectChecks } from "./checks/index.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")
    ? args[index + 1]
    : fallback;
};
const list = (name) =>
  (value(name, "") || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const root = process.cwd();
const layers = list("layers").length > 0 ? list("layers") : ["static"];
const only = list("only");
const skip = new Set(list("skip"));
const strict = flag("strict") || process.env.SCAN_STRICT === "1";
const shouldWriteBaseline = flag("write-baseline");
const baseURL = value("base-url", process.env.SCAN_BASE_URL ?? "");

/** Run ids sort lexicographically into chronological order, like tests/deep. */
function mintRunId() {
  return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
}
const runId = process.env.SCAN_RUN_ID ?? mintRunId();

/**
 * The run directory is gitignored, like the deep harness's.
 *
 * Nothing the static layer writes contains PII — it is source, not screenshots
 * — but the fuzz layer records response bodies, and a response body from this
 * app is a class list. One rule for the whole run directory is easier to keep
 * than a rule per layer.
 */
const runDir = path.join(root, "docs/smoke-reports/scan", runId);
const committedDir = path.join(root, "docs/qa/scan");
mkdirSync(runDir, { recursive: true });
mkdirSync(path.join(committedDir, "runs"), { recursive: true });

function git(command) {
  try {
    return execFileSync("git", command, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const startedAt = new Date();
const started = performance.now();

console.log(`\n── scan ${runId} · layers: ${layers.join(", ")} ──\n`);

const project = await createProject(root);
const coverage = new ScanCoverage();
const findings = [];

/* ─────────────────────────────────────────────────────────── static layer */

if (layers.includes("static")) {
  const sink = new ScanSink({ runDir, target: "static" });
  const checks = selectChecks(only).filter((check) => !skip.has(check.id));

  for (const check of checks) {
    const checkStarted = performance.now();
    const before = sink.size;
    try {
      await check.run({ project, sink, coverage, options: { root, only, strict } });
    } catch (error) {
      // A check that dies and says nothing turns "we did not look" into "we
      // looked and it was fine". The coverage ledger records the death and the
      // report refuses to pass on it.
      coverage.errored(check.id, error);
      console.log(`  ${check.id.padEnd(16)} ERRORED  ${String(error?.message ?? error).slice(0, 80)}`);
      continue;
    }
    const took = Math.round(performance.now() - checkStarted);
    console.log(
      `  ${check.id.padEnd(16)} ${String(sink.size - before).padStart(4)} finding(s)  ${took}ms`,
    );
  }

  findings.push(...sink.all());
}

/* ───────────────────────────────────────────────────────────── ai layer */

if (layers.includes("ai")) {
  const { runAiLayer } = await import("./ai/run.mjs");
  const sink = new ScanSink({ runDir, target: "ai" });
  try {
    await runAiLayer({ project, sink, coverage, root, runDir, args });
  } catch (error) {
    coverage.errored("ai", error);
    console.log(`  ai               ERRORED  ${String(error?.message ?? error).slice(0, 120)}`);
  }
  findings.push(...sink.all());
}

/* ─────────────────────────────────────────────────────────── fuzz layer */

if (layers.includes("fuzz")) {
  const { runFuzzLayer } = await import("./fuzz/run.mjs");
  const sink = new ScanSink({ runDir, target: "fuzz" });
  try {
    await runFuzzLayer({ project, sink, coverage, root, runDir, baseURL, args });
  } catch (error) {
    coverage.errored("fuzz", error);
    console.log(`  fuzz             ERRORED  ${String(error?.message ?? error).slice(0, 120)}`);
  }
  findings.push(...sink.all());
}

/* ─────────────────────────────────────────────────────────────── report */

const manifest = {
  runId,
  layers,
  startedAt: startedAt.toISOString(),
  durationMs: Math.round(performance.now() - started),
  node: process.version,
  fileCount: project.files.length,
  baseURL: baseURL || null,
  git: {
    sha: git(["rev-parse", "HEAD"]) || "unknown",
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown",
    dirty: git(["status", "--porcelain"]).length > 0,
  },
};
writeFileSync(path.join(runDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
writeFileSync(
  path.join(runDir, "coverage.json"),
  `${JSON.stringify(coverage.toJSON(), null, 2)}\n`,
  "utf8",
);

const baseline = loadBaseline(root);
const report = renderScanReport({
  runId,
  manifest,
  findings,
  coverage: coverage.toJSON(),
  baseline,
  strict,
});

writeFileSync(path.join(committedDir, "runs", `${runId}.md`), report.markdown, "utf8");
writeFileSync(path.join(committedDir, "latest.md"), report.markdown, "utf8");
writeFileSync(
  path.join(committedDir, "findings.json"),
  `${JSON.stringify(
    { runId, verdict: report.verdict, counts: report.counts, findings: report.findings },
    null,
    2,
  )}\n`,
  "utf8",
);
writeFileSync(
  path.join(committedDir, "coverage.json"),
  `${JSON.stringify(coverage.toJSON(), null, 2)}\n`,
  "utf8",
);

if (shouldWriteBaseline) {
  const written = writeBaseline(root, report.findings, baseline);
  console.log(`\nBaseline written to ${path.relative(root, written)}.`);
}

console.log(
  `\n${report.verdict.pass ? "PASS" : "FAIL"} — ${report.findings.length} finding(s)`
    + `\n  P0 ${report.counts.P0} · P1 ${report.counts.P1} · P2 ${report.counts.P2} · P3 ${report.counts.P3}`
    + `\n  report: docs/qa/scan/runs/${runId}.md`,
);
for (const reason of report.verdict.reasons.slice(0, 12)) console.log(`  - ${reason}`);
if (report.verdict.reasons.length > 12) {
  console.log(`  … and ${report.verdict.reasons.length - 12} more, in the report.`);
}

process.exit(report.verdict.pass ? 0 : 1);

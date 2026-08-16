#!/usr/bin/env node
/**
 * The report, and the verdict.
 *
 * Runs last on purpose: the Playwright legs and the MCP conformance runner all
 * append to the same run directory, so the gate can only be applied once
 * everything has contributed. That is also why the gate lives here rather than
 * in Playwright's global teardown.
 *
 * The document is written for someone who did not run it and is reading it six
 * months later. Two things make that work: every finding carries a `repro:`
 * command, and the coverage ledger comes BEFORE the findings — so nobody reads
 * a short findings list as "everything passed" when it might mean "very little
 * ran".
 *
 *   node tests/deep/report/render.mjs                # newest run
 *   node tests/deep/report/render.mjs --run <runId>
 *   node tests/deep/report/render.mjs --write-baseline
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { evaluateGate, proposeNoiseBudget, EMPTY_BASELINE } from "./gate.mjs";
import { SEVERITY_ORDER } from "../lib/rules.mjs";

const RUN_ROOT = path.resolve(process.cwd(), "docs/smoke-reports/deep");
const COMMITTED_ROOT = path.resolve(process.cwd(), "docs/qa/deep-test");
const BASELINE_PATH = path.resolve(process.cwd(), "tests/deep/baseline/known-findings.json");

const args = process.argv.slice(2);
const runArgIndex = args.indexOf("--run");
const writeBaseline = args.includes("--write-baseline");

function newestRunId() {
  if (!existsSync(RUN_ROOT)) return null;
  const runs = readdirSync(RUN_ROOT)
    .filter((entry) => existsSync(path.join(RUN_ROOT, entry, "manifest.json")))
    .sort();
  return runs[runs.length - 1] ?? null;
}

const runId = runArgIndex >= 0 ? args[runArgIndex + 1] : process.env.DEEP_RUN_ID ?? newestRunId();

if (!runId) {
  console.error("No run to report on. Run the harness first.");
  process.exit(2);
}

const runDir = path.join(RUN_ROOT, runId);
if (!existsSync(runDir)) {
  console.error(`No run directory at ${path.relative(process.cwd(), runDir)}.`);
  process.exit(2);
}

function readJson(file, fallback) {
  const full = path.join(runDir, file);
  if (!existsSync(full)) return fallback;
  try {
    return JSON.parse(readFileSync(full, "utf8"));
  } catch {
    return fallback;
  }
}

function readJsonl(file) {
  const full = path.join(runDir, file);
  if (!existsSync(full)) return [];
  return readFileSync(full, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const manifest = readJson("manifest.json", {});
const coverage = readJson("coverage.json", { dimensions: [], gaps: [] });
const postGates = readJson("post-gates.json", []);
const mcp = readJson("mcp-summary.json", null);
const writeLedger = readJsonl("write-ledger.jsonl");
const timings = readJsonl("timings.jsonl");

/** Findings arrive from several processes; dedupe by id and sum seenCount. */
const byId = new Map();
for (const finding of readJsonl("findings.jsonl")) {
  const existing = byId.get(finding.id);
  if (existing) {
    existing.seenCount += finding.seenCount ?? 1;
    if (!existing.targets.includes(finding.target)) existing.targets.push(finding.target);
    continue;
  }
  byId.set(finding.id, { ...finding, targets: [finding.target] });
}

const findings = [...byId.values()].sort((a, b) => {
  const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (bySeverity !== 0) return bySeverity;
  if (a.confidence !== b.confidence) return a.confidence === "deterministic" ? -1 : 1;
  if (a.seenCount !== b.seenCount) return b.seenCount - a.seenCount;
  return String(a.surface).localeCompare(String(b.surface));
});

const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
  : EMPTY_BASELINE;

const verdict = evaluateGate(findings, baseline, {
  strict: process.env.DEEP_STRICT === "1",
});

// A coverage gap in a dimension declared exhaustive is a failed verdict on its
// own: it means the run did not do what the report is about to claim it did.
if ((coverage.gaps ?? []).length > 0) {
  verdict.pass = false;
  for (const gap of coverage.gaps) {
    verdict.reasons.push(
      `Coverage gap: ${gap.dimension} declared exhaustive but missed ${gap.missing.length} value(s).`,
    );
  }
}

/* ---------------------------------------------------------------- render */

const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
for (const finding of findings) counts[finding.severity] += 1;

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const lines = [];
const push = (line = "") => lines.push(line);

push(`# Deep harness run ${runId}`);
push();
push(`**${verdict.pass ? "PASS" : "FAIL"}** · ${findings.length} finding(s) · ` +
  `P0 ${counts.P0} · P1 ${counts.P1} · P2 ${counts.P2} · P3 ${counts.P3}`);
push();

push("## Run");
push();
push("| | |");
push("|---|---|");
push(`| Run id | \`${runId}\` |`);
push(`| Target | ${manifest.target ?? "(unknown)"} |`);
push(`| Base URL | ${manifest.baseURL ?? "(unknown)"} |`);
push(`| Session | ${manifest.session ?? "(unknown)"} |`);
push(`| Started | ${manifest.startedAt ?? "(unknown)"} |`);
push(`| Git | \`${manifest.git?.sha?.slice(0, 12) ?? "?"}\` on ${manifest.git?.branch ?? "?"}${manifest.git?.dirty ? " (dirty)" : ""} |`);
push(`| Node | ${manifest.node ?? "?"} |`);
push(`| Writes | ${manifest.writesEnabled ? "**enabled**" : "disabled"} |`);
push(`| Strict gate | ${manifest.strict ? "yes" : "no"} |`);
push(`| Env present | ${(manifest.envPresent ?? []).join(", ") || "(none)"} |`);
push();
push("_Environment variables are listed by name only; no value from the environment reaches this document._");
push();

push("## Verdict");
push();
if (verdict.pass) {
  push("The gate passed. P0 always fails; deterministic P1 fails; P2/P3 fail only on count regression against the committed baseline.");
} else {
  push(`The gate **failed** for ${verdict.reasons.length} reason(s):`);
  push();
  for (const reason of verdict.reasons) push(`- ${reason}`);
}
if (verdict.waivedIds.length > 0) {
  push();
  push(`${verdict.waivedIds.length} finding(s) matched a live waiver in \`tests/deep/baseline/known-findings.json\`.`);
}
if (verdict.resolvedWaiverIds.length > 0) {
  push();
  push(`**${verdict.resolvedWaiverIds.length} waived finding(s) did not reproduce** — fixed. Remove their waivers: ${verdict.resolvedWaiverIds.join(", ")}.`);
}
push();

push("## What this run did NOT test");
push();
push(coverage.statement ?? "(no coverage ledger was written)");
push();
push("| Dimension | Strategy | Domain | Visited | Not visited |");
push("|---|---|---:|---:|---|");
for (const dimension of coverage.dimensions ?? []) {
  const missing = dimension.notVisited ?? [];
  const missingText = missing.length === 0
    ? "—"
    : missing.length > 8
      ? `${missing.slice(0, 8).join(", ")} … (+${missing.length - 8})`
      : missing.join(", ");
  push(
    `| \`${dimension.id}\` | ${dimension.strategy} | ${dimension.domainSize} | ` +
      `${(dimension.visited ?? []).length} | ${missingText} |`,
  );
}
push();
for (const dimension of coverage.dimensions ?? []) {
  if (dimension.note) push(`- **${dimension.id}** — ${dimension.note}`);
}
push();

push("## Gates");
push();
push("| Verifier | Phase | Result | Exit |");
push("|---|---|---|---:|");
for (const gate of manifest.preGates ?? []) {
  push(`| ${gate.name} | pre | ${gate.ok ? "pass" : "**FAIL**"} | ${gate.exitCode} |`);
}
for (const gate of postGates) {
  push(`| ${gate.name} | post | ${gate.ok ? "pass" : "**FAIL**"} | ${gate.exitCode} |`);
}
push();
push("_A verifier that passed before the run and failed after it is this run's doing. That pairing is the whole point of running them twice._");
push();

push("## Findings");
push();
if (findings.length === 0) {
  push("None recorded.");
} else {
  let index = 0;
  for (const finding of findings) {
    index += 1;
    push(`### ${finding.severity}-${String(index).padStart(3, "0")} ${finding.title}`);
    push();
    push("```");
    push(`id:         ${finding.id}`);
    push(`rule:       ${finding.rule}  [${finding.confidence}]`);
    push(`targets:    ${finding.targets.join(" · ")}     seen: ${finding.seenCount}×`);
    push(`surface:    ${finding.surface}`);
    push(`role:       ${finding.role ?? "—"}        device: ${finding.device ?? "—"}        session: ${finding.session}`);
    push(`expected:   ${finding.expected}`);
    push(`actual:     ${String(finding.actual).split("\n").join("\n            ")}`);
    if (finding.suspectedFile) push(`suspected:  ${finding.suspectedFile}`);
    if (finding.evidence?.screenshot) push(`evidence:   ${finding.evidence.screenshot}`);
    if (finding.evidence?.consoleTail?.length) {
      push(`console:    ${finding.evidence.consoleTail.slice(0, 3).join(" / ")}`);
    }
    if (finding.evidence?.networkTail?.length) {
      push(`network:    ${finding.evidence.networkTail.slice(0, 3).join(" / ")}`);
    }
    if (finding.evidence?.reproCommand) push(`repro:      ${finding.evidence.reproCommand}`);
    push("```");
    push();
  }
}

push("## Write ledger");
push();
if (writeLedger.length === 0) {
  push("Nothing was written. (`DEEP_ALLOW_WRITES=1` enables the write suite.)");
} else {
  push("Every row this run created. Receipts are append-only — a correction is a `payment_adjustment`, never a delete.");
  push();
  push("| Table | Case | Identifier | Detail |");
  push("|---|---|---|---|");
  for (const entry of writeLedger) {
    push(`| ${entry.table} | ${entry.caseId} | \`${entry.identifier}\` | ${entry.note ?? ""} |`);
  }
}
push();

if (mcp) {
  push("## MCP conformance");
  push();
  push(`Worker: ${mcp.workerVersion ?? "?"} · lanes: ${(mcp.lanes ?? []).join(", ")}`);
  push();
  if (mcp.toolMatrix) {
    push("| Tool | 2026-27 | TEST-2026-27 |");
    push("|---|:--:|:--:|");
    for (const [tool, states] of Object.entries(mcp.toolMatrix)) {
      push(`| \`${tool}\` | ${states.live ?? "—"} | ${states.test ?? "—"} |`);
    }
    push();
  }
  if (mcp.roleVisibility) {
    push("| Role | Tools visible | Refused at /authorize |");
    push("|---|---:|:--:|");
    for (const [role, info] of Object.entries(mcp.roleVisibility)) {
      push(`| ${role} | ${info.count ?? "—"} | ${info.denied ? "yes" : "no"} |`);
    }
    push();
  }
  if (mcp.oracle?.length) {
    push("| Figure | MCP | Postgres | Delta |");
    push("|---|---:|---:|---:|");
    for (const row of mcp.oracle) {
      push(`| ${row.label} | ${row.mcp} | ${row.postgres} | ${row.delta} |`);
    }
    push();
  }
  if (mcp.cursors?.length) {
    push("| Paging tool | Pages | Rows | Duplicates | Gaps |");
    push("|---|---:|---:|---:|---:|");
    for (const row of mcp.cursors) {
      push(`| \`${row.tool}\` | ${row.pages} | ${row.rows} | ${row.duplicates} | ${row.gaps} |`);
    }
    push();
  }
}

push("## Timing");
push();
if (timings.length === 0) {
  push("No timings recorded.");
} else {
  const values = timings.map((entry) => entry.loadMs);
  push(`${timings.length} navigations · p50 ${percentile(values, 50)}ms · p95 ${percentile(values, 95)}ms · max ${Math.max(...values)}ms`);
  push();
  const slowest = [...timings].sort((a, b) => b.loadMs - a.loadMs).slice(0, 10);
  push("| Surface | Device | ms |");
  push("|---|---|---:|");
  for (const entry of slowest) push(`| ${entry.surface} | ${entry.device} | ${entry.loadMs} |`);
}
push();

push("## Environment appendix");
push();
push("The enumerations as the harness saw them, so a future reader can tell \"not tested\" apart from \"did not exist yet\".");
push();
for (const dimension of coverage.dimensions ?? []) {
  push(`- **${dimension.id}** (${dimension.domainSize}): ${[...(dimension.visited ?? []), ...(dimension.notVisited ?? [])].join(", ")}`);
}
push();

/* ---------------------------------------------------------------- write */

mkdirSync(path.join(COMMITTED_ROOT, "runs"), { recursive: true });

const markdown = `${lines.join("\n")}\n`;
writeFileSync(path.join(COMMITTED_ROOT, "runs", `${runId}.md`), markdown, "utf8");
writeFileSync(path.join(COMMITTED_ROOT, "latest.md"), markdown, "utf8");
writeFileSync(
  path.join(COMMITTED_ROOT, "findings.json"),
  `${JSON.stringify({ runId, verdict, counts, findings }, null, 2)}\n`,
  "utf8",
);
writeFileSync(
  path.join(COMMITTED_ROOT, "coverage.json"),
  `${JSON.stringify(coverage, null, 2)}\n`,
  "utf8",
);

/*
 * Screenshots are deliberately NOT copied into the committed directory.
 *
 * They were, at first — "a few PNGs so a finding filed six months ago still has
 * its picture". But a screenshot of this app is a picture of a class list: real
 * names, phone numbers and balances, rendered. `.gitignore` says smoke output
 * "contains real student PII, never commit", and a screenshot is the most PII
 * -dense artifact the harness produces.
 *
 * So they stay in the gitignored run directory and the report points at them by
 * path. Nothing is lost that matters: every finding carries a `repro` command,
 * which regenerates the picture on demand and is the thing an engineer actually
 * acts on.
 */

if (writeBaseline) {
  const proposed = {
    generatedAt: new Date().toISOString(),
    waivers: baseline.waivers ?? [],
    noiseBudget: proposeNoiseBudget(findings),
  };
  mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(BASELINE_PATH, `${JSON.stringify(proposed, null, 2)}\n`, "utf8");
  console.log(`Baseline written to ${path.relative(process.cwd(), BASELINE_PATH)}.`);
}

console.log(`\n${verdict.pass ? "PASS" : "FAIL"} — ${findings.length} finding(s)`);
console.log(`  P0 ${counts.P0} · P1 ${counts.P1} · P2 ${counts.P2} · P3 ${counts.P3}`);
console.log(`  report: docs/qa/deep-test/runs/${runId}.md`);
for (const reason of verdict.reasons.slice(0, 10)) console.log(`  - ${reason}`);

process.exit(verdict.pass ? 0 : 1);

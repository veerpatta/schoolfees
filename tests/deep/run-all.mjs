#!/usr/bin/env node
/**
 * The whole harness: local first, then production, one merged report.
 *
 * Local first is not only about speed. A failure at the local stage is
 * debuggable with a running dev server, a trace and source maps — and, more
 * importantly, a local write-suite failure aborts before production has posted
 * anything. By the time the production leg runs, the write path has already
 * been proven once against the same test ledger.
 *
 * Both legs share one `DEEP_RUN_ID`, so both write into the same run directory
 * and the report can show a three-column diff: a finding present in production
 * and absent locally is an environment or build finding, not a code finding,
 * and that is the most interesting row in the document.
 *
 * Env is set here rather than with `cross-env`: this repo has no such
 * dependency and this machine is PowerShell, where `FOO=bar npm run x` is a
 * parse error.
 *
 *   node tests/deep/run-all.mjs                    # local, then production
 *   node tests/deep/run-all.mjs --targets local    # one leg
 *   node tests/deep/run-all.mjs --writes           # enable the write suite
 *   node tests/deep/run-all.mjs --skip-mcp
 */

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const targets = value("targets", "local,production")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

const withWrites = flag("writes");
const skipMcp = flag("skip-mcp");

function mintRunId() {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  return `${stamp}-${randomBytes(3).toString("hex")}`;
}

const runId = process.env.DEEP_RUN_ID ?? mintRunId();
mkdirSync(path.resolve(process.cwd(), "docs/smoke-reports/deep", runId), { recursive: true });

function run(label, command, commandArgs, env = {}) {
  console.log(`\n── ${label} ──`);
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, DEEP_RUN_ID: runId, ...env },
  });
  return result.status ?? 1;
}

const PLAYWRIGHT = ["playwright", "test", "-c", "tests/deep/deep.config.ts"];
const stageResults = [];

for (const target of targets) {
  const env = { DEEP_TARGET: target };

  stageResults.push({
    stage: `${target}: auth`,
    code: run(`${target} · mint storage states`, "npx", [...PLAYWRIGHT, "--project=setup"], env),
  });

  // The read-only sweep. Its own findings are streamed, so a non-zero exit here
  // is a Playwright-level failure (a spec threw), not a finding — the verdict
  // comes from the reporter at the end.
  stageResults.push({
    stage: `${target}: sweep`,
    code: run(
      `${target} · route, param, rbac, device, negative and export sweep`,
      "npx",
      [...PLAYWRIGHT, "--grep-invert", "@write"],
      env,
    ),
  });

  if (withWrites) {
    const code = run(
      `${target} · guarded write suite`,
      "npx",
      [...PLAYWRIGHT, "--project=writes"],
      { ...env, DEEP_ALLOW_WRITES: "1" },
    );
    stageResults.push({ stage: `${target}: writes`, code });

    // Local runs first precisely so this can happen: if posting is broken, or a
    // safety lock refused, stop before the next target posts anything. The
    // receipts are append-only — there is no undoing a bad production leg by
    // deciding afterwards that it should not have run.
    if (code !== 0) {
      console.error(
        `\nWrite suite failed on ${target}. Stopping before any further target ` +
          "writes. Read the report, fix, and re-run.",
      );
      break;
    }
  }
}

if (!skipMcp) {
  // Once, not per target: the Worker is a single deployment and does not vary
  // with which copy of the app the browser was pointed at.
  stageResults.push({
    stage: "mcp",
    code: run("MCP conformance · all lanes, both sessions", "node", ["tests/deep/mcp/run.mjs"]),
  });
}

const reportCode = run("report and gate", "node", ["tests/deep/report/render.mjs"]);

console.log("\n── stages ──");
for (const stage of stageResults) {
  console.log(`  ${stage.code === 0 ? "ok  " : "FAIL"} ${stage.stage}`);
}
console.log(`  ${reportCode === 0 ? "PASS" : "FAIL"} gate`);
console.log(`\nrun id: ${runId}`);
console.log(`report: docs/qa/deep-test/runs/${runId}.md`);

process.exit(reportCode === 0 ? 0 : 1);

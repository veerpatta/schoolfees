import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

import { PRE_GATES, runVerifier, type GateResult } from "./lib/gates";
import { baseUrlFor, resolveTarget, TEST_SESSION } from "./lib/identity";

/**
 * Everything that has to be true before 40 minutes of testing starts.
 *
 * Two jobs. First, mint the `runId` that every artifact path, every write
 * marker and the report itself agree on — it is put in the environment so the
 * worker processes inherit it. Second, run the repo's own verifiers so the
 * baseline is known: a late-fee invariant that was already broken before the
 * sweep is not this run's bug, and only a paired before/after can tell.
 */

function mintRunId(): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 12);
  return `${stamp}-${randomBytes(3).toString("hex")}`;
}

function gitInfo() {
  const read = (command: string) => {
    try {
      return execSync(command, { encoding: "utf8" }).trim();
    } catch {
      return "(unavailable)";
    }
  };
  return {
    sha: read("git rev-parse HEAD"),
    branch: read("git rev-parse --abbrev-ref HEAD"),
    dirty: read("git status --porcelain").length > 0,
  };
}

/** Names only. A report that leaks a service-role key is worse than no report. */
function presentEnvNames(): string[] {
  return [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SCHOOLFEES_DOC_TOKEN",
    "SCHOOLFEES_MCP_TOKEN",
    "SCHOOLFEES_WORKER_MCP_TOKEN",
    "TEST_STAFF_PASSWORD",
    "SMOKE_TEST_STAFF_PASSWORD",
    "DEEP_ALLOW_WRITES",
    "DEEP_STRICT",
  ].filter((name) => Boolean(process.env[name]?.trim()));
}

export default async function globalSetup() {
  const target = resolveTarget();
  const runId = process.env.DEEP_RUN_ID?.trim() || mintRunId();
  process.env.DEEP_RUN_ID = runId;

  const runDir = path.resolve(process.cwd(), "docs/smoke-reports/deep", runId);
  mkdirSync(runDir, { recursive: true });

  const gates: GateResult[] = [];
  for (const spec of PRE_GATES) {
    const result = runVerifier(spec.name, spec.args);
    gates.push(result);

    if (!result.ok && spec.fatal) {
      throw new Error(
        `Pre-run gate "${spec.name}" failed and is fatal.\n${spec.note}\n\n` +
          `${result.stdoutTail}\n${result.stderrTail}`,
      );
    }

    if (!result.ok) {
      console.warn(
        `[deep] pre-gate ${spec.name} is already failing. ` +
          "Findings from the matching post-gate will not be attributable to this run.",
      );
    }
  }

  const manifest = {
    runId,
    target,
    baseURL: baseUrlFor(target),
    session: TEST_SESSION,
    startedAt: new Date().toISOString(),
    node: process.version,
    git: gitInfo(),
    envPresent: presentEnvNames(),
    writesEnabled: process.env.DEEP_ALLOW_WRITES === "1",
    strict: process.env.DEEP_STRICT === "1",
    preGates: gates,
  };

  writeFileSync(
    path.join(runDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  console.log(
    `[deep] run ${runId} · target ${target} · ${manifest.baseURL} · session ${TEST_SESSION}` +
      `${manifest.writesEnabled ? " · WRITES ENABLED" : ""}`,
  );
}

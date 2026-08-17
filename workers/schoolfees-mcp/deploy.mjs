#!/usr/bin/env node
/**
 * Deploys the Worker with a build stamp, so `/health` can answer "is the fix
 * live?".
 *
 * `SERVER_VERSION` is hand-maintained and nothing in CI deploys this Worker, so
 * without a stamp the only way to tell a deployed build apart from the one
 * before it was to call a tool and read the shape of the answer. That is how a
 * fix can look deployed and not be.
 *
 * Passes the values as `--var`, which lands them in `env` alongside the vars in
 * wrangler.toml. Not secrets: knowing which commit is running is the point.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const sha = git("rev-parse", "--short", "HEAD") || "unknown";
const dirty = git("status", "--porcelain") !== "";
const commit = dirty ? `${sha}-dirty` : sha;
const builtAt = new Date().toISOString();

if (dirty) {
  console.warn(
    `warning: deploying with uncommitted changes — stamping the build as ${commit}.`,
  );
}

console.log(`Deploying schoolfees MCP Worker at ${commit} (built ${builtAt}).`);

// Wrangler's JS entry point, run with the current node. Two Windows traps
// avoided here: spawning `npx.cmd` fails with EINVAL because Node will not exec
// a .cmd shim directly, and `require.resolve("wrangler/bin/wrangler.js")` is
// refused because the package's `exports` map does not publish that subpath.
// So the path is built directly.
const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const wrangler = path.join(repoRoot, "node_modules/wrangler/bin/wrangler.js");

if (!existsSync(wrangler)) {
  console.error(`Cannot find wrangler at ${wrangler}. Run \`npm install\` first.`);
  process.exit(1);
}

execFileSync(
  process.execPath,
  [
    wrangler,
    "deploy",
    "--config",
    "workers/schoolfees-mcp/wrangler.toml",
    "--var",
    `SCHOOLFEES_MCP_BUILD_SHA:${commit}`,
    "--var",
    `SCHOOLFEES_MCP_BUILD_TIME:${builtAt}`,
  ],
  { stdio: "inherit" },
);

/**
 * Assembles the MCP server for one caller.
 *
 * A server instance is per-request and per-identity, because the tool list is
 * per-identity: a tool the caller's staff role cannot use is never registered,
 * so `tools/list` shows each person exactly what they can run. An assistant
 * therefore never proposes a call that is going to be refused.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerOrientationTools } from "./tools/orientation.mjs";
import { registerStudentTools } from "./tools/students.mjs";
import { registerMoneyTools } from "./tools/money.mjs";
import { registerTransactionTools } from "./tools/transactions.mjs";
import { registerRecoveryTools } from "./tools/recovery.mjs";
import { registerLeftStudentTools } from "./tools/left-students.mjs";
import { registerAiContextTools } from "./tools/ai-context.mjs";
import { registerAssetTools } from "./tools/assets.mjs";
import { registerDocumentTools } from "./tools/documents.mjs";
import { registerResources } from "./resources.mjs";
import { registerPrompts } from "./prompts.mjs";

export const SERVER_NAME = "schoolfees";
export const SERVER_VERSION = "1.1.0";

/**
 * Which commit is actually running.
 *
 * `SERVER_VERSION` is hand-maintained, so it answers "which release did we
 * intend" and not "is the fix I just wrote live". Nothing in CI deploys this
 * Worker — it goes out from a developer machine — which makes that a question
 * people genuinely have to ask. `wrangler deploy --var` supplies the value; a
 * build without it says so rather than implying a clean deploy.
 */
export function buildStamp(env) {
  return {
    commit: env?.SCHOOLFEES_MCP_BUILD_SHA || null,
    builtAt: env?.SCHOOLFEES_MCP_BUILD_TIME || null,
    note: env?.SCHOOLFEES_MCP_BUILD_SHA
      ? null
      : "No build stamp: deployed without SCHOOLFEES_MCP_BUILD_SHA, so the running commit is unknown. Deploy with `npm run mcp:schoolfees:worker:deploy`.",
  };
}

const SERVER_INSTRUCTIONS = `Read-only access to the fee system of Shri Veer Patta Senior Secondary School (VPPS).

Start with describe_capabilities in a new conversation — it returns the money vocabulary and the rules that decide which students count.

Four things to get right:

1. Fees and late fees are separate and are never added together. A family whose only debt is a late fee is not a defaulter.
2. Headcount counts students on the roll. Money counts students on the roll OR who have paid something, because a student who left owing money still owes it. Every response says which rule it used, in its scope block.
3. enrollment.status (active / inactive / left / graduated) says whether a child is still enrolled. feeTier (New / Old) only decides which academic fee applies — it is not an enrollment status.
4. Nothing here writes. It cannot post a payment, edit a record, or send a message. Never say that it did.

Always fetch live data; never quote a fee amount from memory.`;

export function createMcpServer(env, identity) {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  const registered = [];
  const ctx = {
    env,
    identity,
    // describe_capabilities reports this, so a caller can see its own surface.
    availableToolNames: () => [...registered],
  };

  // Wraps registerTool so the ctx above can report what actually got through
  // the permission gate, without every family having to report it itself.
  const originalRegisterTool = server.registerTool.bind(server);
  server.registerTool = (name, ...rest) => {
    registered.push(name);
    return originalRegisterTool(name, ...rest);
  };

  registerOrientationTools(server, ctx);
  registerStudentTools(server, ctx);
  registerMoneyTools(server, ctx);
  registerTransactionTools(server, ctx);
  registerRecoveryTools(server, ctx);
  registerLeftStudentTools(server, ctx);
  registerAiContextTools(server, ctx);
  registerAssetTools(server, ctx);
  registerDocumentTools(server, ctx);

  registerResources(server, ctx);
  registerPrompts(server, ctx);

  return server;
}

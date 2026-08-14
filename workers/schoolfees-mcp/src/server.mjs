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
import { registerResources } from "./resources.mjs";
import { registerPrompts } from "./prompts.mjs";

export const SERVER_NAME = "schoolfees";
export const SERVER_VERSION = "1.0.0";

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

  registerResources(server);
  registerPrompts(server, ctx);

  return server;
}

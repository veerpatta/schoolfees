/**
 * Transport and authentication for the Schoolfees MCP server.
 *
 * The tools themselves live in ./src. This file only decides who is asking and
 * hands the request to a server built for them.
 *
 * Two lanes, on purpose:
 *
 *   /mcp      OAuth 2.1. A person, signed in with their own staff account, so
 *             access is attributable and revocable by deactivating that account.
 *             Their role now narrows the tool list.
 *
 *   /svc/mcp  A shared service token, for the unattended morning run which has
 *             no human present to complete a browser sign-in. Full read reach,
 *             labelled as automation in every payload.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createMcpServer, SERVER_NAME, SERVER_VERSION } from "./src/server.mjs";
import { resolveStaffRole, SERVICE_IDENTITY } from "./src/permissions.mjs";
import { getSupabaseSchema } from "./src/supabase.mjs";

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers":
        "authorization,content-type,mcp-session-id,mcp-protocol-version,last-event-id",
      ...(init.headers || {}),
    },
  });
}

export function unauthorized() {
  return json(
    { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null },
    { status: 401 },
  );
}

/**
 * Service-lane auth. Strict on purpose:
 *
 * - No unauthenticated method exemptions. `initialize`, `ping` and `tools/list`
 *   all need the token, so a misconfigured client fails at connect time instead
 *   of looking healthy right up until someone asks for real data.
 * - Fails closed. A missing SCHOOLFEES_MCP_TOKEN denies everything, because this
 *   Worker reads Supabase with the service role key and bypasses RLS.
 */
export function checkServiceToken(request, env) {
  const token = env.SCHOOLFEES_MCP_TOKEN;
  if (!token) return false;

  const url = new URL(request.url);
  // Token-in-path exists because ChatGPT's connector does not reliably forward
  // a custom Authorization header.
  if (url.pathname === `/svc/mcp/${token}`) return true;

  return request.headers.get("authorization") === `Bearer ${token}`;
}

async function runMcpTransport(request, env, identity) {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMcpServer(env, identity);
  await server.connect(transport);
  return transport.handleRequest(request);
}

/**
 * Staff lane. The OAuth provider has already verified the token before this
 * runs, so `props` is the signed-in staff member set in oauth-entry.mjs. Their
 * role travels into the server and decides which tools exist for them.
 */
export async function handleOAuthMcp(request, env, props) {
  if (!props || !props.userId) return unauthorized();

  return runMcpTransport(request, env, {
    kind: "staff",
    userId: props.userId,
    email: props.email,
    fullName: props.fullName,
    role: resolveStaffRole(props.role),
  });
}

/** Automation lane. */
export async function handleServiceMcp(request, env) {
  if (!checkServiceToken(request, env)) return unauthorized();

  return runMcpTransport(request, env, SERVICE_IDENTITY);
}

export function healthPayload(env) {
  return {
    ok: true,
    name: SERVER_NAME,
    version: SERVER_VERSION,
    defaultSession: env.SCHOOLFEES_MCP_DEFAULT_SESSION || "2026-27",
    schema: getSupabaseSchema(env),
    readOnly: true,
  };
}

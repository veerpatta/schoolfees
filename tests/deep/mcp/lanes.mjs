import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { makeClient } from "./rpc.mjs";

/**
 * The two ways in, and the roles that must be refused.
 *
 * The service lane is a bearer token. The OAuth lane turned out to be fully
 * scriptable without a browser, which is the finding that made the per-role
 * matrix possible at all: `oauth-entry.mjs` registers an open `/register`
 * (dynamic client registration) and its `/authorize` accepts a **form POST** of
 * `oauth_query` + `email` + `password`, answering with a 302 that carries the
 * code. So the whole flow is register → authorize → token, in Node.
 *
 * The refusals are assertions, not gaps. `SCHOOLFEES_MCP_ALLOWED_ROLES` is
 * `admin,accountant,fee_collector`, so `teacher` and `view_only` MUST fail to
 * mint a token. A run where all five succeed is a broken gate, not a good day.
 */

export const DEFAULT_MCP_URL =
  process.env.SCHOOLFEES_MCP_URL?.replace(/\/$/, "") ??
  "https://schoolfees-live-mcp.raj-39e.workers.dev";

export const SERVICE_TOKEN =
  process.env.SCHOOLFEES_WORKER_MCP_TOKEN ?? process.env.SCHOOLFEES_MCP_TOKEN ?? null;

/**
 * The shared QA password.
 *
 * Environment first. `docs/qa/credentials.local.md` is the documented home for
 * it, is gitignored, and holds it in a fenced block — reading it there means
 * the operator does not have to export a secret by hand to run the suite. The
 * value is never logged and never leaves this process.
 */
export function sharedQaPassword() {
  const fromEnv =
    process.env.SMOKE_TEST_STAFF_PASSWORD ?? process.env.TEST_STAFF_PASSWORD ?? null;
  if (fromEnv?.trim()) return fromEnv.trim();

  const credentialsPath = path.resolve(process.cwd(), "docs/qa/credentials.local.md");
  if (!existsSync(credentialsPath)) return null;

  const fenced = readFileSync(credentialsPath, "utf8").match(/```\s*\n([^\n`]+)\n```/);
  return fenced?.[1]?.trim() ?? null;
}

function base64url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function postForm(url, fields, { redirect = "follow" } = {}) {
  return fetch(url, {
    method: "POST",
    redirect,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

/**
 * Mint an OAuth access token for one staff login, headlessly.
 *
 * Returns `{ denied: true }` when the Worker refuses the role — which is the
 * expected, asserted outcome for `teacher` and `view_only`.
 */
export async function mintOAuthToken(email, password, baseUrl = DEFAULT_MCP_URL) {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const redirectUri = "http://127.0.0.1:53682/deep-test-callback";

  const registration = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "schoolfees deep harness",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    }),
  });

  if (!registration.ok) {
    return {
      denied: false,
      error: `dynamic client registration failed: HTTP ${registration.status} ` +
        `${(await registration.text()).slice(0, 200)}`,
    };
  }

  const client = await registration.json();

  const oauthQuery = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: base64url(randomBytes(8)),
  }).toString();

  const authorize = await postForm(
    `${baseUrl}/authorize`,
    { oauth_query: oauthQuery, email, password },
    { redirect: "manual" },
  );

  // 401 is a first-class outcome: the sign-in gate refuses a role that is not
  // in SCHOOLFEES_MCP_ALLOWED_ROLES, and an inactive account.
  if (authorize.status === 401 || authorize.status === 403) {
    return { denied: true, status: authorize.status, body: (await authorize.text()).slice(0, 400) };
  }

  const location = authorize.headers.get("location");
  if (!location) {
    return {
      denied: false,
      error: `/authorize answered ${authorize.status} with no redirect; ` +
        `body began ${(await authorize.text()).slice(0, 200)}`,
    };
  }

  const code = new URL(location, baseUrl).searchParams.get("code");
  if (!code) return { denied: false, error: `no code in redirect: ${location}` };

  const tokenResponse = await postForm(`${baseUrl}/token`, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: client.client_id,
    code_verifier: verifier,
  });

  if (!tokenResponse.ok) {
    return {
      denied: false,
      error: `token exchange failed: HTTP ${tokenResponse.status} ` +
        `${(await tokenResponse.text()).slice(0, 200)}`,
    };
  }

  const token = await tokenResponse.json();
  return { denied: false, accessToken: token.access_token };
}

export function serviceLane(baseUrl = DEFAULT_MCP_URL) {
  if (!SERVICE_TOKEN) return null;
  return makeClient({
    url: `${baseUrl}/svc/mcp`,
    headers: { authorization: `Bearer ${SERVICE_TOKEN}` },
    label: "svc",
  });
}

export function oauthLane(accessToken, label, baseUrl = DEFAULT_MCP_URL) {
  return makeClient({
    url: `${baseUrl}/mcp`,
    headers: { authorization: `Bearer ${accessToken}` },
    label,
  });
}

export async function health(baseUrl = DEFAULT_MCP_URL) {
  const response = await fetch(`${baseUrl}/health`);
  return { status: response.status, body: await response.json().catch(() => null) };
}

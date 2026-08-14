/**
 * Worker entry point for the Schoolfees MCP server.
 *
 * Two authentication lanes, on purpose:
 *
 *   /mcp       OAuth 2.1. Used by staff through an AI client (Claude, ChatGPT).
 *              Each person signs in with their own Schoolfees staff account, so
 *              access is attributable instead of one shared secret.
 *
 *   /svc/mcp   Shared service token. Used by unattended automation (the morning
 *              defaulter task, Codex) which has no human present to complete a
 *              browser sign-in.
 *
 * /health stays public and returns no student or fee data.
 */
import OAuthProvider, {
  AuthorizationError,
} from "@cloudflare/workers-oauth-provider";

import {
  handleOAuthMcp,
  handleServiceMcp,
  healthPayload,
  json,
} from "./worker.mjs";

const SCHOOL_NAME = "Shri Veer Patta Senior Secondary School";
const DEFAULT_ALLOWED_ROLES = "admin,accountant";

function allowedRoles(env) {
  return String(env.SCHOOLFEES_MCP_ALLOWED_ROLES || DEFAULT_ALLOWED_ROLES)
    .split(",")
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}

function clientLabel(client) {
  return client?.clientName || client?.clientId || "An application";
}

const PAGE_STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center;
    justify-content: center; padding: 24px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #f4f5f7; color: #16181d;
  }
  .card {
    width: 100%; max-width: 420px; background: #fff; border: 1px solid #e3e5ea;
    border-radius: 16px; padding: 28px; box-shadow: 0 8px 28px rgba(16,24,40,.07);
  }
  h1 { font-size: 19px; margin: 0 0 4px; }
  .school { font-size: 13px; color: #667085; margin: 0 0 20px; }
  .ask {
    font-size: 14px; line-height: 1.5; background: #f7f8fa; border: 1px solid #e3e5ea;
    border-radius: 10px; padding: 12px 14px; margin-bottom: 20px;
  }
  .ask strong { font-weight: 600; }
  label { display: block; font-size: 13px; font-weight: 600; margin: 0 0 6px; }
  input {
    width: 100%; padding: 11px 12px; font-size: 15px; border: 1px solid #cdd1d9;
    border-radius: 9px; margin-bottom: 16px; background: #fff;
  }
  input:focus { outline: 2px solid #2f6fed; outline-offset: 1px; border-color: #2f6fed; }
  button {
    width: 100%; padding: 12px; font-size: 15px; font-weight: 600; color: #fff;
    background: #1f2937; border: 0; border-radius: 9px; cursor: pointer;
  }
  button:hover { background: #111827; }
  .error {
    font-size: 13.5px; line-height: 1.5; color: #8a1c1c; background: #fdf1f1;
    border: 1px solid #f5c9c9; border-radius: 9px; padding: 11px 13px; margin-bottom: 18px;
  }
  .note { font-size: 12.5px; color: #667085; margin: 18px 0 0; line-height: 1.5; }
`;

function loginPage({ query, clientName, error }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sign in - Schoolfees</title><style>${PAGE_STYLE}</style></head>
<body><div class="card">
  <h1>Sign in to continue</h1>
  <p class="school">${escapeHtml(SCHOOL_NAME)}</p>
  <div class="ask"><strong>${escapeHtml(clientName)}</strong> wants to read fee
  collection data - dues, defaulters, receipts and follow-up drafts. It cannot
  post payments, change fees, edit students or send messages.</div>
  ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
  <form method="post" action="/authorize">
    <input type="hidden" name="oauth_query" value="${escapeHtml(query)}">
    <label for="email">Staff email</label>
    <input id="email" name="email" type="email" autocomplete="username" required autofocus>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Sign in and allow</button>
  </form>
  <p class="note">Use the same email and password you use for the Schoolfees
  office app. Only active admin and accounts staff can connect.</p>
</div></body></html>`;
}

function messagePage(title, message, status = 400) {
  return htmlResponse(
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head>
<body><div class="card">
  <h1>${escapeHtml(title)}</h1>
  <p class="school">${escapeHtml(SCHOOL_NAME)}</p>
  <div class="error">${escapeHtml(message)}</div>
</div></body></html>`,
    status,
  );
}

/**
 * Verifies staff credentials against Supabase Auth, then applies the same
 * gate the office app uses: the account must be active, and its role must be
 * allowed to pull fee data through an assistant.
 */
async function signInStaff(env, email, password) {
  const baseUrl = String(env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const apiKey = env.SUPABASE_PUBLISHABLE_KEY;

  if (!baseUrl || !apiKey) {
    return {
      ok: false,
      error: "Sign-in is not set up on the server yet. Tell the school IT contact.",
    };
  }

  let response;
  try {
    response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: apiKey, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { ok: false, error: "Could not reach the sign-in service. Please try again." };
  }

  if (!response.ok) {
    return { ok: false, error: "That email and password did not match. Please try again." };
  }

  const data = await response.json().catch(() => null);
  const user = data?.user;

  if (!user?.id) {
    return { ok: false, error: "Sign-in did not return a staff account." };
  }

  // Best-effort cleanup: we only needed to verify the password, so the
  // Supabase session this created is not kept.
  if (data?.access_token) {
    try {
      await fetch(`${baseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          authorization: `Bearer ${data.access_token}`,
        },
      });
    } catch {
      // Ignore - the session expires on its own.
    }
  }

  const appMetadata = user.app_metadata || {};
  const userMetadata = user.user_metadata || {};
  const role = String(appMetadata.staff_role || "").trim().toLowerCase();

  if (appMetadata.is_active === false) {
    return { ok: false, error: "This staff account is marked inactive. Ask an admin to reactivate it." };
  }

  if (!allowedRoles(env).includes(role)) {
    return {
      ok: false,
      error: `This account (role: ${role || "not set"}) is not allowed to connect an assistant to fee data. Ask an admin.`,
    };
  }

  return {
    ok: true,
    staff: {
      userId: user.id,
      email: user.email || email,
      fullName: userMetadata.full_name || userMetadata.name || user.email || email,
      role,
    },
  };
}

function authorizationErrorResponse(error) {
  if (!(error instanceof AuthorizationError)) {
    throw error;
  }

  // An unknown client or a bad redirect URI must never be redirected back -
  // that is how open-redirect bugs happen. Show it here instead.
  if (!error.redirectUri) {
    return messagePage("Cannot continue", error.description || "Invalid sign-in request.", 400);
  }

  const redirect = new URL(error.redirectUri);
  redirect.searchParams.set("error", error.code);
  if (error.description) redirect.searchParams.set("error_description", error.description);
  if (error.state) redirect.searchParams.set("state", error.state);
  if (error.issuer) redirect.searchParams.set("iss", error.issuer);
  return Response.redirect(redirect.toString(), 302);
}

async function handleAuthorize(request, env) {
  const url = new URL(request.url);

  if (request.method === "GET") {
    let oauthRequest;
    try {
      oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
    } catch (error) {
      return authorizationErrorResponse(error);
    }

    const client = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId);
    if (!client) {
      return messagePage("Unknown application", "This application is not registered with the Schoolfees server.", 400);
    }

    return htmlResponse(
      loginPage({
        query: url.search.replace(/^\?/, ""),
        clientName: clientLabel(client),
      }),
    );
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const form = await request.formData();
  const query = String(form.get("oauth_query") || "");
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");

  let oauthRequest;
  try {
    oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(
      new Request(`${url.origin}/authorize?${query}`, { method: "GET" }),
    );
  } catch (error) {
    return authorizationErrorResponse(error);
  }

  const client = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId);
  if (!client) {
    return messagePage("Unknown application", "This application is not registered with the Schoolfees server.", 400);
  }

  const clientName = clientLabel(client);

  if (!email || !password) {
    return htmlResponse(
      loginPage({ query, clientName, error: "Enter your staff email and password." }),
      400,
    );
  }

  const signIn = await signInStaff(env, email, password);
  if (!signIn.ok) {
    return htmlResponse(loginPage({ query, clientName, error: signIn.error }), 401);
  }

  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthRequest,
    userId: signIn.staff.userId,
    metadata: {
      clientName,
      email: signIn.staff.email,
      role: signIn.staff.role,
    },
    scope: oauthRequest.scope,
    props: {
      userId: signIn.staff.userId,
      email: signIn.staff.email,
      fullName: signIn.staff.fullName,
      role: signIn.staff.role,
    },
  });

  return Response.redirect(redirectTo, 302);
}

/**
 * Everything the OAuth provider does not own: health, the sign-in page, and
 * the service lane for unattended automation.
 */
const defaultHandler = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    if (url.pathname === "/health") {
      return json(healthPayload(env));
    }

    if (url.pathname === "/svc/mcp" || url.pathname.startsWith("/svc/mcp/")) {
      return handleServiceMcp(request, env);
    }

    if (url.pathname === "/authorize") {
      return handleAuthorize(request, env);
    }

    return json({ error: "Not found" }, { status: 404 });
  },
};

const apiHandler = {
  fetch(request, env, ctx) {
    return handleOAuthMcp(request, env, ctx.props);
  },
};

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler,
  defaultHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});

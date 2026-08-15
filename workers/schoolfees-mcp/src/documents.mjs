/**
 * The client for the app's document bridge.
 *
 * This Worker cannot render a PDF — @react-pdf is Node-only and reads fonts off
 * the Vercel filesystem — so /api/service/documents renders and this fetches.
 *
 * Configuration is reported rather than hidden. A tool that vanishes because a
 * secret was forgotten looks to a user exactly like a tool that was never built;
 * one that fails loudly at call time can be diagnosed.
 */

import { toBase64 } from "./storage.mjs";

export const DOC_PROTOCOL = 1;

/** Bigger than this and the bytes stop being useful in a model's context. */
export const MAX_INLINE_BYTES = 3_000_000;

const REQUEST_TIMEOUT_MS = 25_000;

export function documentBridgeConfig(env) {
  const siteUrl = env.NEXT_PUBLIC_SITE_URL || null;
  const hasToken = Boolean(env.SCHOOLFEES_DOC_TOKEN);
  return {
    configured: Boolean(siteUrl && hasToken),
    siteUrl,
    hasToken,
    missing: [!siteUrl && "NEXT_PUBLIC_SITE_URL", !hasToken && "SCHOOLFEES_DOC_TOKEN"].filter(Boolean),
  };
}

export class DocumentBridgeError extends Error {
  constructor(message, { status = null, detail = null } = {}) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Fetches one rendered document. Returns the bytes plus what the app said about
 * them — the headers carry the subject and any flags (a reversed receipt), so a
 * caller can describe the document without parsing the PDF.
 */
export async function fetchDocument(env, { kind, id, actorLabel }) {
  const config = documentBridgeConfig(env);
  if (!config.configured) {
    throw new DocumentBridgeError(
      `The document bridge is not configured on this Worker. Missing: ${config.missing.join(", ")}. Set it with \`wrangler secret put SCHOOLFEES_DOC_TOKEN\` and redeploy.`,
    );
  }

  let response;
  try {
    response = await fetch(`${config.siteUrl.replace(/\/$/, "")}/api/service/documents`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.SCHOOLFEES_DOC_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ protocol: DOC_PROTOCOL, kind, id, actor: { label: actorLabel } }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new DocumentBridgeError(
      `Could not reach the document service: ${String(error?.message || error).slice(0, 200)}`,
    );
  }

  if (!response.ok) {
    let detail = null;
    try {
      detail = await response.json();
    } catch {
      detail = null;
    }
    if (response.status === 404) {
      throw new DocumentBridgeError(`No ${kind} found for "${id}".`, { status: 404, detail });
    }
    if (response.status === 413) {
      throw new DocumentBridgeError(
        `That document is too large to return inline (${detail?.bytes ?? "unknown"} bytes).`,
        { status: 413, detail },
      );
    }
    throw new DocumentBridgeError(
      `The document service refused the request (${response.status}): ${detail?.error ?? "unknown reason"}.`,
      { status: response.status, detail },
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_INLINE_BYTES) {
    throw new DocumentBridgeError(
      `That document is ${bytes.byteLength} bytes, over the ${MAX_INLINE_BYTES}-byte inline limit.`,
      { status: 413 },
    );
  }

  const header = (name) => response.headers.get(name) || null;
  const subject = header("x-document-subject");

  return {
    bytes,
    base64: toBase64(bytes),
    byteLength: bytes.byteLength,
    mimeType: response.headers.get("content-type") || "application/pdf",
    filename: header("x-document-filename"),
    subject: subject ? decodeURIComponent(subject) : null,
    sessionLabel: header("x-document-session"),
    documentNumber: header("x-document-number"),
    flags: (header("x-document-flags") || "").split(",").filter(Boolean),
  };
}

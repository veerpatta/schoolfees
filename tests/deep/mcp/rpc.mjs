/**
 * A JSON-RPC client for the Worker, in about eighty lines.
 *
 * No MCP SDK and no browser: the transport is
 * `WebStandardStreamableHTTPServerTransport` with `sessionIdGenerator: undefined`
 * and `enableJsonResponse: true`, which means it is stateless and a plain POST
 * with a JSON body is a complete, correct client. Adding Playwright here would
 * cost forty seconds of browser startup and buy nothing.
 *
 * `callTool` deliberately distinguishes three failures that look alike from the
 * outside and are completely different bugs:
 *   transport — HTTP was not 200 (auth, routing, a dead Worker)
 *   protocol  — JSON-RPC `error` (bad method, schema rejection)
 *   tool      — `result.isError` (the tool ran and refused)
 */

export class RpcError extends Error {
  constructor(kind, message, detail) {
    super(message);
    this.name = "RpcError";
    this.kind = kind;
    this.detail = detail;
  }
}

export function makeClient({ url, headers = {}, label }) {
  let requestId = 0;

  async function raw(method, params) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
    });

    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }

    return { status: response.status, body, text, headers: response.headers };
  }

  async function call(method, params) {
    const { status, body, text } = await raw(method, params);

    if (status !== 200) {
      throw new RpcError("transport", `${label}: HTTP ${status}`, text.slice(0, 300));
    }
    if (!body) {
      throw new RpcError("transport", `${label}: response was not JSON`, text.slice(0, 300));
    }
    if (body.error) {
      throw new RpcError("protocol", `${label}: ${body.error.message}`, body.error);
    }
    return body.result;
  }

  return {
    label,
    url,
    raw,
    call,

    async initialize() {
      return call("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "schoolfees-deep-harness", version: "1.0.0" },
      });
    },

    async listTools() {
      const result = await call("tools/list", {});
      return result.tools ?? [];
    },

    /** Returns `structuredContent`, or throws an RpcError of kind "tool". */
    async callTool(name, args = {}) {
      const result = await call("tools/call", { name, arguments: args });
      if (result?.isError) {
        throw new RpcError(
          "tool",
          `${label}: ${name} returned isError`,
          JSON.stringify(result.content).slice(0, 400),
        );
      }
      return result;
    },

    /** For negative cases: never throws, always reports what happened. */
    async tryCallTool(name, args = {}) {
      try {
        const result = await call("tools/call", { name, arguments: args });
        return { ok: !result?.isError, result, error: null };
      } catch (error) {
        return { ok: false, result: null, error };
      }
    },
  };
}

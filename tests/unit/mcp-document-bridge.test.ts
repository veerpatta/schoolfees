import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The document bridge client.
 *
 * The case that matters here was found in production, not in review: Next.js
 * serves its not-found page with **HTTP 200** and an HTML body, so an endpoint
 * that has not deployed yet looks like a success. `response.ok` was true, and the
 * tool returned 123 KB of an error page as `application/pdf` — an assistant
 * would have handed a parent a "receipt" that was a Next.js 404.
 */

const env = {
  NEXT_PUBLIC_SITE_URL: "https://schoolfees.test",
  SCHOOLFEES_DOC_TOKEN: "doc-token",
};

async function loadBridge() {
  return import(new URL("../../workers/schoolfees-mcp/src/documents.mjs", import.meta.url).href);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchDocument", () => {
  it("refuses an HTML body served with a 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!doctype html><html>not found</html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "x-matched-path": "/_not-found" },
      }),
    );
    const { fetchDocument, DocumentBridgeError } = await loadBridge();

    await expect(fetchDocument(env, { kind: "receipt", id: "SVP-1" })).rejects.toBeInstanceOf(
      DocumentBridgeError,
    );
    await expect(fetchDocument(env, { kind: "receipt", id: "SVP-1" })).rejects.toThrow(
      /not deployed yet|instead of a PDF/,
    );
  });

  it("refuses a PDF content type with no document marker header", async () => {
    // Something else on the domain answering with a PDF is still not our document.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([37, 80, 68, 70]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );
    const { fetchDocument } = await loadBridge();

    await expect(fetchDocument(env, { kind: "receipt", id: "SVP-1" })).rejects.toThrow(
      /instead of a PDF/,
    );
  });

  it("returns the bytes and the metadata the app reported", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([37, 80, 68, 70, 45, 49]), {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "x-document-kind": "receipt",
          "x-document-number": "SVP20260701-0002",
          "x-document-subject": encodeURIComponent("SIMRAN SOLANKI"),
          "x-document-session": "2026-27",
          "x-document-filename": "REVERSED-receipt-SVP20260701-0002.pdf",
          "x-document-flags": "reversed",
        },
      }),
    );
    const { fetchDocument } = await loadBridge();

    const document = await fetchDocument(env, { kind: "receipt", id: "SVP20260701-0002" });

    expect(document.documentNumber).toBe("SVP20260701-0002");
    // The subject is URL-encoded on the wire so a name with a space survives.
    expect(document.subject).toBe("SIMRAN SOLANKI");
    expect(document.flags).toEqual(["reversed"]);
    expect(document.byteLength).toBe(6);
    expect(document.base64).toBe(btoa("%PDF-1"));
  });

  it("says which variable is missing rather than failing vaguely", async () => {
    const { fetchDocument } = await loadBridge();

    await expect(
      fetchDocument({ NEXT_PUBLIC_SITE_URL: "https://schoolfees.test" }, { kind: "receipt", id: "x" }),
    ).rejects.toThrow(/SCHOOLFEES_DOC_TOKEN/);
  });
});

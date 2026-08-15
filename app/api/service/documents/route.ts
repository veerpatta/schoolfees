import { createAbsoluteUrl } from "@/lib/env";
import { isUuid } from "@/lib/helpers/uuid";
import { getReceiptDetailWith } from "@/lib/receipts/data";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Documents, for the MCP server.
 *
 * The MCP Worker cannot render a PDF: @react-pdf is Node-only, needs binary
 * font metrics, and reads the fonts and school mark off the Vercel filesystem.
 * So it asks here, server to server, and hands the bytes to whoever asked it.
 *
 * **This endpoint trusts its caller and does not re-check staff permissions.**
 * That is defensible only because the sole caller already holds
 * SUPABASE_SERVICE_ROLE_KEY and can read every row in the database directly —
 * the token buys it nothing it did not already have. Permission gating for
 * people lives in the Worker's `defineTool({ requires })`, which decides whether
 * a given staff member's role may call the tool at all. If a second, less
 * privileged caller is ever added, this comment stops being true and the
 * endpoint needs a real authorization model.
 *
 * Deliberately NOT reusing CRON_SECRET: two existing routes accept that one in a
 * query string, so it lands in access logs, and it also unlocks a write
 * endpoint. One leaked value should not open both "read every receipt" and
 * "mutate discount state".
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Bumped when the request or response contract changes. */
const PROTOCOL = 1;

/** Above this a document is not worth inlining into a model's context. */
const MAX_BYTES = 3_000_000;

const KINDS = ["receipt"] as const;
type Kind = (typeof KINDS)[number];

function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error, ...extra }, { status });
}

/**
 * Constant-time-ish comparison. Not a defence against a local attacker, but it
 * costs nothing and keeps the check from leaking length by early return.
 */
function tokensMatch(provided: string, expected: string) {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: Request) {
  const expected = process.env.SCHOOLFEES_DOC_TOKEN;
  if (!expected) {
    // Fails closed and says why, rather than 401-ing and looking like a bad token.
    return jsonError(503, "document bridge is not configured (SCHOOLFEES_DOC_TOKEN unset)");
  }

  const header = request.headers.get("authorization") ?? "";
  // Header only. No query-string form: the Worker controls its own requests, so
  // there is no reason to put the token anywhere it can be logged.
  if (!header.startsWith("Bearer ") || !tokensMatch(header.slice(7), expected)) {
    return jsonError(401, "unauthorized");
  }

  let body: { protocol?: number; kind?: string; id?: string; actor?: { label?: string } };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "body must be JSON");
  }

  if (body.protocol !== PROTOCOL) {
    return jsonError(400, "unsupported protocol", { supported: [PROTOCOL], received: body.protocol });
  }
  if (!body.kind || !KINDS.includes(body.kind as Kind)) {
    return jsonError(400, "unknown document kind", { supported: KINDS, received: body.kind ?? null });
  }
  if (!body.id || typeof body.id !== "string") {
    return jsonError(400, "id is required");
  }

  const startedAt = Date.now();

  try {
    // Service role: there is no cookie session here, and RLS would return
    // nothing without it.
    const supabase = createAdminClient();

    const receiptId = isUuid(body.id)
      ? body.id
      : await resolveReceiptIdByNumber(supabase, body.id);

    if (!receiptId) {
      return jsonError(404, "receipt not found", { id: body.id });
    }

    const receipt = await getReceiptDetailWith(supabase, receiptId);
    if (!receipt) {
      return jsonError(404, "receipt not found", { id: body.id });
    }

    const { renderReceiptPdf, receiptPdfFilename } = await import("@/lib/receipts/receipt-pdf");
    const buffer = await renderReceiptPdf({
      receipt,
      verifyUrl: createAbsoluteUrl(`/r/${encodeURIComponent(receipt.receiptNumber)}`),
    });

    if (buffer.byteLength > MAX_BYTES) {
      // The caller needs to know why it is getting metadata instead of a file.
      return jsonError(413, "document too large to return inline", {
        bytes: buffer.byteLength,
        limit: MAX_BYTES,
      });
    }

    const flags = [receipt.isVoided ? "reversed" : null].filter(Boolean).join(",");

    console.info("[service-documents]", {
      kind: body.kind,
      receiptNumber: receipt.receiptNumber,
      actor: body.actor?.label ?? "unknown",
      bytes: buffer.byteLength,
      ms: Date.now() - startedAt,
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${receiptPdfFilename(receipt)}"`,
        "Cache-Control": "no-store",
        "X-Document-Kind": "receipt",
        "X-Document-Filename": receiptPdfFilename(receipt),
        "X-Document-Subject": encodeURIComponent(receipt.studentFullName),
        "X-Document-Session": receipt.sessionLabel,
        "X-Document-Number": receipt.receiptNumber,
        ...(flags ? { "X-Document-Flags": flags } : {}),
      },
    });
  } catch (error) {
    console.error("[service-documents] failed", body.kind, body.id, error);
    return jsonError(500, "could not render the document");
  }
}

async function resolveReceiptIdByNumber(
  supabase: ReturnType<typeof createAdminClient>,
  receiptNumber: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("receipts")
    .select("id")
    .eq("receipt_number", receiptNumber)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

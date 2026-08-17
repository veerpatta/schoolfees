/**
 * Rendered documents, fetched from the app.
 *
 * Registered whether or not the bridge is configured. Hiding a tool because a
 * secret is missing makes a deployment mistake indistinguishable from a feature
 * that was never built; failing loudly at call time, with the name of the
 * missing variable, can be acted on.
 */

import * as z from "zod/v4";

import { documentBridgeConfig, DocumentBridgeError, fetchDocument } from "../documents.mjs";
import { detailObject } from "../schema.mjs";
import { defineTool, toolError } from "../toolkit.mjs";

function verifyLink(env, receiptNumber) {
  const base = (env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  return base && receiptNumber ? `${base}/r/${encodeURIComponent(receiptNumber)}` : null;
}

export function registerDocumentTools(server, ctx) {
  const { env, identity } = ctx;

  defineTool(server, ctx, {
    name: "get_receipt_pdf",
    title: "Get Receipt PDF",
    description:
      "Use this when someone needs the receipt itself — to send to a parent, attach to a message, or keep. Returns the rendered PDF. A reversed receipt is returned clearly marked as reversed rather than withheld.",
    // `receipts:print` rather than `receipts:view`: this produces the
    // parent-facing document, which is what print governs. A role that may look
    // a receipt up is not automatically one that may issue it.
    requires: ["receipts:print"],
    money: true,
    inputSchema: {
      receiptNumber: z
        .string()
        .max(64)
        .optional()
        .describe("Receipt number, e.g. SVP20260808-0004."),
      receiptId: z.string().uuid().optional().describe("Receipt UUID, if known."),
    },
    outputSchema: {
      receiptNumber: z.string().nullable().optional(),
      receiptId: z.string().nullable().optional(),
      document: detailObject.optional(),
      // The bridge config is echoed on failure so a missing token is
      // diagnosable from the response rather than from the Worker logs.
      bridge: detailObject.optional(),
      status: z.number().nullable().optional(),
      error: z.string().optional(),
    },
    handler: async ({ receiptNumber, receiptId }) => {
      const id = receiptId || receiptNumber;
      if (!id) {
        return toolError("Give either receiptNumber or receiptId.", {
          error: "receiptNumber or receiptId is required",
        });
      }

      try {
        const document = await fetchDocument(env, {
          kind: "receipt",
          id,
          actorLabel: identity?.email || identity?.kind || "mcp",
        });

        const reversed = document.flags.includes("reversed");
        const summary = reversed
          ? `Receipt ${document.documentNumber} for ${document.subject} — REVERSED. The PDF is marked accordingly and is not proof of payment.`
          : `Receipt ${document.documentNumber} for ${document.subject}, session ${document.sessionLabel}.`;

        return {
          content: [
            { type: "text", text: summary },
            {
              type: "resource",
              resource: {
                uri: `schoolfees://document/receipt/${document.documentNumber}.pdf`,
                mimeType: document.mimeType,
                blob: document.base64,
              },
            },
          ],
          structuredContent: {
            receiptNumber: document.documentNumber,
            studentName: document.subject,
            sessionLabel: document.sessionLabel,
            isReversed: reversed,
            filename: document.filename,
            byteLength: document.byteLength,
            mimeType: document.mimeType,
            links: {
              // Public, minimal-disclosure, safe to hand a parent.
              verify: verifyLink(env, document.documentNumber),
            },
            note: "The PDF is attached above as bytes. There is no public download URL for it, and there must not be one — a receipt carries the child's name, father's name, phone and full fee position.",
          },
        };
      } catch (error) {
        if (error instanceof DocumentBridgeError) {
          return {
            isError: true,
            content: [{ type: "text", text: error.message }],
            structuredContent: {
              error: error.message,
              status: error.status,
              bridge: documentBridgeConfig(env),
            },
          };
        }
        throw error;
      }
    },
  });
}

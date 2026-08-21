import type { NextRequest } from "next/server";

import { createAbsoluteUrl } from "@/platform/env";
import { isUuid } from "@/platform/helpers/uuid";
import { getReceiptDetail } from "@/modules/receipts/data/queries";
import { requireStaffPermission } from "@/platform/supabase/session";

/**
 * A receipt as a PDF, for staff.
 *
 * The receipt has always been printable from the browser; this is the same
 * document as a file, so it can be attached to a message or handed to a parent
 * who is not standing at the counter.
 *
 * Gated on `receipts:print` rather than `receipts:view`: this produces the
 * parent-facing artefact, which is what "print" governs. A role that may look a
 * receipt up is not automatically a role that may issue one.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ receiptId: string }> },
) {
  const { receiptId } = await params;

  // A non-UUID segment makes Postgres raise `invalid input syntax for type
  // uuid`, which would otherwise surface as a 500 for a mistyped URL.
  if (!isUuid(receiptId)) {
    return new Response("Receipt not found.", { status: 404 });
  }

  try {
    await requireStaffPermission("receipts:print");

    const receipt = await getReceiptDetail(receiptId);
    if (!receipt) {
      return new Response("Receipt not found.", { status: 404 });
    }

    // Dynamic import so a module-init failure (fonts, logo) is caught here
    // rather than crashing the function at load time.
    const { renderReceiptPdf, receiptPdfFilename } = await import("@/modules/receipts/domain/receipt-pdf");

    const buffer = await renderReceiptPdf({
      receipt,
      verifyUrl: createAbsoluteUrl(`/r/${encodeURIComponent(receipt.receiptNumber)}`),
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${receiptPdfFilename(receipt)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[receipt-pdf] failed for receipt", receiptId, error);
    return new Response("Could not generate the receipt PDF. Please try again.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

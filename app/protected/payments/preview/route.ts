import type { NextRequest } from "next/server";

import {
  getPaymentDateAwareInstallmentBalances,
  toFriendlyPaymentPreviewError,
} from "@/lib/payments/data";
import { requireStaffPermission } from "@/lib/supabase/session";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeStudentId(value: string | null) {
  const normalized = (value ?? "").trim();
  return UUID_PATTERN.test(normalized) ? normalized : "";
}

function normalizePaymentDate(value: string | null) {
  const normalized = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

export async function GET(request: NextRequest) {
  await requireStaffPermission("payments:view");
  const studentId = normalizeStudentId(request.nextUrl.searchParams.get("studentId"));
  const paymentDate = normalizePaymentDate(request.nextUrl.searchParams.get("paymentDate"));

  if (!studentId || !paymentDate) {
    return Response.json(
      { error: "Student and payment date are required for payment preview." },
      { status: 400 },
    );
  }

  try {
    const rows = await getPaymentDateAwareInstallmentBalances({ studentId, paymentDate });

    return Response.json(
      { rows, notice: rows.length === 0 ? "No pending dues for selected payment date." : null },
      // Audit 1.10 — Payment Desk preview must never serve a stale snapshot.
      // A 60s cache let an immediate second visit to the same student's
      // Payment Desk show pre-payment dues, inviting over-collection. The
      // student-summary endpoint can stay cached; the preview cannot.
      { headers: { "Cache-Control": "private, no-store, must-revalidate" } },
    );
  } catch (error) {
    const friendlyError = toFriendlyPaymentPreviewError(error);
    return Response.json(
      { error: friendlyError },
      { status: 503 },
    );
  }
}

import type { NextRequest } from "next/server";

import { getPaymentDeskStudentSummary } from "@/lib/payments/data";
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

function normalizeIncludeLatestReceipt(value: string | null) {
  return (value ?? "").trim().toLowerCase() !== "false";
}
function normalizeWhole(value: string | null) {
  const n = Number((value ?? "").trim());
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export async function GET(request: NextRequest) {
  await requireStaffPermission("payments:view");
  const studentId = normalizeStudentId(request.nextUrl.searchParams.get("studentId"));
  const paymentDate = normalizePaymentDate(request.nextUrl.searchParams.get("paymentDate"));
  const includeLatestReceipt = normalizeIncludeLatestReceipt(
    request.nextUrl.searchParams.get("includeLatestReceipt"),
  );
  const quickDiscountAmount = normalizeWhole(request.nextUrl.searchParams.get("quickDiscountAmount"));
  const quickLateFeeWaiverAmount = normalizeWhole(request.nextUrl.searchParams.get("quickLateFeeWaiverAmount"));

  if (!studentId || !paymentDate) {
    return Response.json(
      { error: "Student and payment date are required." },
      { status: 400 },
    );
  }

  try {
    const summary = await getPaymentDeskStudentSummary({
      studentId,
      paymentDate,
      autoPrepareMissingDues: true,
      includeLatestReceipt,
    });

    const pendingBeforeQuickDiscount = summary.student?.totalPending ?? 0;
    const revisedPendingBeforePayment = Math.max(
      pendingBeforeQuickDiscount - quickDiscountAmount - quickLateFeeWaiverAmount,
      0,
    );
    return Response.json({
      ...summary,
      payablePreview: {
        pendingBeforeQuickDiscount,
        quickDiscountApplied: quickDiscountAmount,
        lateFeeWaivedApplied: quickLateFeeWaiverAmount,
        revisedPendingBeforePayment,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load selected student summary.",
      },
      { status: 503 },
    );
  }
}

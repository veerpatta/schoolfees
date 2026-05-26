import type { NextRequest } from "next/server";

import { parseAcademicSessionLabel } from "@/lib/config/fee-rules";
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

function getSchoolDateStamp() {
  // School time zone (Asia/Kolkata) — same source-of-truth pattern as the
  // student detail page; keeps the default in sync with how staff see "today".
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeIncludeLatestReceipt(value: string | null) {
  return (value ?? "").trim().toLowerCase() !== "false";
}

function normalizeSessionLabel(value: string | null) {
  const normalized = (value ?? "").trim();

  if (!normalized) {
    return null;
  }

  try {
    return parseAcademicSessionLabel(normalized).normalizedLabel;
  } catch {
    return null;
  }
}

function normalizeWhole(value: string | null) {
  const n = Number((value ?? "").trim());
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function normalizeIncludeBreakdown(value: string | null) {
  return (value ?? "").trim().toLowerCase() !== "false";
}

export async function GET(request: NextRequest) {
  const t0 = performance.now();
  await requireStaffPermission("payments:view");
  const tAuth = performance.now() - t0;

  const studentId = normalizeStudentId(request.nextUrl.searchParams.get("studentId"));
  // Default to today (school time zone) when the caller omits paymentDate so
  // health checks and simple integrations can probe with studentId alone.
  const paymentDate =
    normalizePaymentDate(request.nextUrl.searchParams.get("paymentDate")) || getSchoolDateStamp();
  const includeLatestReceipt = normalizeIncludeLatestReceipt(
    request.nextUrl.searchParams.get("includeLatestReceipt"),
  );
  const includeBreakdown = normalizeIncludeBreakdown(
    request.nextUrl.searchParams.get("includeBreakdown"),
  );
  const sessionLabel = normalizeSessionLabel(request.nextUrl.searchParams.get("session"));
  const quickDiscountAmount = normalizeWhole(request.nextUrl.searchParams.get("quickDiscountAmount"));
  const quickLateFeeWaiverAmount = normalizeWhole(
    request.nextUrl.searchParams.get("quickLateFeeWaiverAmount"),
  );

  if (!studentId) {
    return Response.json(
      { error: "Student id is required." },
      { status: 400 },
    );
  }

  try {
    const tSummary0 = performance.now();
    const summary = await getPaymentDeskStudentSummary({
      studentId,
      paymentDate,
      sessionLabel: sessionLabel ?? undefined,
      autoPrepareMissingDues: true,
      includeLatestReceipt,
      includeBreakdown,
    });
    const tSummary = performance.now() - tSummary0;
    const tTotal = performance.now() - t0;

    const pendingBeforeQuickDiscount = summary.student?.totalPending ?? 0;
    const revisedPendingBeforePayment = Math.max(
      pendingBeforeQuickDiscount - quickDiscountAmount - quickLateFeeWaiverAmount,
      0,
    );
    return Response.json(
      {
        ...summary,
        payablePreview: {
          pendingBeforeQuickDiscount,
          quickDiscountApplied: quickDiscountAmount,
          lateFeeWaivedApplied: quickLateFeeWaiverAmount,
          revisedPendingBeforePayment,
        },
      },
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
          "Server-Timing": `auth;dur=${tAuth.toFixed(1)}, summary;dur=${tSummary.toFixed(1)}, total;dur=${tTotal.toFixed(1)}`,
        },
      },
    );
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

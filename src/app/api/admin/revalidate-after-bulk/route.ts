import { NextResponse } from "next/server";

import { parseAcademicSessionLabel } from "@/platform/config/fee-rules";
import { revalidateSessionFinance } from "@/modules/system-sync/domain/finance-revalidation";
import { drainFinancialViewRefresh } from "@/modules/system-sync/data/financial-view-refresh";

/**
 * Let a headless correction run ask the app to refresh what it has cached.
 *
 * A Node script cannot do either half of this itself. `revalidateTag` only
 * exists inside the Next.js process, and the matview refresh RPC is granted to
 * `service_role` but only ever drained from app code. So `bulk-apply.mjs` posts
 * here after `--apply`.
 *
 * The database is already correct by the time this is called — every balance is
 * derived from payments + adjustments, so a correction fixes the numbers the
 * moment its rows land. What is NOT correct is what the screens are holding:
 * `get_dashboard_summary` and `get_dashboard_analytics` are cached on
 * `session:{label}`, and the insert trigger only ENQUEUES the workbook matview
 * refresh. Skip this and the office reads pre-correction figures out of cache
 * while every direct query returns the corrected ones — which is exactly what
 * happened after the ₹54,225 discount-drift repair.
 *
 * This route only invalidates. It cannot write, and takes no ids it could write
 * with beyond the ones whose caches to drop.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorize(request: Request): { ok: boolean; reason?: string } {
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return { ok: false, reason: "CRON_SECRET env var not configured." };
  }

  const url = new URL(request.url);
  const provided =
    url.searchParams.get("secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (provided !== expectedSecret) {
    return { ok: false, reason: "Invalid or missing secret." };
  }

  return { ok: true };
}

export async function POST(request: Request) {
  const auth = authorize(request);

  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  let body: { sessionLabel?: unknown; studentIds?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }

  const sessionLabel = typeof body.sessionLabel === "string" ? body.sessionLabel.trim() : "";

  try {
    // Throws on anything that is not a real session label, so a typo busts
    // nothing rather than busting a tag no cache entry is keyed on.
    parseAcademicSessionLabel(sessionLabel);
  } catch {
    return NextResponse.json(
      { ok: false, error: "A valid sessionLabel is required." },
      { status: 400 },
    );
  }

  const studentIds = Array.isArray(body.studentIds)
    ? [...new Set(body.studentIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
    : [];

  // Drain BEFORE busting the tag. The other order re-populates the cache from a
  // matview that has not caught up yet, which reads as a cache bust that did
  // nothing — see the same ordering in admin-tools/session-health/actions.ts.
  await drainFinancialViewRefresh();
  revalidateSessionFinance(sessionLabel, studentIds);

  return NextResponse.json({
    ok: true,
    sessionLabel,
    studentsInvalidated: studentIds.length,
  });
}

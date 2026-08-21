import { NextResponse } from "next/server";

import { readerFromSearchParams } from "@/platform/navigation/search-params";
import { getReceiptsPage } from "@/lib/receipts/data";
import { normalizeReceiptFilters } from "@/lib/receipts/filters";
import { getViewSessionCookie } from "@/platform/session/cookie";
import { resolveViewSession } from "@/platform/session/resolver";
import { requireStaffPermission } from "@/platform/supabase/session";

function normalizePage(value: string | null) {
  if (!value) return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.floor(parsed);
}

export async function GET(request: Request) {
  await requireStaffPermission("receipts:view");

  const { searchParams } = new URL(request.url);
  const page = normalizePage(searchParams.get("page"));
  // The same normalizer the page uses, so the server-rendered first list and
  // the client's first refetch cannot disagree about what was asked for.
  const filters = normalizeReceiptFilters(readerFromSearchParams(searchParams));
  const viewSession = await resolveViewSession({
    searchParamSession: searchParams.get("session"),
    cookieSession: await getViewSessionCookie(),
  });

  const payload = await getReceiptsPage(
    filters.query,
    { page, pageSize: 30 },
    viewSession.sessionLabel,
    {
      ...filters,
      // Facet counts cost an extra pass, so they are only computed while the
      // filter sheet is actually open and showing them.
      withFacets: searchParams.get("facets") === "1",
    },
  );
  return NextResponse.json(payload);
}

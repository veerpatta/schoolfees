import { NextResponse } from "next/server";

import { getReceiptsPage } from "@/lib/receipts/data";
import { requireStaffPermission } from "@/lib/supabase/session";

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
  const query = (searchParams.get("query") ?? "").trim();
  const page = normalizePage(searchParams.get("page"));

  const payload = await getReceiptsPage(query, { page, pageSize: 30 });
  return NextResponse.json(payload);
}

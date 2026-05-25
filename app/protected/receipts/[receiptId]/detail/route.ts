import { NextResponse } from "next/server";

import { getReceiptDetail } from "@/lib/receipts/data";
import { requireStaffPermission } from "@/lib/supabase/session";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ receiptId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  await requireStaffPermission("receipts:view");

  const { receiptId } = await params;
  if (!uuidPattern.test(receiptId)) {
    return NextResponse.json({ error: "Invalid receipt id" }, { status: 400 });
  }

  const receipt = await getReceiptDetail(receiptId);
  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  return NextResponse.json(receipt);
}

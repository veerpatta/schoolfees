/**
 * Command-palette receipt search.
 *
 * GET /api/command/receipts?q=…
 *
 * Returns up to 8 receipts matching the query (receipt #, student name,
 * admission #). Gated by `receipts:view` — RLS handles the rest.
 */

import { NextResponse, type NextRequest } from "next/server";

import { getReceiptsList } from "@/lib/receipts/data";
import { requireStaffPermission } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CommandReceiptHit = {
  id: string;
  receiptNumber: string;
  studentLabel: string;
  amount: number;
  paymentDate: string | null;
};

export async function GET(request: NextRequest) {
  try {
    await requireStaffPermission("receipts:view", { onDenied: "throw" });
  } catch {
    return NextResponse.json(
      { items: [] satisfies CommandReceiptHit[] },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q")?.trim() ?? "";

  if (rawQuery.length < 2) {
    return NextResponse.json({ items: [] satisfies CommandReceiptHit[] });
  }

  const receipts = await getReceiptsList(rawQuery);

  const items: CommandReceiptHit[] = receipts.slice(0, 8).map((row) => ({
    id: row.id,
    receiptNumber: row.receiptNumber,
    studentLabel: `${row.studentFullName} · ${row.admissionNo}`,
    amount: row.totalAmount,
    paymentDate: row.paymentDate ?? null,
  }));

  return NextResponse.json({ items });
}

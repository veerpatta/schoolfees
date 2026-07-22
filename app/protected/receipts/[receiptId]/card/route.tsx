import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";

import { schoolProfile } from "@/lib/config/school";
import { getSiteUrl } from "@/lib/env";
import { formatInr } from "@/lib/helpers/currency";
import { formatMediumDate } from "@/lib/helpers/date";
import { getReceiptDetail } from "@/lib/receipts/data";
import { requireStaffPermission } from "@/lib/supabase/session";

/**
 * 1080×1080 PNG receipt card for WhatsApp sharing (Ledger Calm 2.0).
 *
 * Ink background, school brand, PAID badge, display amount, student/date/
 * receipt line, cleared-items summary, balance progress, verify URL. Staff
 * download this and attach it in WhatsApp alongside the wa.me text message.
 */

// Ink palette resolved to hex — ImageResponse has no CSS variables.
const INK = "#12161f"; // --nav 222 28% 10%
const INK_SURFACE = "#1b202c"; // --nav-surface
const INK_MUTED = "#aeaaa0"; // --nav-muted
const PAPER = "#f7f5ef";
const SAFFRON = "#c2410c"; // accent
const GREEN = "#2f9e63";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ receiptId: string }> },
) {
  await requireStaffPermission("receipts:view");

  const { receiptId } = await params;
  if (!isUuid(receiptId.trim())) {
    return NextResponse.json({ error: "Invalid receipt id" }, { status: 400 });
  }

  const receipt = await getReceiptDetail(receiptId.trim());
  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  const verifyUrl = `${getSiteUrl()}/r/${encodeURIComponent(receipt.receiptNumber)}`;
  const clearedLabels = receipt.breakdown.map((item) => item.installmentLabel);
  const clearedLine =
    clearedLabels.length > 0 ? clearedLabels.join(" · ") : "Fee payment";
  const paidShare =
    receipt.totalDue > 0
      ? Math.max(0, Math.min(1, receipt.totalPaidToDate / receipt.totalDue))
      : 1;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: INK,
          color: PAPER,
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>
              {schoolProfile.name}
            </div>
            <div style={{ marginTop: 10, display: "flex" }}>
              <div
                style={{
                  width: 140,
                  height: 6,
                  borderRadius: 4,
                  backgroundColor: SAFFRON,
                }}
              />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              backgroundColor: GREEN,
              color: "#ffffff",
              borderRadius: 999,
              padding: "16px 36px",
              fontSize: 40,
              fontWeight: 800,
              letterSpacing: 4,
            }}
          >
            PAID ✓
          </div>
        </div>

        {/* Amount */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 30, color: INK_MUTED, letterSpacing: 6 }}>
            FEE PAYMENT RECEIVED · शुल्क प्राप्त
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 132,
              fontWeight: 700,
              letterSpacing: -3,
            }}
          >
            {formatInr(receipt.totalAmount)}
          </div>
          <div style={{ marginTop: 10, fontSize: 34, color: INK_MUTED }}>
            {receipt.studentFullName} · {receipt.classLabel}
          </div>
          <div style={{ marginTop: 6, fontSize: 30, color: INK_MUTED }}>
            {formatMediumDate(receipt.paymentDate)} · Receipt {receipt.receiptNumber}
          </div>
        </div>

        {/* Cleared items + balance progress */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            backgroundColor: INK_SURFACE,
            borderRadius: 24,
            padding: 40,
          }}
        >
          <div style={{ fontSize: 30, fontWeight: 600 }}>{clearedLine}</div>
          <div
            style={{
              marginTop: 24,
              display: "flex",
              height: 16,
              borderRadius: 999,
              backgroundColor: "#2a3040",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.round(paidShare * 100)}%`,
                backgroundColor: GREEN,
                borderRadius: 999,
              }}
            />
          </div>
          <div
            style={{
              marginTop: 16,
              display: "flex",
              justifyContent: "space-between",
              fontSize: 28,
              color: INK_MUTED,
            }}
          >
            <div>
              Paid so far {formatInr(receipt.totalPaidToDate)} of {formatInr(receipt.totalDue)}
            </div>
            <div style={{ color: receipt.currentOutstanding > 0 ? "#e8b04b" : GREEN }}>
              {receipt.currentOutstanding > 0
                ? `Balance ${formatInr(receipt.currentOutstanding)}`
                : "All dues cleared"}
            </div>
          </div>
        </div>

        {/* Verify footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 26,
            color: INK_MUTED,
          }}
        >
          <div>Verify: {verifyUrl}</div>
          <div style={{ color: SAFFRON, fontWeight: 700 }}>
            {schoolProfile.shortName ?? "VPPS"}
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
    },
  );
}

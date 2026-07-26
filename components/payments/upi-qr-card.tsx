"use client";

import { useEffect, useState } from "react";

import { buildStudentFeeUpiPayment } from "@/lib/payments/upi";
import { cn } from "@/lib/utils";

/**
 * Show-the-parent-a-QR card on the payment mode step (template §COLLECT 3).
 *
 * What this does: renders a UPI intent QR for the amount already entered, so
 * the parent scans instead of the clerk reading a VPA aloud.
 *
 * What this deliberately does NOT do: confirm the payment. The prototype
 * claims the payment "confirms here automatically — no UTR typing", which
 * would need a payment-gateway webhook the school does not have. The clerk
 * still watches the parent's phone, then saves the receipt like any other
 * mode. The "no UTR typing" half is already true for a different reason —
 * reference is optional for every mode since 20260602042112.
 *
 * `qrcode` is imported lazily. It is ~230KB unpacked and the payments route
 * has a gzip budget in quality/route-bundle-baseline.json; pulling it into
 * the initial chunk to serve one optional panel would spend that budget on
 * clerks who take cash.
 */
export function UpiQrCard({
  admissionNo,
  amount,
  title,
  subtitle,
  className,
}: {
  admissionNo: string;
  amount: number;
  title: string;
  subtitle: string;
  className?: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const payment = buildStudentFeeUpiPayment({ admissionNo, amount });

  useEffect(() => {
    if (payment.amount <= 0) {
      setSvg(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { toString: toQrString } = await import("qrcode");
        const markup = await toQrString(payment.uri, {
          type: "svg",
          margin: 0,
          errorCorrectionLevel: "M",
          // Explicit black-on-white. A QR only scans reliably at high
          // contrast, so this panel does not inherit the app's ink surface
          // however dark the surrounding card is.
          color: { dark: "#000000", light: "#ffffff" },
        });
        if (!cancelled) setSvg(markup);
      } catch {
        // A QR that fails to render must not block the collection — the mode
        // buttons and Save are untouched, the clerk just reads out the VPA.
        if (!cancelled) setSvg(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [payment.uri, payment.amount]);

  if (payment.amount <= 0) return null;

  return (
    <div
      className={cn(
        "anim-settle-in flex items-center gap-3.5 rounded-[18px] border border-border bg-card p-4",
        className,
      )}
    >
      {/* White plate, always — a QR is scanned by a camera, not read by a
          person, so it does not follow the theme. In dark mode an ink tile
          would make it unscannable. */}
      <div className="grid size-[88px] shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-white p-1.5">
        {svg ? (
          <span
            aria-hidden="true"
            className="[&>svg]:size-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <span className="text-center text-[9px] font-extrabold leading-tight text-muted-foreground">
            UPI
            <br />
            QR
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-extrabold text-foreground">{title}</p>
        <p className="mobile-row-meta mt-0.5 leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

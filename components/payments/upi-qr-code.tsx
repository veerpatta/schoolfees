"use client";

import { useEffect, useState } from "react";

type Props = {
  value: string;
  alt: string;
  className?: string;
};

export function UpiQrCode({ value, alt, className }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    import("qrcode")
      .then((qr) =>
        qr.toDataURL(value, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 220,
        }),
      )
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!src) {
    return (
      <div
        className={className}
        role="img"
        aria-label={alt}
      />
    );
  }

  return (
    // QR is generated locally from the UPI URI; no external image service is used.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  );
}

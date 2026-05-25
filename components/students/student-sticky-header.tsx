"use client";

import { useEffect, useState } from "react";

import { formatInr } from "@/lib/helpers/currency";
import { cn } from "@/lib/utils";

type StudentStickyHeaderProps = {
  fullName: string;
  classLabel: string;
  admissionNo: string;
  outstandingAmount: number;
};

export function StudentStickyHeader({
  fullName,
  classLabel,
  admissionNo,
  outstandingAmount,
}: StudentStickyHeaderProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 280);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const tone =
    outstandingAmount > 0
      ? "text-warning-soft-foreground"
      : "text-success-soft-foreground";

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "sticky top-14 z-30 -mx-4 sm:-mx-6 lg:-mx-8 border-b border-border bg-card/95 backdrop-blur transition-all duration-150 no-print",
        visible ? "opacity-100 translate-y-0" : "pointer-events-none -translate-y-1 opacity-0",
      )}
    >
      <div className="mx-auto flex items-center gap-3 px-4 py-2 text-xs sm:px-6 lg:px-8">
        <span className="truncate font-semibold text-foreground">{fullName}</span>
        <span className="hidden sm:inline text-muted-foreground">·</span>
        <span className="hidden sm:inline truncate text-muted-foreground">{classLabel}</span>
        <span className="hidden md:inline text-muted-foreground">·</span>
        <span className="hidden md:inline font-mono text-muted-foreground">SR {admissionNo}</span>
        <span className="ml-auto shrink-0 font-semibold tabular-nums">
          <span className="text-muted-foreground">Pending </span>
          <span className={tone}>{formatInr(outstandingAmount)}</span>
        </span>
      </div>
    </div>
  );
}

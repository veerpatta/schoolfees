"use client";

import { useTranslations } from "next-intl";
import { CalendarCheck2, CalendarClock, CalendarX2 } from "lucide-react";

import type { PromiseStatus } from "@/lib/defaulters/types";
import { cn } from "@/lib/utils";

const STYLE: Record<PromiseStatus, { i18nKey: string; cls: string; Icon: typeof CalendarCheck2 }> = {
  kept: {
    i18nKey: "promiseKept",
    cls: "border-success-soft-foreground/30 bg-success-soft text-success-soft-foreground",
    Icon: CalendarCheck2,
  },
  broken: {
    i18nKey: "promiseBroken",
    cls: "border-destructive/30 bg-destructive/10 text-destructive",
    Icon: CalendarX2,
  },
  pending: {
    i18nKey: "promisePending",
    cls: "border-info-soft bg-info-soft text-info-soft-foreground",
    Icon: CalendarClock,
  },
};

/** Chip showing whether the parent kept, broke, or has a pending payment promise. */
export function PromiseChip({
  status,
  className,
}: {
  status: PromiseStatus | null | undefined;
  className?: string;
}) {
  const t = useTranslations("Defaulters");
  if (!status) return null;
  const style = STYLE[status];
  const Icon = style.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        style.cls,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {t(style.i18nKey)}
    </span>
  );
}

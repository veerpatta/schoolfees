"use client";

import { useTranslations } from "next-intl";
import {
  AlarmClock,
  CircleHelp,
  PhoneOff,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import type { PaymentBehavior } from "@/lib/defaulters/behavior";
import { cn } from "@/lib/utils";

const STYLE: Record<
  PaymentBehavior,
  { i18nKey: string; cls: string; Icon: typeof ShieldCheck }
> = {
  reliable: {
    i18nKey: "behaviorReliable",
    cls: "border-success-soft-foreground/30 bg-success-soft text-success-soft-foreground",
    Icon: ShieldCheck,
  },
  delays_but_pays: {
    i18nKey: "behaviorDelaysButPays",
    cls: "border-warning-soft-foreground/30 bg-warning-soft text-warning-soft-foreground",
    Icon: AlarmClock,
  },
  chronic: {
    i18nKey: "behaviorChronic",
    cls: "border-destructive/30 bg-destructive/10 text-destructive",
    Icon: TriangleAlert,
  },
  non_responsive: {
    i18nKey: "behaviorNonResponsive",
    cls: "border-border bg-surface-2 text-muted-foreground",
    Icon: PhoneOff,
  },
  new: {
    i18nKey: "behaviorNew",
    cls: "border-info-soft bg-info-soft text-info-soft-foreground",
    Icon: CircleHelp,
  },
};

/** Small colour-coded chip describing a parent's payment temperament. */
export function BehaviorBadge({
  behavior,
  className,
}: {
  behavior: PaymentBehavior | undefined;
  className?: string;
}) {
  const t = useTranslations("Defaulters");
  if (!behavior) return null;
  const style = STYLE[behavior];
  const Icon = style.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        style.cls,
        className,
      )}
      title={t(`${style.i18nKey}Hint`)}
    >
      <Icon className="size-3" aria-hidden="true" />
      {t(style.i18nKey)}
    </span>
  );
}

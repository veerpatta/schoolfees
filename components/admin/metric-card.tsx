import { ReactNode } from "react";

import { KpiCard } from "@/components/ui/kpi-card";

type MetricCardProps = {
  title: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Optional accent rule on the left edge. */
  accent?: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
  trailing?: ReactNode;
  /** Optional drill-down href — turns the card into a clickable link. */
  href?: string;
  className?: string;
};

/** Backwards-compatible wrapper. New code should use `KpiCard` directly. */
export function MetricCard({ title, value, hint, accent, trailing, href, className }: MetricCardProps) {
  return (
    <KpiCard
      label={title}
      value={value}
      hint={hint}
      accent={accent}
      trailing={trailing}
      href={href}
      className={className}
    />
  );
}

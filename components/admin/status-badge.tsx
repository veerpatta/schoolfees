import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusTone = "good" | "warning" | "neutral" | "accent";

type StatusBadgeProps = {
  label: string;
  tone?: StatusTone;
};

const toneClasses: Record<StatusTone, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  accent: "border-rose-200 bg-rose-50 text-rose-700",
};

export function StatusBadge({
  label,
  tone = "neutral",
}: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full px-3 py-1 font-medium", toneClasses[tone])}
    >
      {label}
    </Badge>
  );
}

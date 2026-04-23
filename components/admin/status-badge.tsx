import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusTone = "good" | "warning" | "neutral" | "accent";

type StatusBadgeProps = {
  label: string;
  tone?: StatusTone;
};

const toneClasses: Record<StatusTone, string> = {
  good: "border-emerald-200/90 bg-emerald-50/90 text-emerald-700",
  warning: "border-amber-200/90 bg-amber-50/90 text-amber-800",
  neutral: "border-slate-200/90 bg-white/85 text-slate-700",
  accent: "border-sky-200/90 bg-sky-50/95 text-sky-700",
};

export function StatusBadge({
  label,
  tone = "neutral",
}: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-3 py-1 font-medium shadow-none backdrop-blur-sm",
        toneClasses[tone],
      )}
    >
      {label}
    </Badge>
  );
}

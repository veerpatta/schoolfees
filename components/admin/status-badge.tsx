import { Badge } from "@/components/ui/badge";

type StatusTone = "good" | "warning" | "neutral" | "accent" | "danger" | "info";

type StatusBadgeProps = {
  label: string;
  tone?: StatusTone;
  /** Hide the leading dot. */
  iconless?: boolean;
};

const toneToVariant: Record<StatusTone, React.ComponentProps<typeof Badge>["variant"]> = {
  good: "success",
  warning: "warning",
  neutral: "neutral",
  accent: "accent",
  danger: "danger",
  info: "info",
};

export function StatusBadge({ label, tone = "neutral", iconless }: StatusBadgeProps) {
  return (
    <Badge variant={toneToVariant[tone]} dot={!iconless}>
      {label}
    </Badge>
  );
}

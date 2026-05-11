import { AlertTriangle, CheckCircle2, Info, ShieldAlert, XCircle } from "lucide-react";
import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

type NoticeTone = "info" | "success" | "warning" | "danger" | "neutral";

type NoticeProps = {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Optional inline action(s) — typically a Button or Link. */
  action?: ReactNode;
  className?: string;
  /** Hide the leading icon. */
  iconless?: boolean;
};

const toneStyles: Record<NoticeTone, { wrap: string; icon: typeof Info }> = {
  info: {
    wrap: "bg-info-soft text-info-soft-foreground",
    icon: Info,
  },
  success: {
    wrap: "bg-success-soft text-success-soft-foreground",
    icon: CheckCircle2,
  },
  warning: {
    wrap: "bg-warning-soft text-warning-soft-foreground",
    icon: AlertTriangle,
  },
  danger: {
    wrap: "bg-destructive-soft text-destructive-soft-foreground",
    icon: XCircle,
  },
  neutral: {
    wrap: "bg-surface-2 text-foreground",
    icon: ShieldAlert,
  },
};

export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
  iconless = false,
}: NoticeProps) {
  const { wrap, icon: Icon } = toneStyles[tone];

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex w-full items-start gap-3 rounded-md px-4 py-3 text-sm leading-6",
        wrap,
        className,
      )}
    >
      {!iconless ? (
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : null}
      <div className="min-w-0 flex-1">
        {title ? (
          <p className="font-semibold leading-5">{title}</p>
        ) : null}
        {children ? (
          <div className={cn("text-current/85", title && "mt-0.5")}>
            {children}
          </div>
        ) : null}
      </div>
      {action ? <div className="ml-2 shrink-0">{action}</div> : null}
    </div>
  );
}

import Image from "next/image";

import { schoolProfile } from "@/lib/config/school";
import { cn } from "@/lib/utils";

type SchoolBrandProps = {
  className?: string;
  variant?: "hero" | "sidebar" | "sidebar-ink" | "compact" | "icon";
  priority?: boolean;
};

const variantStyles = {
  hero: {
    root: "gap-4",
    frame: "size-16 rounded-xl p-1.5 shadow-sm",
    eyebrow: "text-[10px] font-semibold uppercase tracking-[0.16em] text-accent",
    title: "mt-1 font-display text-2xl font-semibold tracking-tight text-foreground",
    subtitle: "mt-0.5 text-sm leading-6 text-muted-foreground",
  },
  sidebar: {
    root: "gap-3",
    frame: "size-11 rounded-lg p-1 shadow-xs",
    eyebrow: "text-[10px] font-semibold uppercase tracking-[0.14em] text-accent",
    title: "mt-0.5 font-display text-[15px] font-semibold leading-tight tracking-tight text-foreground",
    subtitle: "mt-0.5 text-[11px] leading-4 text-muted-foreground",
  },
  "sidebar-ink": {
    root: "gap-3",
    frame: "size-11 rounded-lg p-1 shadow-xs",
    eyebrow: "text-[10px] font-semibold uppercase tracking-[0.14em] text-accent",
    title: "mt-0.5 font-display text-[15px] font-semibold leading-tight tracking-tight text-nav-foreground",
    subtitle: "mt-0.5 text-[11px] leading-4 text-nav-muted",
  },
  compact: {
    root: "gap-2.5",
    frame: "size-10 rounded-md p-1 shadow-xs",
    eyebrow: "text-[10px] font-semibold uppercase tracking-[0.14em] text-accent",
    title: "font-display text-sm font-semibold leading-tight tracking-tight text-foreground",
    subtitle: "text-[11px] leading-4 text-muted-foreground",
  },
  icon: {
    root: "gap-0",
    frame: "size-11 rounded-lg p-0.5 shadow-sm",
    eyebrow: "",
    title: "",
    subtitle: "",
  },
} as const;

export function SchoolBrand({
  className,
  variant = "compact",
  priority = false,
}: SchoolBrandProps) {
  const style = variantStyles[variant];

  return (
    <div className={cn("flex items-center", style.root, className)}>
      <div
        className={cn(
          "shrink-0 overflow-hidden border",
          variant === "sidebar-ink" ? "border-nav-border bg-nav-surface" : "border-border bg-surface",
          style.frame,
        )}
      >
        <Image
          src="/branding/veer-patta-school-logo.jpg"
          alt={`${schoolProfile.name} logo`}
          width={96}
          height={96}
          priority={priority}
          className="h-full w-full object-contain"
        />
      </div>

      {variant === "icon" ? null : (
        <div className="min-w-0">
          <p className={style.eyebrow}>VPPS · Fee Office</p>
          <h2 className={style.title}>Fee Management</h2>
          <p className={style.subtitle}>{schoolProfile.shortName ?? "Veer Patta School"}</p>
        </div>
      )}
    </div>
  );
}

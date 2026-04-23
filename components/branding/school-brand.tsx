import Image from "next/image";

import { schoolProfile } from "@/lib/config/school";
import { cn } from "@/lib/utils";

type SchoolBrandProps = {
  className?: string;
  variant?: "hero" | "sidebar" | "compact" | "icon";
  priority?: boolean;
};

const variantStyles = {
  hero: {
    root: "gap-4",
    frame: "size-20 rounded-[28px] p-2.5 shadow-[0_24px_60px_-28px_rgba(37,99,235,0.5)]",
    eyebrow:
      "text-[0.65rem] font-semibold uppercase tracking-[0.34em] text-sky-600/90",
    title: "mt-1 font-heading text-2xl font-semibold tracking-tight text-slate-950",
    subtitle: "mt-1 text-sm leading-6 text-slate-600",
  },
  sidebar: {
    root: "gap-3",
    frame: "size-14 rounded-[22px] p-2 shadow-[0_18px_44px_-24px_rgba(37,99,235,0.45)]",
    eyebrow:
      "text-[0.6rem] font-semibold uppercase tracking-[0.32em] text-sky-600/90",
    title: "mt-1 font-heading text-base font-semibold tracking-tight text-slate-950",
    subtitle: "mt-1 text-xs leading-5 text-slate-600",
  },
  compact: {
    root: "gap-3",
    frame: "size-12 rounded-[20px] p-1.5 shadow-[0_16px_36px_-24px_rgba(37,99,235,0.45)]",
    eyebrow:
      "text-[0.58rem] font-semibold uppercase tracking-[0.3em] text-sky-600/90",
    title: "mt-0.5 font-heading text-sm font-semibold tracking-tight text-slate-950",
    subtitle: "mt-0.5 text-xs leading-5 text-slate-600",
  },
  icon: {
    root: "gap-0",
    frame: "size-11 rounded-[18px] p-1.5 shadow-[0_14px_30px_-22px_rgba(37,99,235,0.4)]",
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
          "shrink-0 overflow-hidden border border-white/80 bg-white/95 ring-1 ring-sky-100/80",
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
          <p className={style.eyebrow}>Internal Admin</p>
          <h2 className={style.title}>Veer Patta Fee Admin</h2>
          <p className={style.subtitle}>Shri Veer Patta Senior Secondary School</p>
        </div>
      )}
    </div>
  );
}

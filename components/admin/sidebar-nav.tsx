"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  getProtectedNavigationItem,
  getVisibleProtectedNavigation,
} from "@/lib/config/navigation";
import { type StaffRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

type SidebarNavProps = {
  staffRole: StaffRole;
  mode?: "sidebar" | "topbar";
  className?: string;
};

export function SidebarNav({
  staffRole,
  mode = "sidebar",
  className,
}: SidebarNavProps) {
  const pathname = usePathname();
  const activeItem = getProtectedNavigationItem(pathname);
  const navigationItems = getVisibleProtectedNavigation(staffRole);
  const isTopbar = mode === "topbar";

  return (
    <nav
      className={cn(
        isTopbar
          ? "grid grid-cols-2 gap-2 sm:grid-cols-3"
          : "space-y-2",
        className,
      )}
    >
      {navigationItems.map((item) => {
        const active = activeItem?.href === item.href;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group transition-all duration-200",
              isTopbar
                ? "flex w-full flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-center text-[11px] leading-4 shadow-[0_12px_26px_-22px_rgba(15,23,42,0.35)]"
                : "flex items-start gap-3 rounded-[24px] border px-3.5 py-3.5",
              active
                ? "border-transparent bg-[linear-gradient(135deg,#1d4ed8_0%,#0ea5e9_100%)] text-white shadow-[0_20px_50px_-30px_rgba(37,99,235,0.8)]"
                : "border-white/70 bg-white/80 text-slate-700 hover:-translate-y-0.5 hover:border-sky-100 hover:bg-sky-50/70",
            )}
          >
            <div
              className={cn(
                "rounded-2xl p-2",
                !isTopbar && "mt-0.5",
                active
                  ? "bg-white/12 text-slate-100"
                  : "bg-sky-50 text-sky-700 group-hover:bg-white group-hover:text-sky-700",
              )}
            >
              <Icon className="size-4" />
            </div>
            {isTopbar ? (
              <span className="text-[11px] font-medium leading-4">
                {item.label}
              </span>
            ) : (
              <div className="min-w-0">
                <span className="block min-w-0 font-heading text-sm font-semibold leading-5">
                  {item.label}
                </span>
                <span
                  className={cn(
                    "mt-1 block text-xs leading-5",
                    active ? "text-sky-50/92" : "text-slate-500",
                  )}
                >
                  {item.description}
                </span>
              </div>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

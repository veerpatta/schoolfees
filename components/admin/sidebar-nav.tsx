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
        isTopbar ? "grid grid-cols-2 gap-2 sm:grid-cols-4" : "space-y-1",
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
              "group transition-colors duration-150",
              isTopbar
                ? "flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-center text-[11px] leading-4"
                : "flex items-center gap-2.5 rounded-lg border px-3 py-2",
              active
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            <div
              className={cn(
                "rounded-md p-1.5",
                active
                  ? "bg-white/10 text-slate-100"
                  : "bg-slate-100 text-slate-700 group-hover:bg-white",
              )}
            >
              <Icon className="size-4" />
            </div>
            {isTopbar ? (
              <span className="text-[11px] font-medium leading-4">
                {item.label}
              </span>
            ) : (
              <div className="min-w-0 flex-1">
                <span className="block min-w-0 truncate font-heading text-sm font-semibold leading-5">
                  {item.label}
                </span>
              </div>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

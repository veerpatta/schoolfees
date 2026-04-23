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
          ? "flex gap-2 overflow-x-auto pb-1"
          : "space-y-1.5",
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
              "group transition",
              isTopbar
                ? "flex min-w-fit items-center gap-2 rounded-full border px-3 py-2 text-sm"
                : "flex items-center gap-3 rounded-xl border px-3 py-2.5",
              active
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            <div
              className={cn(
                "rounded-full p-1.5",
                !isTopbar && "mt-0.5",
                active
                  ? "bg-white/10 text-slate-100"
                  : "bg-slate-100 text-slate-500 group-hover:text-slate-900",
              )}
            >
              <Icon className="size-4" />
            </div>
            {isTopbar ? (
              <span className="whitespace-nowrap text-sm font-medium">
                {item.label}
              </span>
            ) : (
              <span className="min-w-0 text-sm font-semibold leading-5">{item.label}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

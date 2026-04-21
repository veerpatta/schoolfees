"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  getProtectedNavigationItem,
  protectedNavigation,
} from "@/lib/config/navigation";
import { cn } from "@/lib/utils";

type SidebarNavProps = {
  mode?: "sidebar" | "topbar";
  className?: string;
};

export function SidebarNav({
  mode = "sidebar",
  className,
}: SidebarNavProps) {
  const pathname = usePathname();
  const activeItem = getProtectedNavigationItem(pathname);
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
      {protectedNavigation.map((item) => {
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
                : "flex items-start gap-3 rounded-xl border px-3 py-3",
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
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-5">{item.label}</p>
                <p
                  className={cn(
                    "mt-0.5 text-xs leading-5",
                    active ? "text-slate-200" : "text-slate-500",
                  )}
                >
                  {item.description}
                </p>
              </div>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

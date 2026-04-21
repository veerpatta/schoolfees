"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { protectedNavigation } from "@/lib/config/navigation";
import { cn } from "@/lib/utils";

function isActiveRoute(pathname: string, href: string) {
  if (href === "/protected") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-2">
      {protectedNavigation.map((item) => {
        const active = isActiveRoute(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group flex items-start gap-3 rounded-2xl border px-3 py-3 transition",
              active
                ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-300/40"
                : "border-slate-200/70 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            <div
              className={cn(
                "mt-0.5 rounded-full p-1.5",
                active
                  ? "bg-white/10 text-amber-300"
                  : "bg-slate-100 text-slate-500 group-hover:text-slate-900",
              )}
            >
              <Icon className="size-4" />
            </div>
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
          </Link>
        );
      })}
    </nav>
  );
}

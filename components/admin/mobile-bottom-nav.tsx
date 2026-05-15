"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { type StaffRole } from "@/lib/auth/roles";
import { getMobileBottomNavigation } from "@/lib/config/navigation";
import { appendCurrentSessionParam } from "@/lib/navigation/session-href";
import { cn } from "@/lib/utils";

type MobileBottomNavProps = {
  staffRole: StaffRole;
};

export function MobileBottomNav({ staffRole }: MobileBottomNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const items = getMobileBottomNavigation(staffRole).slice(0, 5);

  return (
    <nav
      aria-label="Primary navigation"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur",
        "px-2 pb-1 pt-1.5 mobile-safe-bottom-padding",
        "print:hidden md:hidden landscape:py-1",
      )}
    >
      <div
        className="mx-auto grid max-w-7xl gap-0.5"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const href = appendCurrentSessionParam(item.href, searchParams);

          return (
            <Link
              key={item.href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md px-1 py-1.5 text-xs font-medium leading-tight transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              <span className="mt-0.5 max-w-full truncate">{item.label}</span>
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -top-px left-1/2 h-[2px] w-8 -translate-x-1/2 rounded-full transition-colors",
                  active ? "bg-accent" : "bg-transparent",
                )}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

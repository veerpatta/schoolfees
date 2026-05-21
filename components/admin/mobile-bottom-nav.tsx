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
  const items = getMobileBottomNavigation(staffRole)
    .slice(0, 5)
    .map((item) => {
      if (item.label === "Dues") return { ...item, label: "Defaulters" };
      if (item.label === "Receipts") return { ...item, label: "History" };
      return item;
    });

  return (
    <nav
      aria-label="Primary navigation"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur",
        "min-h-[var(--mobile-bottom-nav-height)] px-2 pb-1 pt-1.5 mobile-safe-bottom-padding",
        "print:hidden md:hidden landscape:min-h-12 landscape:py-1",
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
              className="relative flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md px-1 py-1 transition-colors"
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full transition-all duration-200",
                  active ? "bg-accent/12" : "",
                )}
              >
                <Icon
                  className={cn(
                    "size-5",
                    active ? "text-accent" : "text-muted-foreground/70",
                  )}
                  aria-hidden="true"
                />
              </span>
              <span
                className={cn(
                  "mt-0.5 max-w-full truncate text-[10px] font-medium transition-colors",
                  active ? "text-accent" : "text-muted-foreground/70",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

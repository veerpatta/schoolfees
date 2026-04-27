"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { type StaffRole } from "@/lib/auth/roles";
import { getMobileBottomNavigation, getVisibleProtectedNavigation } from "@/lib/config/navigation";

type MobileBottomNavProps = {
  staffRole: StaffRole;
};

export function MobileBottomNav({ staffRole }: MobileBottomNavProps) {
  const pathname = usePathname();
  const primaryMobileItems = getMobileBottomNavigation(staffRole);
  const allItems = getVisibleProtectedNavigation(staffRole);
  const primarySet = new Set(primaryMobileItems.map((item) => item.href));
  const moreItems = allItems.filter(
    (item) => !primarySet.has(item.href) && item.href !== "/protected/transactions",
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur print:hidden md:hidden mobile-safe-bottom-padding">
      <div
        className="mx-auto grid max-w-7xl gap-1"
        style={{ gridTemplateColumns: `repeat(${primaryMobileItems.length + 1}, minmax(0, 1fr))` }}
      >
        {primaryMobileItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-11 flex-col items-center justify-center rounded-xl px-1 py-1 text-[11px] ${
                active ? "bg-sky-100 text-sky-900" : "text-slate-700"
              }`}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <details className="relative">
          <summary className="flex min-h-11 cursor-pointer list-none flex-col items-center justify-center rounded-xl text-[11px] text-slate-700">
            <span className="text-base leading-none">⋯</span>
            <span>More</span>
          </summary>
          <div className="absolute bottom-14 right-0 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            {moreItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </details>
      </div>
    </nav>
  );
}

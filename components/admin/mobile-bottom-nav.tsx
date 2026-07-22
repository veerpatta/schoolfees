"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Ellipsis, X } from "lucide-react";

import { type StaffRole } from "@/lib/auth/roles";
import {
  getMobileBottomNavigation,
  getVisibleProtectedNavigation,
} from "@/lib/config/navigation";
import { appendCurrentSessionParam } from "@/lib/navigation/session-href";
import { cn } from "@/lib/utils";

type MobileBottomNavProps = {
  staffRole: StaffRole;
};

export function MobileBottomNav({ staffRole }: MobileBottomNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const t = useTranslations("Navigation");
  const translateLabel = (item: { label: string; i18nKey?: string }) =>
    item.i18nKey ? t(item.i18nKey) : item.label;
  const primaryItems = getMobileBottomNavigation(staffRole).slice(0, 4);
  const moduleItems = useMemo(
    () => getVisibleProtectedNavigation(staffRole),
    [staffRole],
  );
  const primaryHrefs = new Set(primaryItems.map((item) => item.href));
  const overflowIsActive = moduleItems.some((item) => {
    if (primaryHrefs.has(item.href)) return false;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  });
  const items = [
    ...primaryItems,
    {
      href: "#more",
      label: t("more"),
      icon: Ellipsis,
      isOverflow: true,
    },
  ];

  useEffect(() => {
    if (!overflowOpen) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOverflowOpen(false);
      }
    }
    window.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [overflowOpen]);

  return (
    <>
      {overflowOpen ? (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur print:hidden md:hidden">
          <div className="flex h-full flex-col pb-[calc(var(--mobile-bottom-nav-offset)+0.75rem)]">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{t("more")}</p>
                <p className="text-xs text-muted-foreground">{t("moreDescription")}</p>
              </div>
              <button
                type="button"
                aria-label={t("closeMore")}
                className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
                onClick={() => setOverflowOpen(false)}
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="grid flex-1 content-start gap-2 overflow-y-auto px-4 py-4">
              {moduleItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const href = appendCurrentSessionParam(item.href, searchParams);

                return (
                  <Link
                    key={item.href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOverflowOpen(false)}
                    className={cn(
                      "flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors",
                      active && "bg-accent/10 text-accent",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex size-10 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground",
                        active && "bg-accent/10 text-accent",
                      )}
                    >
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">
                        {translateLabel(item)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <nav
        aria-label={t("primaryNavLabel")}
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
            const active = "isOverflow" in item && item.isOverflow
              ? overflowOpen || overflowIsActive
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const href = "isOverflow" in item && item.isOverflow
              ? undefined
              : appendCurrentSessionParam(item.href, searchParams);
            // Collect is THE action of this app — it stays a filled saffron
            // pill in every state so the thumb always knows where money goes.
            const isCollect =
              !("isOverflow" in item && item.isOverflow) &&
              item.href === "/protected/payments";
            const content = (
              <>
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg transition-all duration-200",
                    isCollect
                      ? "h-8 w-12 rounded-full bg-accent text-accent-foreground shadow-sm"
                      : active
                        ? "bg-accent/10 text-accent"
                        : "text-muted-foreground/70",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span
                  className={cn(
                    "mt-0.5 max-w-full truncate text-[10px] font-medium transition-colors",
                    isCollect || active ? "text-accent" : "text-muted-foreground/70",
                    isCollect && "font-semibold",
                  )}
                >
                  {"isOverflow" in item && item.isOverflow
                    ? item.label
                    : translateLabel(item as { label: string; i18nKey?: string })}
                </span>
              </>
            );

            if ("isOverflow" in item && item.isOverflow) {
              return (
                <button
                  key="mobile-more"
                  type="button"
                  aria-label={t("openMore")}
                  aria-expanded={overflowOpen}
                  className="relative flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md px-1 py-1 transition-colors"
                  onClick={() => setOverflowOpen(true)}
                >
                  {content}
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={href ?? item.href}
                aria-current={active ? "page" : undefined}
                className="relative flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md px-1 py-1 transition-colors"
              >
                {content}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

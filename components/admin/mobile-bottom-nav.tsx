"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Ellipsis, X } from "lucide-react";

import { type StaffRole } from "@/lib/auth/roles";
import {
  getMobileBottomNavigation,
  getMobileMoreGroups,
  isMobileTakeoverRoute,
} from "@/lib/config/navigation";
import { appendCurrentSessionParam } from "@/lib/navigation/session-href";
import { cn } from "@/lib/utils";

type MobileBottomNavProps = {
  staffRole: StaffRole;
  /**
   * Live counts rendered as badges on the bar. Keyed by href so a role that
   * cannot see a module simply never receives its badge.
   */
  counts?: Partial<Record<string, number>>;
};

export function MobileBottomNav({ staffRole, counts }: MobileBottomNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const t = useTranslations("Navigation");
  const tMobile = useTranslations("MobileApp");
  const translateLabel = (item: { label: string; i18nKey?: string }) =>
    item.i18nKey ? t(item.i18nKey) : item.label;
  const primaryItems = getMobileBottomNavigation(staffRole).slice(0, 4);
  const moreGroups = useMemo(() => getMobileMoreGroups(staffRole), [staffRole]);
  const primaryHrefs = new Set(primaryItems.map((item) => item.href));
  const overflowIsActive = moreGroups.some((group) =>
    group.items.some((item) => {
      if (primaryHrefs.has(item.href)) return false;
      return pathname === item.href || pathname.startsWith(`${item.href}/`);
    }),
  );
  // Takeover screens replace the screen entirely (mobile v2): the tab bar
  // would cost 68px where height matters most, and a tab bar on a student
  // detail page says "you are on a tab", which it is not. MobileTakeoverBar
  // supplies the way back.
  const isTakeover = isMobileTakeoverRoute(pathname);

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

  // Hooks must run unconditionally, so this early return sits below them.
  // The More overlay is still allowed to render over a takeover — it is a
  // deliberate jump away, not the tab bar.
  if (isTakeover && !overflowOpen) return null;

  return (
    <>
      {overflowOpen ? (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur print:hidden md:hidden">
          <div className="flex h-full flex-col pb-[calc(var(--mobile-bottom-nav-offset)+0.75rem)]">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-lg font-extrabold tracking-tight text-foreground">
                  {t("more")}
                </p>
                <p className="text-xs text-muted-foreground">{t("moreDescription")}</p>
              </div>
              <button
                type="button"
                aria-label={t("closeMore")}
                className="focus-ring inline-flex size-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
                onClick={() => setOverflowOpen(false)}
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            {/* Grouped the way the office thinks about the work: the two
                receipt lookups first, then the records they maintain, then
                admin, then system. */}
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {moreGroups.map((group) => (
                <section key={group.key}>
                  <h2 className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    {tMobile.has(group.i18nKey) ? tMobile(group.i18nKey) : group.label}
                  </h2>
                  <div className="overflow-hidden rounded-xl border border-border bg-card">
                    {group.items.map((item, index) => {
                      const Icon = item.icon;
                      const active =
                        pathname === item.href || pathname.startsWith(`${item.href}/`);
                      const href = appendCurrentSessionParam(item.href, searchParams);

                      return (
                        <Link
                          key={item.href}
                          href={href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setOverflowOpen(false)}
                          className={cn(
                            "focus-ring flex min-h-14 items-center gap-3 px-3 py-2.5 text-left transition-colors",
                            index > 0 && "border-t border-border/60",
                            active && "bg-accent-soft",
                          )}
                        >
                          <span
                            className={cn(
                              "inline-grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted-foreground",
                              active && "tone-accent",
                            )}
                          >
                            <Icon className="size-[18px]" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-bold text-foreground">
                              {item.i18nKey && tMobile.has(item.i18nKey)
                                ? tMobile(item.i18nKey)
                                : item.label}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {item.i18nKey && tMobile.has(`${item.i18nKey}Desc`)
                                ? tMobile(`${item.i18nKey}Desc`)
                                : item.description}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
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
            const isOverflow = "isOverflow" in item && item.isOverflow;
            const active = isOverflow
              ? overflowOpen || overflowIsActive
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const href = isOverflow
              ? undefined
              : appendCurrentSessionParam(item.href, searchParams);
            // Collect is THE action of this app — it stays a filled saffron
            // pill in every state so the thumb always knows where money goes.
            const isCollect = !isOverflow && item.href === "/protected/payments";
            const badge = isOverflow ? undefined : counts?.[item.href];
            const content = (
              <>
                <span
                  className={cn(
                    "relative flex size-8 items-center justify-center rounded-lg transition-all duration-200",
                    isCollect
                      ? "h-8 w-12 rounded-full bg-accent text-accent-foreground shadow-sm"
                      : active
                        ? "bg-accent/10 text-accent"
                        : "text-muted-foreground/70",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {badge && badge > 0 ? (
                    /* Sized by content, not a fixed min-width: this school
                       runs 400+ defaulters, so the badge is "99+" far more
                       often than a two-digit count, and a fixed box clipped
                       the "+". box-content keeps the padding outside the
                       height so the pill stays circular for single digits. */
                    <span className="absolute -right-2 -top-1 box-content inline-flex h-[17px] min-w-[9px] items-center justify-center rounded-full bg-destructive px-1.5 text-[9.5px] font-extrabold tabular-nums text-destructive-foreground">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "mt-0.5 max-w-full truncate text-[10px] font-medium transition-colors",
                    isCollect || active ? "text-accent" : "text-muted-foreground/70",
                    isCollect && "font-semibold",
                  )}
                >
                  {isOverflow
                    ? item.label
                    : translateLabel(item as { label: string; i18nKey?: string })}
                </span>
              </>
            );

            if (isOverflow) {
              return (
                <button
                  key="mobile-more"
                  type="button"
                  aria-label={t("openMore")}
                  aria-expanded={overflowOpen}
                  className="focus-ring relative flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md px-1 py-1 transition-colors"
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
                className="focus-ring relative flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md px-1 py-1 transition-colors"
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

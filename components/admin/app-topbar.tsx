"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, KeyRound, LogOut, UserRound } from "lucide-react";

import { roleLabels, type StaffRole } from "@/lib/auth/roles";
import { getProtectedRouteMeta } from "@/lib/config/navigation";
import { appendCurrentSessionParam } from "@/lib/navigation/session-href";
import { logoutAction } from "@/app/auth/login/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { CommandTrigger } from "@/components/command/command-trigger";
import { SchoolBrand } from "@/components/branding/school-brand";

import { SidebarNav } from "./sidebar-nav";
import { StatusBadge } from "./status-badge";

type AppTopBarProps = {
  staffEmail: string;
  staffRole: StaffRole;
  sessionPill?: ReactNode;
  /**
   * Locale switcher trigger (Globe icon + dropdown). Rendered only when the
   * LOCALE_SWITCHER_ENABLED env flag is on — the parent shell decides.
   */
  localeSwitcher?: ReactNode;
};

function initialsOf(email: string) {
  const cleaned = email.split("@")[0] ?? email;
  const parts = cleaned.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function AppTopBar({ staffEmail, staffRole, sessionPill, localeSwitcher }: AppTopBarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeMeta = getProtectedRouteMeta(pathname);
  const passwordHref = appendCurrentSessionParam("/protected/password", searchParams);

  return (
    <header className="z-20 hidden border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 print:hidden md:sticky md:top-0 md:flex md:flex-col">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
            {routeMeta.label}
          </h1>
          <CommandTrigger />
        </div>

        <div className="flex items-center gap-2">
          {sessionPill}
          <StatusBadge label={roleLabels[staffRole]} tone="neutral" iconless />
          {localeSwitcher}
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-2 focus-ring"
              aria-label="Account menu"
            >
              <span className="grid size-7 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold uppercase text-foreground">
                {initialsOf(staffEmail)}
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="flex items-center gap-2 py-2">
                <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {staffEmail}
                  </p>
                  <p className="text-xs font-normal text-muted-foreground">
                    {roleLabels[staffRole]}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={passwordHref} className="flex items-center gap-2">
                  <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
                  Change password
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <form action={logoutAction}>
                <DropdownMenuItem asChild>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 text-destructive focus:text-destructive"
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    Sign out
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tablet (md) compact nav — sidebar hidden, bottom-nav also hidden here. */}
      <div className="hidden border-t border-border bg-background/60 px-4 py-2 sm:px-6 md:block lg:hidden">
        <SidebarNav staffRole={staffRole} mode="topbar" />
      </div>
    </header>
  );
}

export function MobileHeader({
  staffEmail,
  staffRole,
  sessionPill,
  localeSwitcher,
  homeHref,
}: AppTopBarProps & {
  homeHref: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sessionAwareHomeHref = appendCurrentSessionParam(homeHref, searchParams);
  const passwordHref = appendCurrentSessionParam("/protected/password", searchParams);
  const routeTitle = getProtectedRouteMeta(pathname).label;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-3 backdrop-blur print:hidden md:hidden">
      <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
        <Link href={sessionAwareHomeHref} aria-label="Open home" className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-1 py-1 transition-colors hover:bg-surface-2">
          <SchoolBrand variant="icon" priority />
          <span className="hidden xs:block text-[11px] font-bold uppercase tracking-wide text-accent leading-tight">
            VPPS
          </span>
        </Link>
        <span className="text-muted-foreground text-xs font-semibold shrink-0">/</span>
        <h1 className="text-sm font-semibold text-foreground truncate">
          {routeTitle}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {sessionPill}
        {localeSwitcher}
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger
            className="grid size-9 place-items-center rounded-full border border-border bg-surface-2 text-[11px] font-semibold uppercase text-foreground focus-ring"
            aria-label="Account menu"
          >
            {initialsOf(staffEmail)}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="flex items-center gap-2 py-2">
              <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {staffEmail}
                </p>
                <p className="text-xs font-normal text-muted-foreground">
                  {roleLabels[staffRole]}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={passwordHref} className="flex items-center gap-2">
                <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
                Change password
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={logoutAction}>
              <DropdownMenuItem asChild>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 text-destructive focus:text-destructive"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  Sign out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

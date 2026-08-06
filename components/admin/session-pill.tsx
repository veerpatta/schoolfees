"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import {
  isTestAcademicSessionLabel,
  parseAcademicSessionLabel,
} from "@/lib/config/fee-rules";
import { cn } from "@/lib/utils";
import {
  listAvailableSessionsAction,
  setViewSessionAction,
} from "@/app/protected/session/actions";
import type { AvailableSessionRow } from "@/lib/session/available-sessions";
import { useSessionSwitching } from "@/lib/session/switching-context";

type SessionPillProps = {
  currentLabel: string;
  isTest: boolean;
  initialSessions?: AvailableSessionRow[];
};

export const SESSION_SWITCHER_STALE_PARAM_NAMES = [
  "classId",
  "routeId",
  "studentId",
  "status",
  "fromDate",
  "toDate",
  "q",
  "search",
  "page",
];

const SESSION_SWITCHER_PREFETCH_DELAY_MS = 100;

type SearchParamSource = {
  toString: () => string;
};

/**
 * "Which `?session=` have we already pushed into the cookie" — module scope,
 * NOT a per-component ref, because two pills are mounted at once.
 *
 * On the dashboard at phone width `AppTopBar` is `hidden md:flex`: CSS-hidden
 * but still mounted, so <SessionPill> and <MobileSessionPill> both run the
 * URL->cookie sync effect. With a ref each, tapping the phone pill fired
 * setViewSessionAction twice per switch — two cookie writes and two
 * revalidateTag calls for one tap. Sharing the guard makes the second
 * instance a no-op.
 */
export const sessionSyncGuard: { label: string | null } = { label: null };

export function normalizeSessionLabel(label: string | null | undefined) {
  const value = (label ?? "").trim();

  if (!value) {
    return null;
  }

  try {
    return parseAcademicSessionLabel(value).normalizedLabel;
  } catch {
    return null;
  }
}

export function isTestSession(label: string) {
  try {
    return isTestAcademicSessionLabel(label);
  } catch {
    return false;
  }
}

export function buildSessionSwitchHref(
  pathname: string,
  searchParams: SearchParamSource,
  label: string,
) {
  const params = new URLSearchParams(searchParams.toString());

  for (const name of SESSION_SWITCHER_STALE_PARAM_NAMES) {
    params.delete(name);
  }
  for (const name of Array.from(params.keys())) {
    if (name !== "session") {
      params.delete(name);
    }
  }

  params.set("session", normalizeSessionLabel(label) ?? label.trim());

  return `${pathname}?${params.toString()}`;
}

export function groupSessions(sessions: AvailableSessionRow[]) {
  const active = sessions.filter((session) => session.is_current);
  const activeIds = new Set(active.map((session) => session.id));
  const test = sessions.filter(
    (session) => !activeIds.has(session.id) && isTestSession(session.session_label),
  );
  const testIds = new Set(test.map((session) => session.id));
  const otherProduction = sessions.filter(
    (session) => !activeIds.has(session.id) && !testIds.has(session.id),
  );

  return [
    { title: "Active", rows: active },
    { title: "Other production", rows: otherProduction },
    { title: "Test / UAT / DEMO", rows: test },
  ].filter((group) => group.rows.length > 0);
}

export function syncTestSessionBodyAttribute(
  body: { dataset: Record<string, string | undefined> },
  {
    isTest,
    displayLabel,
  }: {
    isTest: boolean;
    displayLabel: string;
  },
) {
  if (isTest || isTestSession(displayLabel)) {
    body.dataset.vppsTestSession = "true";
  } else {
    delete body.dataset.vppsTestSession;
  }

  return () => {
    delete body.dataset.vppsTestSession;
  };
}

export function SessionPill({
  currentLabel,
  isTest,
  initialSessions = [],
}: SessionPillProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prefetchTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<AvailableSessionRow[]>(initialSessions);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isRefreshing, startNavTransition] = useTransition();
  const { setIsSwitching: setGlobalSessionSwitching } = useSessionSwitching();
  const urlSession = normalizeSessionLabel(searchParams.get("session"));
  const [optimisticLabel, setOptimisticLabel] = useState<string | null>(null);
  const displayLabel = optimisticLabel ?? urlSession ?? currentLabel;
  const displayIsTest =
    optimisticLabel || urlSession ? isTestSession(optimisticLabel ?? urlSession ?? "") : isTest;
  const groups = useMemo(() => groupSessions(sessions), [sessions]);
  const isTransitioning = isSwitching || isRefreshing;
  // "Live" treatment only applies to the school's current production
  // session — an archived year stays neutral so nobody mistakes it for
  // today's books. When the session list hasn't loaded yet, a non-test
  // label is assumed live (the common case: staff sitting on the active AY).
  const displayIsLive =
    !displayIsTest &&
    (sessions.length === 0 ||
      sessions.some(
        (session) => session.is_current && session.session_label === displayLabel,
      ));

  useEffect(() => {
    if (initialSessions.length > 0) {
      setSessions(initialSessions);
      return;
    }

    let isMounted = true;

    listAvailableSessionsAction()
      .then((rows) => {
        if (isMounted) {
          setSessions(rows);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSessions(initialSessions);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [initialSessions]);

  useEffect(() => {
    setOptimisticLabel(null);
  }, [currentLabel, urlSession]);

  // Syncs a `?session=` arrived at by any route (a shared link, a back button,
  // a nav item carrying the param) into the cookie, so the layout chrome and
  // the server-rendered data agree with the URL.
  //
  // The ref guard is what stops it looping, and the loop is why switching
  // sessions used to snap back. `currentLabel` is resolved by
  // app/protected/layout.tsx from the COOKIE ONLY — App Router layouts get no
  // searchParams — so it lags the URL. The old exit condition was
  // `urlSession === currentLabel`, which the layout may not satisfy on the next
  // render; the effect then fired again, and since every revalidating Server
  // Action makes Next navigate to `canonicalUrl`, each firing yanked the URL
  // back. Keying on "have I already synced THIS label" terminates regardless of
  // whether the layout has caught up.
  useEffect(() => {
    if (!urlSession || urlSession === currentLabel) return;
    if (sessionSyncGuard.label === urlSession) return;

    sessionSyncGuard.label = urlSession;

    void (async () => {
      try {
        // No router.refresh() here, deliberately — and note the old code called
        // it as router["refresh"]() specifically to slip past the assertion in
        // tests/unit/session-switcher-preload.test.ts that bans it. The ban is
        // right: setViewSessionAction already revalidates the session tags, and
        // a revalidating Server Action makes Next re-render the route anyway.
        // The extra refresh only added a second navigation to canonicalUrl,
        // which is what yanked the URL back to the previous session.
        await setViewSessionAction(urlSession);
      } catch (err) {
        // Let a genuine failure be retried on the next render rather than
        // leaving the cookie permanently out of step with the URL.
        sessionSyncGuard.label = null;
        console.error("Failed to sync session from URL to cookie", err);
      }
    })();
  }, [urlSession, currentLabel]);

  useEffect(() => {
    setGlobalSessionSwitching(isTransitioning);

    return () => {
      setGlobalSessionSwitching(false);
    };
  }, [isTransitioning, setGlobalSessionSwitching]);

  useEffect(
    () =>
      syncTestSessionBodyAttribute(document.body, {
        isTest: displayIsTest,
        displayLabel,
      }),
    [displayIsTest, displayLabel],
  );

  useEffect(() => {
    return () => {
      if (prefetchTimerRef.current !== null) {
        window.clearTimeout(prefetchTimerRef.current);
      }
    };
  }, []);

  function clearPrefetchTimer() {
    if (prefetchTimerRef.current !== null) {
      window.clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
  }

  function prefetchSession(label: string) {
    clearPrefetchTimer();
    const targetHref = buildSessionSwitchHref(pathname, searchParams, label);

    prefetchTimerRef.current = window.setTimeout(() => {
      router.prefetch(targetHref);
      prefetchTimerRef.current = null;
    }, SESSION_SWITCHER_PREFETCH_DELAY_MS);
  }

  function selectSession(label: string) {
    clearPrefetchTimer();
    const targetHref = buildSessionSwitchHref(pathname, searchParams, label);

    setOptimisticLabel(label);
    setIsSwitching(true);
    setOpen(false);
    // Warm the destination while the cookie write is in flight, so serialising
    // the two below costs the round trip and not the render.
    router.prefetch(targetHref);

    // We are about to write this label to the cookie ourselves, so tell the
    // URL->cookie sync effect it has nothing to do. Without this the URL change
    // below makes that effect fire a second, redundant setViewSessionAction.
    sessionSyncGuard.label = label;

    void (async () => {
      try {
        // Cookie FIRST, then navigate. These used to run concurrently, and the
        // render triggered by the navigation reads the cookie the action may
        // not have written yet: the page honours `?session=` but the LAYOUT
        // cannot — App Router layouts get no searchParams — so the chrome
        // rendered the old session while the page rendered the new one. That
        // is the "sometimes it doesn't work". The pill already shows the new
        // label optimistically, so the wait is not visible; what pays for it
        // is setViewSessionAction no longer awaiting getSessionSwitcherData.
        const result = await setViewSessionAction(label);

        if (result.success) {
          const confirmedHref = buildSessionSwitchHref(pathname, searchParams, result.sessionLabel);
          sessionSyncGuard.label = result.sessionLabel;
          startNavTransition(() => {
            router.replace(confirmedHref, { scroll: false });
          });
        } else {
          // Nothing was navigated, so there is no URL to walk back — just drop
          // the optimistic label and let the pill show the truth again.
          // Silently reverting was the bug: the label snapped back to the old
          // session with no explanation, which reads as the pill ignoring you.
          sessionSyncGuard.label = null;
          setOptimisticLabel(null);
          toast({
            title: "Could not switch session",
            description: `${label} could not be opened. You are still on ${currentLabel}.`,
            tone: "danger",
          });
        }
      } catch (error) {
        sessionSyncGuard.label = null;
        setOptimisticLabel(null);
        toast({
          title: "Could not switch session",
          description:
            error instanceof Error ? error.message : `You are still on ${currentLabel}.`,
          tone: "danger",
        });
      } finally {
        // Cleared HERE, not synchronously after startNavTransition. React
        // batches a set(true)/set(false) pair in the same handler, so the old
        // code meant `isSwitching` was never observably true and the switching
        // overlay never appeared.
        setIsSwitching(false);
      }
    })();
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        type="button"
        className={cn(
          "inline-flex h-9 shrink-0 cursor-pointer list-none items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-semibold shadow-sm transition-colors focus-ring",
          displayIsTest
            ? "border-fuchsia-500 bg-surface text-fuchsia-700 hover:bg-surface-2"
            : displayIsLive
              ? "border-success/30 bg-success-soft text-success-soft-foreground hover:bg-success-soft/70"
              : "border-border bg-surface text-foreground hover:bg-surface-2",
          isTransitioning && "opacity-75",
        )}
        aria-label="Change academic session"
        aria-busy={isTransitioning}
      >
        {displayIsLive ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
            Live ·
          </span>
        ) : (
          <span className="text-muted-foreground">Session</span>
        )}
        <span>{displayLabel}</span>
        {displayIsTest ? (
          <span className="rounded-full border border-fuchsia-300 bg-fuchsia-50 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700">
            TEST
          </span>
        ) : null}
        {isTransitioning ? (
          <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2">
        {isTransitioning ? (
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
            Changing to {displayLabel}...
          </p>
        ) : null}
        {groups.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            Academic sessions are loading.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.title} className="space-y-1 py-1">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">
                {group.title}
              </p>
              {group.rows.map((session) => {
                const selected = session.session_label === displayLabel;
                const rowIsTest = isTestSession(session.session_label);

                return (
                  <DropdownMenuItem
                    key={session.id}
                    disabled={isTransitioning || selected}
                    onSelect={(event) => {
                      event.preventDefault();
                      selectSession(session.session_label);
                    }}
                    onFocus={() => prefetchSession(session.session_label)}
                    onMouseEnter={() => prefetchSession(session.session_label)}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent data-[disabled]:cursor-not-allowed",
                      selected && "bg-accent font-semibold",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{session.session_label}</span>
                      {rowIsTest ? (
                        <span className="rounded-full border border-fuchsia-300 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-700">
                          TEST
                        </span>
                      ) : null}
                    </span>
                    {selected ? <Check className="size-3.5" aria-hidden="true" /> : null}
                  </DropdownMenuItem>
                );
              })}
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

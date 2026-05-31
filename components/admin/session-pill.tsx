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

function buildHrefFromSearchParams(pathname: string, searchParams: SearchParamSource) {
  const query = searchParams.toString();

  return query ? `${pathname}?${query}` : pathname;
}

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
    const previousHref = buildHrefFromSearchParams(pathname, searchParams);
    const targetHref = buildSessionSwitchHref(pathname, searchParams, label);

    setOptimisticLabel(label);
    setIsSwitching(true);
    setOpen(false);
    router.prefetch(targetHref);

    startNavTransition(() => {
      router.replace(targetHref, { scroll: false });
    });
    setIsSwitching(false);

    void (async () => {
      try {
        const result = await setViewSessionAction(label);

        if (result.success) {
          if (result.availableSessions) {
            setSessions(result.availableSessions);
          }

          const confirmedHref = buildSessionSwitchHref(pathname, searchParams, result.sessionLabel);

          if (confirmedHref !== targetHref) {
            startNavTransition(() => {
              router.replace(confirmedHref, { scroll: false });
            });
          }
        } else {
          setOptimisticLabel(null);
          startNavTransition(() => {
            router.replace(previousHref, { scroll: false });
          });
        }
      } catch {
        setOptimisticLabel(null);
        startNavTransition(() => {
          router.replace(previousHref, { scroll: false });
        });
      }
    })();
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        type="button"
        className={cn(
          "inline-flex h-9 shrink-0 cursor-pointer list-none items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-surface-2 focus-ring",
          displayIsTest && "border-fuchsia-500 text-fuchsia-700",
          isTransitioning && "opacity-75",
        )}
        aria-label="Change academic session"
        aria-busy={isTransitioning}
      >
        <span className="text-muted-foreground">Session</span>
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

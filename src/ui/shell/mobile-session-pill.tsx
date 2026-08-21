"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  listAvailableSessionsAction,
  setViewSessionAction,
} from "@/app/protected/session/actions";
import { releaseAllSheetScrollLocks, Sheet } from "@/ui/primitives/sheet";
import type { AvailableSessionRow } from "@/platform/session/available-sessions";
import { useSessionSwitching } from "@/platform/session/switching-context";
import { toast } from "@/ui/primitives/toast";
import { cn } from "@/platform/utils";

import {
  buildSessionSwitchHref,
  groupSessions,
  isTestSession,
  normalizeSessionLabel,
  sessionSyncGuard,
} from "./session-pill";

type MobileSessionPillProps = {
  currentLabel: string;
  isTest: boolean;
  initialSessions?: AvailableSessionRow[];
};

export function MobileSessionPill({
  currentLabel,
  isTest,
  initialSessions = [],
}: MobileSessionPillProps) {
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

  // Ref-guarded so it cannot loop — see the long note on the same effect in
  // session-pill.tsx. `currentLabel` comes from a cookie-only layout resolve
  // and can lag the URL indefinitely, so "have I already synced THIS label" is
  // the only exit condition that reliably terminates.
  useEffect(() => {
    if (!urlSession || urlSession === currentLabel) return;
    if (sessionSyncGuard.label === urlSession) return;

    sessionSyncGuard.label = urlSession;

    void (async () => {
      try {
        // No router.refresh() — see the note on the same effect in
        // session-pill.tsx. The action's own revalidation is enough, and the
        // extra refresh was the second navigation that snapped the URL back.
        await setViewSessionAction(urlSession);
      } catch (err) {
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
    }, 100);
  }

  function selectSession(label: string) {
    clearPrefetchTimer();
    const targetHref = buildSessionSwitchHref(pathname, searchParams, label);

    setOptimisticLabel(label);
    setIsSwitching(true);
    setOpen(false);
    releaseAllSheetScrollLocks();
    // Warm the destination while the cookie write is in flight.
    router.prefetch(targetHref);

    // We write the cookie ourselves below; stop the sync effect duplicating it.
    sessionSyncGuard.label = label;

    void (async () => {
      try {
        // Cookie FIRST, then navigate — see the same comment in session-pill.
        // The page honours `?session=`, the layout can only read the cookie,
        // so navigating before the write lands renders chrome and data from
        // two different sessions.
        const result = await setViewSessionAction(label);

        if (result.success) {
          const confirmedHref = buildSessionSwitchHref(pathname, searchParams, result.sessionLabel);
          sessionSyncGuard.label = result.sessionLabel;
          startNavTransition(() => {
            router.replace(confirmedHref, { scroll: false });
          });
        } else {
          // Same rule as the desktop pill: a silent revert reads as the pill
          // ignoring the tap.
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
        // Cleared here rather than synchronously after startNavTransition:
        // React batches a set(true)/set(false) pair in one handler, so the old
        // ordering meant isSwitching was never observably true.
        setIsSwitching(false);
        setGlobalSessionSwitching(false);
        releaseAllSheetScrollLocks();
      }
    })();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-11 max-w-[42vw] items-center gap-1 rounded-full border bg-surface px-3 text-xs font-semibold text-foreground",
          displayIsTest ? "border-fuchsia-500 text-fuchsia-700" : "border-border",
          isTransitioning && "opacity-75",
        )}
        aria-label="Change academic session"
        aria-busy={isTransitioning}
      >
        <span className="truncate">{displayLabel}</span>
        {isTransitioning ? (
          <Loader2 className="size-3.5 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Academic session"
        description="Choose the year to view across the office workspace."
        className="h-[100dvh] max-h-[100dvh] rounded-none"
      >
        <div className="space-y-4 pb-4">
          {isTransitioning ? (
            <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-muted-foreground">
              Changing to {displayLabel}...
            </p>
          ) : null}
          {groups.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-surface-2 px-3 py-3 text-sm text-muted-foreground">
              Academic sessions are loading.
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.title} className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {group.title}
                </p>
                <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
                  {group.rows.map((session) => {
                    const selected = session.session_label === displayLabel;
                    const rowIsTest = isTestSession(session.session_label);

                    return (
                      <button
                        key={session.id}
                        type="button"
                        disabled={isTransitioning || selected}
                        onClick={() => selectSession(session.session_label)}
                        onFocus={() => prefetchSession(session.session_label)}
                        onMouseEnter={() => prefetchSession(session.session_label)}
                        className={cn(
                          "flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-60",
                          selected && "bg-accent-soft font-semibold",
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
                        {selected ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </Sheet>
    </>
  );
}

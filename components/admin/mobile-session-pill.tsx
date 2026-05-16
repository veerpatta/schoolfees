"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  listAvailableSessionsAction,
  setViewSessionAction,
} from "@/app/protected/session/actions";
import { Sheet } from "@/components/ui/sheet";
import type { AvailableSessionRow } from "@/lib/session/available-sessions";
import { cn } from "@/lib/utils";

import {
  groupSessions,
  isTestSession,
  normalizeSessionLabel,
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
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<AvailableSessionRow[]>(initialSessions);
  const [isSwitching, setIsSwitching] = useState(false);
  const urlSession = normalizeSessionLabel(searchParams.get("session"));
  const [optimisticLabel, setOptimisticLabel] = useState<string | null>(null);
  const displayLabel = optimisticLabel ?? urlSession ?? currentLabel;
  const displayIsTest =
    optimisticLabel || urlSession ? isTestSession(optimisticLabel ?? urlSession ?? "") : isTest;
  const groups = useMemo(() => groupSessions(sessions), [sessions]);

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

  function selectSession(label: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("session", label);
    const targetHref = `${pathname}?${params.toString()}`;

    setOptimisticLabel(label);
    setIsSwitching(true);
    router.prefetch(targetHref);

    void (async () => {
      try {
        const result = await setViewSessionAction(label);

        if (result.success) {
          if (result.availableSessions) {
            setSessions(result.availableSessions);
          }

          params.set("session", result.sessionLabel);
          const targetHref = `${pathname}?${params.toString()}`;
          router.prefetch(targetHref);
          setIsSwitching(false);
          router.replace(targetHref, { scroll: false });
          router.refresh();
          setOpen(false);
        } else {
          setIsSwitching(false);
          setOptimisticLabel(null);
        }
      } catch {
        setIsSwitching(false);
        setOptimisticLabel(null);
      }
    })();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-8 max-w-[42vw] items-center gap-1 rounded-full border bg-surface px-2 text-xs font-semibold text-foreground",
          displayIsTest ? "border-fuchsia-500 text-fuchsia-700" : "border-border",
        )}
        aria-label="Change academic session"
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Academic session"
        description="Choose the year to view across the office workspace."
        className="h-[100dvh] max-h-[100dvh] rounded-none"
      >
        <div className="space-y-4 pb-4">
          {isSwitching ? (
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
                        disabled={isSwitching || selected}
                        onClick={() => selectSession(session.session_label)}
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

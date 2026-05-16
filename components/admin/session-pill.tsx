"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

type SessionPillProps = {
  currentLabel: string;
  isTest: boolean;
  initialSessions?: AvailableSessionRow[];
};

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

export function groupSessions(sessions: AvailableSessionRow[]) {
  const active = sessions.filter((session) => session.is_current);
  const test = sessions.filter((session) => isTestSession(session.session_label));
  const activeIds = new Set(active.map((session) => session.id));
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
  const [sessions, setSessions] = useState<AvailableSessionRow[]>(initialSessions);
  const [isPending, startTransition] = useTransition();
  const urlSession = normalizeSessionLabel(searchParams.get("session"));
  const displayLabel = urlSession ?? currentLabel;
  const displayIsTest = urlSession ? isTestSession(urlSession) : isTest;
  const groups = useMemo(() => groupSessions(sessions), [sessions]);

  useEffect(() => {
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

  useEffect(
    () =>
      syncTestSessionBodyAttribute(document.body, {
        isTest: displayIsTest,
        displayLabel,
      }),
    [displayIsTest, displayLabel],
  );

  function selectSession(label: string) {
    startTransition(async () => {
      const result = await setViewSessionAction(label);

      if (result.success) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("session", result.sessionLabel);
        router.replace(`${pathname}?${params.toString()}`);
        router.refresh();
      }
    });
  }

  return (
    <details className="group relative">
      <summary
        className={cn(
          "inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-surface-2 focus-ring",
          displayIsTest && "border-fuchsia-500 text-fuchsia-700",
        )}
        aria-label="Change academic session"
      >
        <span className="text-muted-foreground">Session</span>
        <span>{displayLabel}</span>
        {displayIsTest ? (
          <span className="rounded-full border border-fuchsia-300 bg-fuchsia-50 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700">
            TEST
          </span>
        ) : null}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg">
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
                  <button
                    key={session.id}
                    type="button"
                    disabled={isPending}
                    onClick={() => selectSession(session.session_label)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-60",
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
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </details>
  );
}

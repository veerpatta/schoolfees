import { SessionPill } from "@/ui/shell/session-pill";
import type { SessionSwitcherData } from "@/platform/session/switcher";

/**
 * The topbar session switcher, waiting on its list of sessions.
 *
 * `getSessionSwitcherData()` is normally a module-scope cache hit, but on a
 * cold lambda it is a miss with a 1200ms `Promise.race` timeout behind it —
 * and it used to be awaited before the shell rendered anything at all. It now
 * resolves inside a boundary, with a placeholder that is the same 36px box
 * carrying the same label.
 *
 * The pill can also load the list itself (`listAvailableSessionsAction` on
 * mount when `initialSessions` is empty), so this is an optimisation, not a
 * dependency. That is exactly why it does not deserve to block the page.
 */

type ShellSessionPillProps = {
  currentLabel: string;
  isTest: boolean;
  sessions: Promise<SessionSwitcherData>;
};

export async function ShellSessionPill({
  currentLabel,
  isTest,
  sessions,
}: ShellSessionPillProps) {
  const { availableSessions } = await sessions;

  return (
    <SessionPill
      currentLabel={currentLabel}
      isTest={isTest}
      initialSessions={availableSessions}
    />
  );
}

/**
 * Not the real pill with an empty list: mounting `<SessionPill>` here would
 * fire its own session fetch and then be thrown away when the server data
 * lands. A plain box holds the space and the label instead — the one thing it
 * cannot do for a fraction of a second is open, and the label it shows is
 * already the right one.
 */
export function ShellSessionPillSkeleton({
  currentLabel,
  isTest,
}: {
  currentLabel: string;
  isTest: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={
        isTest
          ? "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-fuchsia-500 bg-surface px-2.5 text-xs font-semibold text-fuchsia-700 shadow-sm"
          : "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 text-xs font-semibold text-muted-foreground shadow-sm"
      }
    >
      {currentLabel}
    </span>
  );
}

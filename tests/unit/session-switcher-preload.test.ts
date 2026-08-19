import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

/**
 * Source with comments stripped.
 *
 * The negative assertions below are about what the code DOES. Reading raw text
 * meant a file could not even explain why it avoids something without failing
 * the check that it avoids it.
 */
function readRepoCode(path: string) {
  return readRepoFile(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("session switcher preload", () => {
  it("preloads session rows in the protected shell instead of fetching after mount", () => {
    const shell = readRepoFile("components/admin/dashboard-shell.tsx");
    const shellPill = readRepoFile("components/admin/shell-session-pill.tsx");
    const desktopPill = readRepoFile("components/admin/session-pill.tsx");
    const mobilePill = readRepoFile("components/admin/mobile-session-pill.tsx");
    const switcher = readRepoFile("lib/session/switcher.ts");

    // The shell still preloads the rows; it no longer BLOCKS on them. It starts
    // getSessionSwitcherData() and hands the promise to <ShellSessionPill>
    // inside a Suspense boundary, because awaiting it here held back the whole
    // workspace — chrome, and the child route's loading.tsx with it — for a
    // read that is a 1200ms race on a cold lambda. What this guard is really
    // about is unchanged: the pill opens with rows already in hand rather than
    // fetching after mount.
    expect(shell).toContain("getSessionSwitcherData");
    expect(shell).toContain("sessions={sessionSwitcherPromise}");
    expect(shellPill).toContain("initialSessions={availableSessions}");

    // Mobile v2 moved the phone pill out of the shell and onto Home — the
    // shell no longer renders a phone app bar. Both pills must still open with
    // rows already in hand; the point of this guard is that neither fetches
    // after mount.
    const dashboard = readRepoFile("app/protected/dashboard/page.tsx");
    expect(dashboard).toContain("getSessionSwitcherData()");
    expect(dashboard).toContain("sessionOptions={sessionSwitcher.availableSessions}");
    expect(readRepoFile("components/dashboard/mobile-dashboard-screen.tsx")).toContain(
      "initialSessions={sessionOptions}",
    );
    expect(desktopPill).toContain("if (initialSessions.length > 0)");
    expect(mobilePill).toContain("if (initialSessions.length > 0)");
    expect(switcher).toContain("SESSION_SWITCHER_CACHE_TTL_MS");
    expect(switcher).toContain("cachedSessionSwitcherData");
  });

  it("session switching keeps the user on the same page with visible transition state", () => {
    const desktopPill = readRepoCode("components/admin/session-pill.tsx");
    const mobilePill = readRepoCode("components/admin/mobile-session-pill.tsx");
    const combined = `${desktopPill}\n${mobilePill}`;

    expect(combined).toContain("optimisticLabel");
    expect(combined).toContain("router.prefetch(targetHref)");
    // Navigation goes to the label the SERVER confirmed, after the cookie is
    // written — never to the optimistic target in parallel with the write.
    // The page honours `?session=` but the layout can only read the cookie
    // (App Router layouts get no searchParams), so navigating first renders
    // the chrome on the old session and the page on the new one.
    expect(combined).toContain("router.replace(confirmedHref, { scroll: false })");
    expect(combined).not.toContain("router.replace(targetHref");
    // A refresh here means a SECOND navigation on top of the one the
    // revalidating Server Action already causes, and that is what used to snap
    // the URL back to the previous session. Matched in both spellings: the
    // regression this replaced reached it as router["refresh"]() precisely to
    // get past the dotted form of this assertion.
    expect(combined).not.toContain("router.refresh()");
    expect(combined).not.toMatch(/router\s*\[\s*["'`]refresh["'`]\s*\]/);
    expect(combined).toContain("Changing to");
  });

  it("desktop session switching uses the shared Radix menu instead of native details", () => {
    const desktopPill = readRepoFile("components/admin/session-pill.tsx");

    expect(desktopPill).toContain("DropdownMenu");
    expect(desktopPill).not.toContain("<details");
    expect(desktopPill).not.toContain("<summary");
  });

  it("mobile session switching closes the sheet and always clears scroll locks", () => {
    const mobilePill = readRepoFile("components/admin/mobile-session-pill.tsx");
    const sheet = readRepoFile("components/ui/sheet.tsx");
    const scrollMain = readRepoFile("components/admin/scroll-restoring-main.tsx");

    expect(sheet).toContain("sheetScrollLockCount");
    expect(sheet).toContain("document.documentElement.style.overflow");
    expect(sheet).toContain("releaseAllSheetScrollLocks");
    expect(mobilePill).toContain("setOpen(false)");
    expect(mobilePill).toContain("releaseAllSheetScrollLocks()");
    expect(mobilePill).toContain("finally");
    expect(scrollMain).toContain("useSearchParams");
    expect(scrollMain).toContain("Math.min");
  });
});

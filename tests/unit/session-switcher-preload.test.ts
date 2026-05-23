import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("session switcher preload", () => {
  it("preloads session rows in the protected shell instead of fetching after mount", () => {
    const shell = readRepoFile("components/admin/dashboard-shell.tsx");
    const desktopPill = readRepoFile("components/admin/session-pill.tsx");
    const mobilePill = readRepoFile("components/admin/mobile-session-pill.tsx");
    const switcher = readRepoFile("lib/session/switcher.ts");

    expect(shell).toContain("getSessionSwitcherData");
    expect(shell).toContain("initialSessions={sessionSwitcher.availableSessions}");
    expect(shell.match(/initialSessions=\{sessionSwitcher\.availableSessions\}/g)).toHaveLength(2);
    expect(desktopPill).toContain("if (initialSessions.length > 0)");
    expect(mobilePill).toContain("if (initialSessions.length > 0)");
    expect(switcher).toContain("SESSION_SWITCHER_CACHE_TTL_MS");
    expect(switcher).toContain("cachedSessionSwitcherData");
  });

  it("session switching keeps the user on the same page with visible transition state", () => {
    const desktopPill = readRepoFile("components/admin/session-pill.tsx");
    const mobilePill = readRepoFile("components/admin/mobile-session-pill.tsx");
    const combined = `${desktopPill}\n${mobilePill}`;

    expect(combined).toContain("optimisticLabel");
    expect(combined).toContain("router.prefetch(targetHref)");
    expect(combined).toContain("router.replace(targetHref, { scroll: false })");
    expect(combined).not.toContain("router.refresh()");
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

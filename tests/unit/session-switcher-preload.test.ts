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

    expect(shell).toContain("getSessionSwitcherData");
    expect(shell).toContain("initialSessions={sessionSwitcher.availableSessions}");
    expect(shell.match(/initialSessions=\{sessionSwitcher\.availableSessions\}/g)).toHaveLength(2);
    expect(desktopPill).toContain("if (initialSessions.length > 0)");
    expect(mobilePill).toContain("if (initialSessions.length > 0)");
  });

  it("session switching keeps the user on the same page with visible transition state", () => {
    const desktopPill = readRepoFile("components/admin/session-pill.tsx");
    const mobilePill = readRepoFile("components/admin/mobile-session-pill.tsx");
    const combined = `${desktopPill}\n${mobilePill}`;

    expect(combined).toContain("optimisticLabel");
    expect(combined).toContain("router.prefetch(targetHref)");
    expect(combined).toContain("router.replace(targetHref, { scroll: false })");
    expect(combined).toContain("Changing to");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/**
 * The phone app's shell model (mobile v2).
 *
 * The design is 24 full-height screens: the PAGE never scrolls, the region
 * inside it does. Restyling with design tokens alone left the app a scrolling
 * document with a tab bar stuck on, which is why it still read as a website.
 *
 * These guards protect the three decisions that produce the app feel, and the
 * one constraint that must survive them: desktop is untouched.
 */
describe("phone app shell", () => {
  const globals = readRepoFile("src/app/globals.css");
  const main = readRepoFile("src/ui/shell/scroll-restoring-main.tsx");
  const shell = readRepoFile("src/ui/shell/dashboard-shell.tsx");

  it("makes main the scroll region on phones only", () => {
    // An unscoped rule (or an inline style) would beat the md: reset and lock
    // DESKTOP to 100dvh too. Walk from the `.mobile-app-main {` declaration
    // BACKWARDS to the nearest enclosing @media and check that specific one —
    // a lazy forward regex happily spans from an unrelated earlier block and
    // passes even when the rule is global.
    const declIndex = globals.indexOf(".mobile-app-main {");
    expect(declIndex, ".mobile-app-main rule is missing").toBeGreaterThan(-1);

    const before = globals.slice(0, declIndex);
    const enclosingMedia = before.lastIndexOf("@media");
    expect(enclosingMedia, ".mobile-app-main must sit inside a media query").toBeGreaterThan(-1);

    const mediaCondition = globals.slice(enclosingMedia, declIndex);
    expect(
      mediaCondition,
      ".mobile-app-main must be scoped to phones, not applied globally",
    ).toContain("max-width: 767px");
    // And nothing may reopen it outside that block.
    expect(before.slice(enclosingMedia)).not.toContain("}\n  }");

    expect(globals).toContain("overscroll-behavior-y: contain");
    expect(main).toContain('cn("mobile-app-main", className)');
  });

  it("clears the tab bar from inside the scroll region, not the document", () => {
    // Document-level padding under a 100dvh child makes the page taller than
    // the viewport and reintroduces page scrolling — the exact thing this
    // model exists to remove.
    expect(globals).toContain('.mobile-app-main[data-bottom-nav="true"]');
    expect(main).toContain('data-bottom-nav={hasBottomNav ? "true" : "false"}');
    expect(shell).not.toContain("mobile-bottom-nav-clearance");
  });

  it("pins the takeover back bar inside the scroll region", () => {
    // Rendering it above main would add its height on top of 100dvh.
    expect(shell).toContain("mobileBar={<MobileTakeoverBar />}");
    expect(main).toContain("{mobileBar}");
    expect(readRepoFile("src/ui/shell/mobile-takeover-bar.tsx")).toContain("sticky top-0");
  });

  it("keeps no persistent phone app bar", () => {
    expect(shell).not.toContain("<MobileHeader");
  });

  it("leaves the desktop document model alone", () => {
    // main must not carry an unconditional height/overflow, and the desktop
    // chrome must still be gated the way it always was.
    expect(main).not.toMatch(/className=\{cn\("h-\[100dvh\]/);
    expect(shell).toContain("lg:flex lg:flex-col"); // sidebar
    expect(shell).toContain("<AppTopBar");
  });
});

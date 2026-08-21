import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Actually switching the academic session.
 *
 * Nothing covered this before: `tests/ui/session-pill.test.tsx` renders static
 * markup and mocks the action without ever calling it, and
 * `nav-session-propagation.test.tsx` only checks that an already-present
 * `?session=` reaches sidebar hrefs. So the bug shipped — picking a session
 * navigated to it and then snapped straight back to the current one.
 *
 * The cause was a loop, not a bad redirect. `currentLabel` is resolved by the
 * protected layout from the COOKIE ONLY (App Router layouts get no
 * searchParams), so it lags the URL. The URL->cookie sync effect ran while
 * `urlSession !== currentLabel`, called a revalidating Server Action, and every
 * such action makes Next navigate to `canonicalUrl` — which re-fired the
 * effect. It also called `router["refresh"]()`, bracket-spelled to slip past
 * the assertion banning `router.refresh()`.
 */

const replace = vi.fn();
const prefetch = vi.fn();
const refresh = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, prefetch, refresh, push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/protected/dashboard",
  useSearchParams: () => searchParams,
}));

const setViewSessionAction = vi.fn();
vi.mock("@/app/protected/session/actions", () => ({
  setViewSessionAction: (label: string) => setViewSessionAction(label),
  listAvailableSessionsAction: () => Promise.resolve([]),
}));

vi.mock("@/platform/session/switching-context", () => ({
  useSessionSwitching: () => ({ setIsSwitching: vi.fn(), isSwitching: false }),
}));

const SESSIONS = [
  { id: "s1", session_label: "2026-27", status: "active", is_current: true },
  { id: "s2", session_label: "TEST-2026-27", status: "active", is_current: false },
];

async function loadPill() {
  const mod = await import("@/ui/shell/session-pill");
  return mod.SessionPill;
}

describe("session switching", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // The "already synced this label" guard is module scope, not a per-component
    // ref, because two pills are mounted at once on the phone dashboard (the
    // desktop top bar is `hidden md:flex` — CSS-hidden but mounted) and a ref
    // each meant two setViewSessionAction calls per switch. Module state
    // outlives a test, so reset it here or the third case inherits the label
    // the first case selected.
    (await import("@/ui/shell/session-pill")).sessionSyncGuard.label = null;
    searchParams = new URLSearchParams();
    setViewSessionAction.mockResolvedValue({
      success: true,
      sessionLabel: "TEST-2026-27",
      availableSessions: SESSIONS,
    });
  });

  it("navigates to the chosen session and does not bounce back", async () => {
    const SessionPill = await loadPill();
    const user = userEvent.setup();

    render(
      <SessionPill
        currentLabel="2026-27"
        isTest={false}
        initialSessions={SESSIONS}
      />,
    );

    await user.click(screen.getByRole("button", { name: /session/i }));
    await user.click(await screen.findByText("TEST-2026-27"));

    await waitFor(() => expect(setViewSessionAction).toHaveBeenCalledWith("TEST-2026-27"));

    const targets = replace.mock.calls.map(([href]) => String(href));
    // Every navigation must be to the CHOSEN session. A call carrying
    // session=2026-27 is the snap-back this test exists to catch.
    expect(targets.length).toBeGreaterThan(0);
    for (const href of targets) {
      expect(href).toContain("session=TEST-2026-27");
      expect(href).not.toContain("session=2026-27&");
      expect(href.endsWith("session=2026-27")).toBe(false);
    }
  });

  it("never calls router.refresh — that second navigation is the snap-back", async () => {
    const SessionPill = await loadPill();
    const user = userEvent.setup();

    render(
      <SessionPill currentLabel="2026-27" isTest={false} initialSessions={SESSIONS} />,
    );

    await user.click(screen.getByRole("button", { name: /session/i }));
    await user.click(await screen.findByText("TEST-2026-27"));

    await waitFor(() => expect(setViewSessionAction).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("syncs a URL session into the cookie exactly once, even if the layout lags", async () => {
    // The layout keeps reporting the old label because it reads the cookie,
    // not the URL. The effect must still settle after one call.
    //
    // Scope note, so this is not trusted for more than it proves: re-rendering
    // with identical props does not re-run the effect anyway, so what this
    // actually pins is the absence of `router.refresh()`. That refresh is the
    // load-bearing half of the fix — it forced a route re-render, which could
    // remount the pill and fire the effect again, and a remount also resets the
    // ref guard. Verified by re-adding it: this test and the source-scan ban in
    // session-switcher-preload.test.ts both go red. The ref guard is
    // defence-in-depth for the re-render case and is NOT exercised here.
    searchParams = new URLSearchParams("session=TEST-2026-27");
    const SessionPill = await loadPill();

    const { rerender } = render(
      <SessionPill currentLabel="2026-27" isTest={false} initialSessions={SESSIONS} />,
    );

    await waitFor(() => expect(setViewSessionAction).toHaveBeenCalledWith("TEST-2026-27"));

    for (let i = 0; i < 5; i += 1) {
      rerender(
        <SessionPill currentLabel="2026-27" isTest={false} initialSessions={SESSIONS} />,
      );
    }

    expect(setViewSessionAction).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("writes the cookie before it navigates", async () => {
    // These used to run concurrently. The layout resolves the session from the
    // cookie alone, so a navigation that lands first renders the chrome on the
    // old session while the page — which reads `?session=` — renders the new
    // one. That mismatch is the "sometimes it doesn't switch properly".
    const SessionPill = await loadPill();
    const user = userEvent.setup();
    let resolveAction: (value: unknown) => void = () => {};
    setViewSessionAction.mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );

    render(
      <SessionPill currentLabel="2026-27" isTest={false} initialSessions={SESSIONS} />,
    );

    await user.click(screen.getByRole("button", { name: /session/i }));
    await user.click(await screen.findByText("TEST-2026-27"));

    await waitFor(() => expect(setViewSessionAction).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();

    resolveAction({ success: true, sessionLabel: "TEST-2026-27" });
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(String(replace.mock.calls[0][0])).toContain("session=TEST-2026-27");
  });

  it("fires one action per switch even with both pills mounted", async () => {
    // The phone dashboard mounts MobileSessionPill AND the CSS-hidden desktop
    // SessionPill inside AppTopBar. Before the guard moved to module scope,
    // each ran its own URL->cookie sync effect and one tap wrote the cookie
    // and revalidated the session tag twice.
    searchParams = new URLSearchParams("session=TEST-2026-27");
    const mod = await import("@/ui/shell/session-pill");
    const mobileMod = await import("@/ui/shell/mobile-session-pill");

    render(
      <>
        <mod.SessionPill currentLabel="2026-27" isTest={false} initialSessions={SESSIONS} />
        <mobileMod.MobileSessionPill
          currentLabel="2026-27"
          isTest={false}
          initialSessions={SESSIONS}
        />
      </>,
    );

    await waitFor(() => expect(setViewSessionAction).toHaveBeenCalledWith("TEST-2026-27"));
    expect(setViewSessionAction).toHaveBeenCalledTimes(1);
  });
});

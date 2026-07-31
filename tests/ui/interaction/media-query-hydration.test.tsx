/**
 * Guards the fix for the Sentry hydration error on the Students list
 * (SCHOOLFEES-6, desktop staff only).
 *
 * `useMediaQuery` used to seed `useState` from `window.matchMedia(...)`, which
 * IS defined during hydration. On a desktop viewport the first client render
 * therefore answered `true` while the server HTML had been built from `false`,
 * so anything gated on it (the bulk-select checkboxes) hydrated against markup
 * that did not contain it. React reported a hydration mismatch and Sentry
 * Replay flagged it on every desktop visit to /protected/students.
 *
 * The first test renders on the server with the query NOT matching, then
 * hydrates in a DOM where it DOES match — the exact production shape — and
 * asserts React emitted no recoverable hydration error while still arriving at
 * the desktop branch once mounted.
 */

import React, { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMediaQuery } from "@/hooks/use-media-query";

const DESKTOP_QUERY = "(min-width: 768px)";

function Probe() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  return <div data-testid="probe">{isDesktop ? "desktop" : "phone"}</div>;
}

/**
 * Makes `matchMedia` answer `matches` for every query, with listeners that can
 * actually be fired. Returns the live listener set so a resize can be
 * simulated.
 */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      dispatchEvent: vi.fn(),
    }),
  });

  return listeners;
}

function probeText(container: HTMLElement) {
  return container.querySelector('[data-testid="probe"]')?.textContent;
}

let consoleErrorMessages: string[] = [];
let restoreConsoleError: (() => void) | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // React reports recoverable hydration mismatches through console.error, so
  // that is what the assertion reads. Swallow them so the run stays quiet.
  consoleErrorMessages = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    consoleErrorMessages.push(String(args[0] ?? ""));
  });
  restoreConsoleError = () => spy.mockRestore();
});

afterEach(() => {
  restoreConsoleError?.();
  restoreConsoleError = null;
});

function hydrationComplaints() {
  return consoleErrorMessages.filter((message) =>
    /hydrat|did not match|server rendered/i.test(message),
  );
}

describe("useMediaQuery — hydration safety", () => {
  it("hydrates a desktop viewport against phone-rendered HTML without a mismatch", async () => {
    // The server has no viewport, so it always renders the `false` branch.
    stubMatchMedia(false);
    const serverHtml = renderToString(<Probe />);
    expect(serverHtml).toContain("phone");

    // The client is a desktop browser: matchMedia answers true from the start.
    stubMatchMedia(true);
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    const onRecoverableError = vi.fn();
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, <Probe />, { onRecoverableError });
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(hydrationComplaints()).toEqual([]);

    // The point of the hook still holds: once hydration commits, the desktop
    // branch is live. A media query turns things on after mount, never before.
    expect(probeText(container)).toBe("desktop");

    await act(async () => {
      root?.unmount();
    });
    container.remove();
  });

  it("re-renders when the viewport crosses the breakpoint after mount", async () => {
    const listeners = stubMatchMedia(false);
    const serverHtml = renderToString(<Probe />);
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, <Probe />);
    });
    expect(probeText(container)).toBe("phone");

    // Resize past the breakpoint: the store answers true and notifies React
    // through the listener registered at subscribe time.
    stubMatchMedia(true);
    await act(async () => {
      for (const listener of listeners) listener();
    });
    expect(probeText(container)).toBe("desktop");

    await act(async () => {
      root?.unmount();
    });
    container.remove();
  });
});

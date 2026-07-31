/**
 * Guards the hydration safety of `useStoredPreference`, the hook behind the
 * Payment Desk's remembered payment mode and recent-student chips.
 *
 * Both used to be seeded with `useState(() => localStorage.getItem(...))`.
 * `window` IS defined during hydration, so the first client render returns the
 * stored value while server HTML would have been built from the default — the
 * defect class Sentry reported on the Students list as SCHOOLFEES-6, one page
 * over. The desk itself is `ssr: false` today, so these tests pin the hook's
 * contract rather than reproducing a live production error: they are what keeps
 * the fix honest if that flag is ever dropped.
 *
 * The shape of these tests matches media-query-hydration.test.tsx: render on
 * the server with an EMPTY store, hydrate with the store POPULATED — the
 * production shape — and assert React reported no recoverable error.
 *
 * The second pair of tests covers the write-back trap, which is the half that
 * is easy to reintroduce: a "persist on change" effect also runs on the mount
 * commit, so it must not fire before the restore has been applied, or it
 * silently overwrites the staffer's remembered value with the default.
 */

import React, { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStoredPreference } from "@/hooks/use-stored-preference";

const MODE_KEY = "vpps.paymentDesk.lastPaymentMode";
const RECENTS_KEY = "vpps_recent_students";
const MODE_OPTIONS = ["cash", "upi", "bank_transfer", "cheque"];

/** Mirrors the Payment Desk's payment-mode call site. */
function ModeProbe() {
  const [mode] = useStoredPreference<string>({
    key: MODE_KEY,
    serverValue: MODE_OPTIONS[0],
    parse: (raw) => (MODE_OPTIONS.includes(raw) ? raw : null),
    serialize: (value) => value,
  });

  return (
    <div>
      <span data-testid="mode">{mode}</span>
      {/* The desk renders a conditional block off this exact comparison, which
          is what turned a stale seed into a DOM-shape mismatch. */}
      {mode !== "cash" ? <span data-testid="non-cash-note">reference optional</span> : null}
    </div>
  );
}

/** Mirrors the Payment Desk's recent-students call site. */
function RecentsProbe() {
  const [recentIds] = useStoredPreference<string[]>({
    key: RECENTS_KEY,
    serverValue: [],
    parse: (raw) => {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as string[]).slice(0, 5) : null;
    },
    serialize: (ids) => JSON.stringify(ids.slice(0, 5)),
  });

  return (
    <ul data-testid="recents">
      {recentIds.map((id) => (
        <li key={id}>{id}</li>
      ))}
    </ul>
  );
}

/**
 * This project's `window.localStorage` is an object with no methods on it (the
 * runtime's experimental Storage shadows jsdom's and comes up unwired), which
 * is why the hook wraps every access in try/catch. Tests that need storage to
 * actually work install their own in-memory one rather than changing the shared
 * setup, which other suites exercise as the "storage unavailable" path.
 */
function installMemoryStorage() {
  const store = new Map<string, string>();
  /**
   * Every write, in order. The final value is not enough to catch the
   * write-back bug: a wipe followed by a restore inside the same `act()` leaves
   * the right value behind, so the damage is only visible in the sequence.
   */
  const writes: Array<{ key: string; value: string }> = [];
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        writes.push({ key, value: String(value) });
        store.set(key, String(value));
      },
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
  });

  const restore = () => {
    if (original) {
      Object.defineProperty(window, "localStorage", original);
    } else {
      delete (window as unknown as Record<string, unknown>).localStorage;
    }
  };

  return { restore, writes };
}

let consoleErrorMessages: string[] = [];
let restoreConsoleError: (() => void) | null = null;
let restoreStorage: (() => void) | null = null;
let storageWrites: Array<{ key: string; value: string }> = [];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const storage = installMemoryStorage();
  restoreStorage = storage.restore;
  storageWrites = storage.writes;
  consoleErrorMessages = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    consoleErrorMessages.push(String(args[0] ?? ""));
  });
  restoreConsoleError = () => spy.mockRestore();
});

afterEach(() => {
  restoreConsoleError?.();
  restoreConsoleError = null;
  restoreStorage?.();
  restoreStorage = null;
});

function hydrationComplaints() {
  return consoleErrorMessages.filter((message) =>
    /hydrat|did not match|server rendered/i.test(message),
  );
}

/**
 * Server-render with an empty store, then hydrate with `stored` in place —
 * exactly what a returning staffer's browser does.
 */
async function hydrateWithStoredValue(
  element: React.ReactElement,
  entries: Record<string, string>,
) {
  const serverHtml = renderToString(element);

  for (const [key, value] of Object.entries(entries)) {
    window.localStorage.setItem(key, value);
  }

  const container = document.createElement("div");
  container.innerHTML = serverHtml;
  document.body.appendChild(container);

  const onRecoverableError = vi.fn();
  let root: Root | undefined;
  await act(async () => {
    root = hydrateRoot(container, element, { onRecoverableError });
  });

  return {
    container,
    serverHtml,
    onRecoverableError,
    cleanup: async () => {
      await act(async () => {
        root?.unmount();
      });
      container.remove();
    },
  };
}

describe("useStoredPreference — hydration safety", () => {
  it("hydrates a stored payment mode against default-rendered HTML without a mismatch", async () => {
    const { container, serverHtml, onRecoverableError, cleanup } = await hydrateWithStoredValue(
      <ModeProbe />,
      { [MODE_KEY]: "upi" },
    );

    // The server has no storage, so it renders the default and omits the
    // non-cash block entirely.
    expect(serverHtml).toContain("cash");
    expect(serverHtml).not.toContain("reference optional");

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(hydrationComplaints()).toEqual([]);

    // The preference still applies once hydration has committed.
    expect(container.querySelector('[data-testid="mode"]')?.textContent).toBe("upi");
    expect(container.querySelector('[data-testid="non-cash-note"]')).not.toBeNull();

    await cleanup();
  });

  it("hydrates stored recent students against empty-rendered HTML without a mismatch", async () => {
    const stored = JSON.stringify(["stu-1", "stu-2", "stu-3"]);
    const { container, serverHtml, onRecoverableError, cleanup } = await hydrateWithStoredValue(
      <RecentsProbe />,
      { [RECENTS_KEY]: stored },
    );

    expect(serverHtml).not.toContain("stu-1");

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(hydrationComplaints()).toEqual([]);

    expect(container.querySelectorAll('[data-testid="recents"] li')).toHaveLength(3);

    await cleanup();
  });

  it("ignores junk in the store and keeps the server value", async () => {
    const { container, onRecoverableError, cleanup } = await hydrateWithStoredValue(
      <RecentsProbe />,
      { [RECENTS_KEY]: "{not json" },
    );

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[data-testid="recents"] li')).toHaveLength(0);
    // Junk must not be left behind for the next mount to trip over.
    expect(window.localStorage.getItem(RECENTS_KEY)).toBe("[]");

    await cleanup();
  });
});

describe("useStoredPreference — write-back ordering", () => {
  it("does not overwrite the stored value with the server default on mount", async () => {
    const { container, cleanup } = await hydrateWithStoredValue(<ModeProbe />, {
      [MODE_KEY]: "cheque",
    });

    // The regression this guards: the persist effect fires on the mount commit
    // too. If it is not gated on the restore having been applied to a render,
    // it writes "cash" over "cheque" before the restored value lands.
    //
    // Asserting the final value is NOT enough — the wipe and the rewrite both
    // happen inside the act() above, so the end state looks correct either way.
    // A gate that is a ref instead of state passes that check and still leaves a
    // window where a tab closed mid-commit loses the preference. So assert the
    // default was never written at all.
    expect(storageWrites.filter((write) => write.key === MODE_KEY)).not.toContainEqual({
      key: MODE_KEY,
      value: "cash",
    });
    expect(window.localStorage.getItem(MODE_KEY)).toBe("cheque");
    expect(container.querySelector('[data-testid="mode"]')?.textContent).toBe("cheque");

    await cleanup();
  });

  it("persists later changes", async () => {
    function Editable() {
      const [mode, setMode] = useStoredPreference<string>({
        key: MODE_KEY,
        serverValue: MODE_OPTIONS[0],
        parse: (raw) => (MODE_OPTIONS.includes(raw) ? raw : null),
        serialize: (value) => value,
      });

      return (
        <button type="button" data-testid="mode-button" onClick={() => setMode("upi")}>
          {mode}
        </button>
      );
    }

    const { container, cleanup } = await hydrateWithStoredValue(<Editable />, {
      [MODE_KEY]: "cheque",
    });

    const button = container.querySelector<HTMLButtonElement>('[data-testid="mode-button"]');
    await act(async () => {
      button?.click();
    });

    expect(window.localStorage.getItem(MODE_KEY)).toBe("upi");

    await cleanup();
  });
});

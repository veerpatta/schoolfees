"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a list screen's filters and the address bar agreeing with each other,
 * in both directions.
 *
 * Every list here used to write the URL and never read it: filters lived in
 * `useState` seeded once from server props, and an unguarded effect mirrored
 * them out with `history.replaceState`. That is fine until you come back.
 *
 * Press the browser back button after opening a record and the router restores
 * the tree from the payload it actually has — the one rendered for the
 * UNFILTERED url, because `replaceState` creates no router-cache entry for the
 * filtered one. The screen remounted with unfiltered props, the mirror effect
 * fired, and it wrote that empty state over the filters still sitting in the
 * address bar. Then the list refetched itself. Both halves of "it forgets my
 * filter and reloads" came from those two effects, in that order.
 *
 * So this hook does three things the screens were missing, and one they each
 * did differently:
 *
 *   1. On mount, if the URL disagrees with the props, the URL wins — it is the
 *      thing the user can see, and it is what a shared link means.
 *   2. It never writes the URL on the first render. Only a change the user
 *      made is mirrored out.
 *   3. It re-derives on `popstate`, so in-page back/forward works too.
 *   4. Optionally it remembers filters for the tab, scoped to one academic
 *      session so ids from another year can never be replayed.
 *
 * It deliberately does NOT own the screen's state. The four callers keep their
 * own `useState` shapes (Students splits filters from page, Transactions
 * carries a view, Defaulters posts a form) and hand this hook a serializer, a
 * parser, and somewhere to put an adopted value.
 */

export type UrlFilterCommitMode =
  /** Mirror with `history.replaceState` — for lists that fetch their own rows. */
  | "history"
  /** Navigate with `router.replace` — for filters the SERVER has to read. */
  | "router"
  /**
   * Do not write the URL at all.
   *
   * For a screen whose filters are a server-rendered form: submitting it is
   * already a real navigation, so the address bar is correct before this hook
   * ever sees the value. Such a screen still wants the rest — remembering the
   * set for the tab, dropping one stored against another session — which is
   * why "don't write" is a mode rather than a reason not to use the hook.
   */
  | "none";

export type UrlFilterSticky = {
  /** sessionStorage key. Version it, so a shape change can be invalidated. */
  key: string;
  /**
   * The academic session these filters were resolved against. A stored set
   * from a different session is discarded rather than replayed: a class id
   * from 2025-26 names nothing in 2026-27, and quietly re-applying one is how
   * a filtered list ends up lying about which year it is showing.
   */
  sessionLabel: string;
};

export type UrlFilterStateOptions<T> = {
  /** The route these filters belong to, e.g. "/protected/students". */
  pathname: string;
  /** The screen's current filter state. */
  value: T;
  /** State -> query string. Owns which keys this screen puts in the URL. */
  toParams: (value: T) => URLSearchParams;
  /** Query string -> state. The inverse of `toParams`. */
  fromParams: (params: URLSearchParams) => T;
  /**
   * Apply a value that came from somewhere other than the user: the URL on a
   * back-navigation, or storage on a fresh arrival. Callers use this to set
   * their state AND to refetch, because the rows on screen belong to the value
   * being replaced.
   */
  onAdopt: (value: T, source: "url" | "storage") => void;
  /** How a change reaches the address bar. Defaults to "history". */
  commit?: UrlFilterCommitMode;
  /** Remember filters for this tab. Omit for URL-only screens. */
  sticky?: UrlFilterSticky | null;
};

type StickyPayload = {
  session: string;
  query: string;
};

function readSticky(sticky: UrlFilterSticky | null | undefined): string | null {
  if (!sticky) return null;

  try {
    const raw = window.sessionStorage.getItem(sticky.key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StickyPayload> | null;
    if (!parsed || typeof parsed.query !== "string" || !parsed.query) return null;
    // The session guard. See UrlFilterSticky.sessionLabel.
    if (parsed.session !== sticky.sessionLabel) return null;

    return parsed.query;
  } catch {
    // Storage can be unavailable (private mode) or hold junk from an older
    // shape. Falling back to the URL is always correct.
    return null;
  }
}

function writeSticky(sticky: UrlFilterSticky | null | undefined, query: string) {
  if (!sticky) return;

  try {
    if (!query) {
      // Never persist an empty set: it would turn "I cleared my filters" into
      // a stored instruction to clear them again on every arrival.
      window.sessionStorage.removeItem(sticky.key);
      return;
    }

    const payload: StickyPayload = { session: sticky.sessionLabel, query };
    window.sessionStorage.setItem(sticky.key, JSON.stringify(payload));
  } catch {
    // Remembering is optional; the URL already carries the truth.
  }
}

export function useUrlFilterState<T>({
  pathname,
  value,
  toParams,
  fromParams,
  onAdopt,
  commit = "history",
  sticky = null,
}: UrlFilterStateOptions<T>) {
  const router = useRouter();

  // These are inline closures at every call site, so keep the latest without
  // making them effect dependencies.
  const toParamsRef = useRef(toParams);
  toParamsRef.current = toParams;
  const fromParamsRef = useRef(fromParams);
  fromParamsRef.current = fromParams;
  const onAdoptRef = useRef(onAdopt);
  onAdoptRef.current = onAdopt;
  const stickyRef = useRef(sticky);
  stickyRef.current = sticky;

  /**
   * The gate on writing the URL, and it has to be state rather than a ref.
   *
   * Effects in the same commit see a ref flipped by an earlier effect as
   * already true, but they still close over the pre-adoption value — so a ref
   * would let the very first mirror write the stale props back out, which is
   * the bug this hook exists to fix. State forces the first write onto a later
   * render that actually carries the adopted value. Same reasoning as
   * hooks/use-stored-preference.ts.
   */
  const [ready, setReady] = useState(false);
  const [adopted, setAdopted] = useState(false);

  /**
   * Normalise a query string through this screen's own parse+serialize pair.
   *
   * Comparing raw search strings would report a difference for key order, or
   * for a param the screen does not own (`tab`, `removed`, a stray `returnTo`).
   * Round-tripping reduces both sides to "the filters this screen means".
   */
  const canonical = useCallback((search: string) => {
    const parsed = fromParamsRef.current(new URLSearchParams(search));
    return toParamsRef.current(parsed).toString();
  }, []);

  // Mount: decide whether the props we rendered from are still the truth.
  useEffect(() => {
    const urlQuery = canonical(window.location.search);
    const propsQuery = toParamsRef.current(value).toString();

    if (urlQuery && urlQuery !== propsQuery) {
      // The tree came from a cached payload rendered for a different URL —
      // a back-navigation. The address bar is what the user is looking at.
      onAdoptRef.current(fromParamsRef.current(new URLSearchParams(window.location.search)), "url");
      setAdopted(true);
      setReady(true);
      return;
    }

    if (!urlQuery) {
      const stored = readSticky(stickyRef.current);
      if (stored) {
        onAdoptRef.current(fromParamsRef.current(new URLSearchParams(stored)), "storage");
        setAdopted(true);
        setReady(true);
        return;
      }
    }

    setReady(true);
    // Mount only. `value` is read once on purpose: this compares the URL
    // against what the SERVER rendered, and a later change is the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonical]);

  // Mirror changes out. Never on the first render — see `ready`.
  useEffect(() => {
    if (!ready) return;

    const query = toParamsRef.current(value).toString();
    const href = query ? `${pathname}?${query}` : pathname;

    writeSticky(stickyRef.current, query);

    if (commit === "none") return;

    if (canonical(window.location.search) === query) {
      // Already there — usually because we just adopted it. Writing again
      // would be a redundant history entry on the "router" path.
      return;
    }

    if (commit === "router") {
      // `replace`, never `push`: a filter change is not a destination, and an
      // entry per keystroke would make the back button walk the user
      // backwards through their own typing.
      router.replace(href);
      return;
    }

    window.history.replaceState(null, "", href);
  }, [ready, value, pathname, commit, router, canonical]);

  // In-page back/forward, for as long as the screen stays mounted.
  useEffect(() => {
    function onPopState() {
      onAdoptRef.current(
        fromParamsRef.current(new URLSearchParams(window.location.search)),
        "url",
      );
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return { adopted };
}

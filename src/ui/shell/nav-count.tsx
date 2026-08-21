"use client";

import { type ReactNode, Suspense, use } from "react";

export type NavCounts = Partial<Record<string, number>>;

type NavCountProps = {
  /** Already-resolved counts. Wins over `countsPromise` when both are given. */
  counts?: NavCounts;
  /** Counts still in flight from the shell. Unwrapped inside a boundary. */
  countsPromise?: Promise<NavCounts>;
  /** Pull the number this badge shows out of the counts map. */
  select: (counts: NavCounts) => number | undefined;
  /** Render the badge. Not called at all when the count is absent or zero. */
  children: (count: number) => ReactNode;
};

function ResolvedNavCount({
  countsPromise,
  select,
  children,
}: Required<Pick<NavCountProps, "countsPromise" | "select" | "children">>) {
  return <NavCountValue count={select(use(countsPromise))}>{children}</NavCountValue>;
}

function NavCountValue({
  count,
  children,
}: {
  count: number | undefined;
  children: (count: number) => ReactNode;
}) {
  if (typeof count !== "number" || count <= 0) {
    return null;
  }

  return <>{children(count)}</>;
}

/**
 * A nav badge whose number may not have arrived yet.
 *
 * The workspace shell used to `await` its three reads before emitting a single
 * byte of chrome, which also held back the child route's `loading.tsx` — so on
 * a cold launch nothing at all was on screen until the slow part was over. The
 * shell now hands its promises down instead, and each badge waits inside its
 * own tiny boundary: the nav paints immediately, and the numbers land a beat
 * later without moving anything (the sidebar badge is `ml-auto`, the phone
 * badge is absolutely positioned).
 *
 * `counts` is still accepted for callers that already have the numbers —
 * nothing outside the shell has to change to keep working.
 */
export function NavCount({ counts, countsPromise, select, children }: NavCountProps) {
  if (counts) {
    return <NavCountValue count={select(counts)}>{children}</NavCountValue>;
  }

  if (!countsPromise) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <ResolvedNavCount countsPromise={countsPromise} select={select}>
        {children}
      </ResolvedNavCount>
    </Suspense>
  );
}

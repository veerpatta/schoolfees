"use client";

/**
 * Collect context — owns the "open the Collect drawer with this student"
 * intent globally so any list page or row can trigger it without
 * threading props.
 *
 * The drawer is intentionally a thin layer on top of the existing Payment
 * Desk page — it shows the student's pending snapshot and routes into
 * /protected/payments?studentId=… on confirm. It does NOT post payments
 * itself; the existing post_student_payment RPC stays the only path.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type CollectIntent = {
  /** UUID of the student to pre-fill. */
  studentId: string;
  /** Optional display label so the drawer can render before fetch. */
  studentLabel?: string;
  /** Optional class label to render under the name. */
  classLabel?: string;
  /** Where to return after the user posts a payment or cancels. */
  returnTo?: string;
};

export type CollectContextValue = {
  intent: CollectIntent | null;
  open: (intent: CollectIntent) => void;
  close: () => void;
};

const CollectContext = createContext<CollectContextValue | null>(null);

/**
 * Stable safe-default returned by `useCollect()` when no provider is
 * mounted. Exported so tests can assert the inert contract without having
 * to invoke a React hook outside a render.
 */
export const COLLECT_SAFE_DEFAULT: CollectContextValue = Object.freeze({
  intent: null,
  open: () => {},
  close: () => {},
});

export function CollectProvider({ children }: { children: React.ReactNode }) {
  const [intent, setIntent] = useState<CollectIntent | null>(null);

  const open = useCallback((next: CollectIntent) => setIntent(next), []);
  const close = useCallback(() => setIntent(null), []);

  const value = useMemo<CollectContextValue>(
    () => ({ intent, open, close }),
    [close, intent, open],
  );

  return <CollectContext.Provider value={value}>{children}</CollectContext.Provider>;
}

export function useCollect(): CollectContextValue {
  const ctx = useContext(CollectContext);
  return ctx ?? COLLECT_SAFE_DEFAULT;
}

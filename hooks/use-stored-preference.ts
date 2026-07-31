import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

type StoredPreferenceOptions<T> = {
  /** localStorage key. */
  key: string;
  /**
   * What the server rendered. The hydration render returns exactly this, so it
   * must be a value the server could actually have produced.
   */
  serverValue: T;
  /** Turn a stored string into a value, or null to keep `serverValue`. */
  parse: (raw: string) => T | null;
  /** Turn a value into the stored string. */
  serialize: (value: T) => string;
};

/**
 * Component state that remembers itself in localStorage across visits, without
 * breaking hydration.
 *
 * The naive version of this — `useState(() => typeof window !== "undefined" ?
 * localStorage.getItem(key) : fallback)` — is NOT hydration-safe. `window` is
 * fully available during hydration, so the first CLIENT render returns the
 * stored value while the server HTML was built from the fallback. Anything
 * rendered from it then hydrates against markup that never contained it. That
 * was the Payment Desk's recent-student chips and its payment-mode row, and the
 * same mistake in `useMediaQuery` was what Sentry reported as a hydration error
 * on the Students list (SCHOOLFEES-6).
 *
 * So: render the server value, adopt the stored one after mount.
 *
 * The subtle half is the write-back. A "persist on change" effect fires on the
 * mount commit too, which means a naive split (seed default, restore in one
 * effect, persist in another) writes the pre-restore default over the very
 * value still waiting to be read. Note that a ref flipped inside the restore
 * effect does NOT fix that: effects in the same commit see the flag already
 * true but still close over the pre-restore value. The gate has to be state, so
 * the first persist happens on a later render that actually carries the
 * restored value. Reading and writing live together in here so that ordering
 * cannot be broken by moving an effect around later.
 */
export function useStoredPreference<T>({
  key,
  serverValue,
  parse,
  serialize,
}: StoredPreferenceOptions<T>): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(serverValue);
  const [restored, setRestored] = useState(false);

  // `parse`/`serialize` are typically inline closures, so keep the latest
  // without making them dependencies of the effects.
  const parseRef = useRef(parse);
  parseRef.current = parse;
  const serializeRef = useRef(serialize);
  serializeRef.current = serialize;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        const parsed = parseRef.current(raw);
        if (parsed !== null) {
          setValue(parsed);
        }
      }
    } catch {
      // Storage can be unavailable (private mode) or hold junk. The server
      // value already applies.
    } finally {
      setRestored(true);
    }
  }, [key]);

  useEffect(() => {
    // Never write before the read has been applied to a render.
    if (!restored) return;

    try {
      window.localStorage.setItem(key, serializeRef.current(value));
    } catch {
      // Storage may be unavailable; remembering the preference is optional.
    }
  }, [key, restored, value]);

  return [value, setValue];
}

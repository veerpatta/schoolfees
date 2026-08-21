/**
 * Saved-views — opt-in per-page persistence of {filters, sort, density, columns}.
 *
 * Stored in localStorage under `vpps.views.<tableKey>` so a user can keep
 * "My class 10 defaulters", "UPI payments this week" without server
 * round-trips. Server-side persistence is out of scope for this pass.
 *
 * The page owns what goes in `state` — this module is type-erased over
 * `unknown` so any list page can adopt without us prescribing a shape.
 */

export type SavedView<TState = unknown> = {
  id: string;
  /** User-facing name. */
  label: string;
  /** Opaque, page-owned state blob. */
  state: TState;
  /** Optional: marks the bundled default view that ships with the page. */
  builtIn?: boolean;
  createdAt: number;
};

function storageKey(tableKey: string) {
  return `vpps.views.${tableKey}`;
}

function readAll<T>(tableKey: string): SavedView<T>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(tableKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is SavedView<T> => {
      return (
        v &&
        typeof v === "object" &&
        typeof v.id === "string" &&
        typeof v.label === "string" &&
        typeof v.createdAt === "number"
      );
    });
  } catch {
    return [];
  }
}

function writeAll<T>(tableKey: string, views: SavedView<T>[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(tableKey), JSON.stringify(views));
  } catch {
    // Quota / privacy — ignore.
  }
}

export function listSavedViews<T>(tableKey: string): SavedView<T>[] {
  return readAll<T>(tableKey).sort((a, b) => {
    // Built-in first, then most-recent.
    if (a.builtIn && !b.builtIn) return -1;
    if (!a.builtIn && b.builtIn) return 1;
    return b.createdAt - a.createdAt;
  });
}

export function saveView<T>(tableKey: string, view: Omit<SavedView<T>, "createdAt">): SavedView<T> {
  const next: SavedView<T> = { ...view, createdAt: Date.now() };
  const existing = readAll<T>(tableKey).filter((v) => v.id !== view.id);
  writeAll(tableKey, [next, ...existing]);
  return next;
}

export function deleteView(tableKey: string, id: string): void {
  const existing = readAll(tableKey).filter((v) => v.id !== id);
  writeAll(tableKey, existing);
}

export function renameView(tableKey: string, id: string, label: string): void {
  const existing = readAll(tableKey).map((v) => (v.id === id ? { ...v, label } : v));
  writeAll(tableKey, existing);
}

/**
 * Sanitize a free-form label into a stable storage id.
 *
 * Lower-case, strip non-alphanumerics, collapse repeats, prefix with "u:"
 * to keep user-created ids distinguishable from built-in ones.
 */
export function generateViewId(label: string): string {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "view";
  return `u:${slug}:${Date.now().toString(36)}`;
}

/**
 * Recently-used command items — localStorage-backed, capped at 8.
 *
 * Stored under `vpps.command.recents` as a JSON array. Each entry holds
 * just enough to re-render the row without re-fetching: kind, id, label,
 * hint, href (for routes/students/receipts), timestamp.
 *
 * Reads and writes guard against quota/parse errors so a corrupt entry
 * never crashes the palette.
 */

export type RecentKind = "route" | "student" | "receipt" | "action" | "setting";

export type RecentEntry = {
  id: string;
  kind: RecentKind;
  label: string;
  hint?: string;
  href?: string;
  at: number;
};

const STORAGE_KEY = "vpps.command.recents";
const MAX_ENTRIES = 8;

function readAll(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is RecentEntry => {
      return (
        entry &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        typeof entry.label === "string" &&
        typeof entry.at === "number"
      );
    });
  } catch {
    return [];
  }
}

function writeAll(entries: RecentEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore quota/privacy mode errors.
  }
}

export function listRecents(): RecentEntry[] {
  return readAll().sort((a, b) => b.at - a.at);
}

export function pushRecent(entry: Omit<RecentEntry, "at">): void {
  const now = Date.now();
  const existing = readAll().filter((row) => !(row.kind === entry.kind && row.id === entry.id));
  const next = [{ ...entry, at: now }, ...existing].slice(0, MAX_ENTRIES);
  writeAll(next);
}

export function clearRecents(): void {
  writeAll([]);
}

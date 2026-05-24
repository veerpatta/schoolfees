/**
 * Single registry of keyboard shortcuts surfaced in the "?" help sheet.
 *
 * The palette only owns Cmd/Ctrl+K and "?" today. We keep this list ready
 * so future phases (table j/k nav, payment-desk shortcuts) can register
 * without duplicating presentation logic.
 */

export type ShortcutDef = {
  combo: string;
  description: string;
  /** Group label shown in the help sheet. */
  group: "Global" | "Navigation" | "Lists" | "Payments";
};

export const SHORTCUTS: readonly ShortcutDef[] = [
  { combo: "Ctrl/Cmd + K", description: "Open command palette", group: "Global" },
  { combo: "/", description: "Open command palette (when not typing)", group: "Global" },
  { combo: "?", description: "Show keyboard shortcuts", group: "Global" },
  { combo: "Esc", description: "Close palette / dialog", group: "Global" },
  { combo: "↑ / ↓", description: "Move selection in palette", group: "Global" },
  { combo: "Enter", description: "Activate selected item", group: "Global" },
  { combo: "Ctrl/Cmd + 1..9", description: "Activate the Nth visible item", group: "Global" },
];

/**
 * Pure helper — used by tests and the help sheet. Returns shortcuts grouped
 * by their `group` field while preserving registration order within each
 * group.
 */
export function groupShortcuts(): Array<{ group: ShortcutDef["group"]; items: ShortcutDef[] }> {
  const order: ShortcutDef["group"][] = ["Global", "Navigation", "Lists", "Payments"];
  return order
    .map((group) => ({
      group,
      items: SHORTCUTS.filter((s) => s.group === group),
    }))
    .filter((bucket) => bucket.items.length > 0);
}

/**
 * Command palette public types.
 *
 * The palette accepts a flat list of "providers" — each provider knows how
 * to turn a query into items. Items render as rows; activating one fires
 * its `onSelect`. Keeping the contract tiny so we can add providers without
 * touching the palette component.
 */

import type { LucideIcon } from "lucide-react";

export type CommandItem = {
  /** Stable across renders — used for keyed lists and recents storage. */
  id: string;
  /** Provider id the item came from (used for grouping). */
  providerId: string;
  /** Primary label (left side). */
  label: string;
  /** Optional secondary label (right side / muted). */
  hint?: string;
  /** Optional small description below the label. */
  description?: string;
  /** Optional icon shown left of the label. */
  icon?: LucideIcon;
  /** Keywords searched in addition to label/hint. */
  keywords?: string[];
  /** What happens when the user activates the item. */
  onSelect: (ctx: CommandSelectContext) => void;
  /** Optional kind for analytics / "recently viewed" storage. */
  kind?: "route" | "student" | "receipt" | "action" | "setting";
  /** Optional metadata persisted with recents. */
  meta?: Record<string, string | number>;
};

export type CommandSelectContext = {
  /** Close the palette. Providers should call this on success. */
  close: () => void;
  /** Push a route via Next.js router. */
  push: (href: string) => void;
};

export type CommandProvider = {
  id: string;
  /** Section header rendered above this provider's items. */
  label: string;
  /** Priority for ordering provider groups in the palette (higher first). */
  priority?: number;
  /**
   * Fetch items for the current query. Receives an AbortSignal — providers
   * MUST honor it so stale fetches don't render. Return [] on empty query
   * to suppress the group, or return a short curated list (recents,
   * defaults, pins).
   */
  fetch: (query: string, signal: AbortSignal) => Promise<CommandItem[]>;
};

export type CommandGroup = {
  provider: CommandProvider;
  items: CommandItem[];
};

"use client";

/**
 * Navigation provider — every workspace item the role can see.
 *
 * Takes a JSON-SERIALIZABLE shape (no React component refs). Icons are
 * intentionally not part of `CommandNavItem` because server-rendered
 * data can't carry function references across the boundary. The
 * provider re-attaches a generic Compass icon on the client side so
 * every nav row has consistent chrome.
 */

import { Compass } from "lucide-react";

import type { CommandItem, CommandProvider } from "@/lib/command/types";

export type CommandNavItem = {
  href: string;
  label: string;
  description: string;
  /** Optional alias paths the search should match. */
  aliases?: readonly string[];
};

function matchesQuery(item: CommandItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (item.label.toLowerCase().includes(q)) return true;
  if (item.hint?.toLowerCase().includes(q)) return true;
  return item.keywords?.some((kw) => kw.toLowerCase().includes(q)) ?? false;
}

export function createNavProvider(
  items: readonly CommandNavItem[],
): CommandProvider {
  const baseItems: CommandItem[] = items.map((nav) => ({
    id: `nav:${nav.href}`,
    providerId: "navigation",
    label: nav.label,
    hint: "Go to page",
    description: nav.description,
    icon: Compass,
    keywords: nav.aliases?.map((alias) => alias.replace("/protected/", "")) ?? [],
    kind: "route",
    onSelect: ({ push, close }) => {
      push(nav.href);
      close();
    },
  }));

  return {
    id: "navigation",
    label: "Go to",
    priority: 60,
    fetch: async (query) => baseItems.filter((item) => matchesQuery(item, query)),
  };
}

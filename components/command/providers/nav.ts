"use client";

/**
 * Navigation provider — every workspace item the role can see.
 *
 * Receives the visible navigation set as a factory parameter so the
 * palette host can pass role-filtered items without this provider
 * needing to know about auth.
 */

import type { CommandItem, CommandProvider } from "@/lib/command/types";
import type { ProtectedNavigationItem } from "@/lib/config/navigation";

function matchesQuery(item: CommandItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (item.label.toLowerCase().includes(q)) return true;
  if (item.hint?.toLowerCase().includes(q)) return true;
  return item.keywords?.some((kw) => kw.toLowerCase().includes(q)) ?? false;
}

export function createNavProvider(
  items: readonly ProtectedNavigationItem[],
): CommandProvider {
  const baseItems: CommandItem[] = items.map((nav) => ({
    id: `nav:${nav.href}`,
    providerId: "navigation",
    label: nav.label,
    hint: "Go to page",
    description: nav.description,
    icon: nav.icon,
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

"use client";

/**
 * Static admin actions — always available in the palette.
 *
 * Items here trigger app-level intents (post a payment, open settings,
 * toggle theme). Provider filters by simple substring match so it can
 * stay lazy and zero-fetch.
 */

import {
  BadgeIndianRupee,
  ClipboardList,
  FileSpreadsheet,
  Keyboard,
  Moon,
  Settings2,
  Sun,
} from "lucide-react";

import type { CommandItem, CommandProvider } from "@/lib/command/types";

const ACTIONS: CommandItem[] = [
  {
    id: "action:post-payment",
    providerId: "actions",
    label: "Post a payment",
    hint: "Open Payment Desk",
    icon: BadgeIndianRupee,
    keywords: ["collect", "receipt", "pay", "post"],
    kind: "action",
    onSelect: ({ push, close }) => {
      push("/protected/payments");
      close();
    },
  },
  {
    id: "action:open-defaulters",
    providerId: "actions",
    label: "Open defaulters",
    hint: "Follow-up queue",
    icon: ClipboardList,
    keywords: ["dues", "follow-up", "chase"],
    kind: "action",
    onSelect: ({ push, close }) => {
      push("/protected/defaulters");
      close();
    },
  },
  {
    id: "action:export-collections",
    providerId: "actions",
    label: "Export collections",
    hint: "Download XLSX",
    icon: FileSpreadsheet,
    keywords: ["excel", "xlsx", "download", "report"],
    kind: "action",
    onSelect: ({ push, close }) => {
      push("/protected/exports");
      close();
    },
  },
  {
    id: "action:open-settings",
    providerId: "actions",
    label: "Open settings",
    hint: "School and app settings",
    icon: Settings2,
    keywords: ["preferences", "config"],
    kind: "action",
    onSelect: ({ push, close }) => {
      push("/protected/settings");
      close();
    },
  },
  {
    id: "action:toggle-theme",
    providerId: "actions",
    label: "Toggle theme (light/dark)",
    icon: Moon,
    keywords: ["dark", "light", "appearance"],
    kind: "action",
    onSelect: ({ close }) => {
      // Defer to next-themes on the global by clicking the toolbar toggle.
      // We dispatch a synthetic event the toolbar listens for, defined in
      // ThemeToggle's host. As a safe fallback, set the class directly.
      const html = document.documentElement;
      const isDark = html.classList.contains("dark");
      try {
        window.localStorage.setItem("vpps.theme", isDark ? "light" : "dark");
      } catch {
        // best-effort
      }
      html.classList.toggle("dark");
      close();
    },
  },
  {
    id: "action:keyboard-shortcuts",
    providerId: "actions",
    label: "Keyboard shortcuts",
    hint: "Press ?",
    icon: Keyboard,
    keywords: ["help", "keys", "shortcuts"],
    kind: "action",
    onSelect: ({ close }) => {
      window.dispatchEvent(new CustomEvent("vpps:open-shortcuts"));
      close();
    },
  },
  {
    id: "action:light-theme",
    providerId: "actions",
    label: "Switch to light theme",
    icon: Sun,
    keywords: ["bright", "day"],
    kind: "action",
    onSelect: ({ close }) => {
      document.documentElement.classList.remove("dark");
      try {
        window.localStorage.setItem("vpps.theme", "light");
      } catch {
        // best-effort
      }
      close();
    },
  },
];

function matchesQuery(item: CommandItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (item.label.toLowerCase().includes(q)) return true;
  if (item.hint?.toLowerCase().includes(q)) return true;
  return item.keywords?.some((kw) => kw.toLowerCase().includes(q)) ?? false;
}

export const actionsProvider: CommandProvider = {
  id: "actions",
  label: "Actions",
  priority: 80,
  fetch: async (query) => {
    return ACTIONS.filter((item) => matchesQuery(item, query));
  },
};

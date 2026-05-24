"use client";

/**
 * Host that mounts the command palette + shortcuts sheet for the protected
 * workspace.
 *
 * IMPORTANT: takes a JSON-SERIALIZABLE navigation shape.
 *
 * Why this matters: `ProtectedNavigationItem.icon` is a `LucideIcon`
 * (a React component reference). Next.js App Router cannot serialize
 * function/component values across the server→client boundary. Passing
 * the raw nav array crashes at render with a generic deployment-env
 * error fallback. We strip the icon in the server layout, pass plain
 * data here, and the nav provider re-attaches a generic icon on the
 * client side.
 */

import { useMemo } from "react";

import type { CommandProvider } from "@/lib/command/types";

import { CommandPalette } from "./command-palette";
import { KeyboardShortcutsSheet } from "./keyboard-shortcuts-sheet";
import { actionsProvider } from "./providers/actions";
import { createNavProvider, type CommandNavItem } from "./providers/nav";
import { receiptsProvider } from "./providers/receipts";
import { studentsProvider } from "./providers/students";

type CommandHostProps = {
  /**
   * Role-visible navigation items, already stripped of LucideIcon refs
   * by the server layout so they cross the boundary cleanly.
   */
  navigation: readonly CommandNavItem[];
  /** Permissions to gate provider inclusion. */
  canViewStudents: boolean;
  canViewReceipts: boolean;
};

export function CommandHost({
  navigation,
  canViewStudents,
  canViewReceipts,
}: CommandHostProps) {
  const providers = useMemo<CommandProvider[]>(() => {
    const list: CommandProvider[] = [];
    if (canViewStudents) list.push(studentsProvider);
    if (canViewReceipts) list.push(receiptsProvider);
    list.push(createNavProvider(navigation));
    list.push(actionsProvider);
    return list;
  }, [canViewReceipts, canViewStudents, navigation]);

  return (
    <>
      <CommandPalette providers={providers} />
      <KeyboardShortcutsSheet />
    </>
  );
}

export type { CommandNavItem };

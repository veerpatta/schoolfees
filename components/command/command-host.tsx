"use client";

/**
 * Host that mounts the command palette + shortcuts sheet for the protected
 * workspace. Takes role-filtered navigation items as a server-rendered
 * prop so the palette doesn't need to know about auth.
 */

import { useMemo } from "react";

import type { ProtectedNavigationItem } from "@/lib/config/navigation";
import type { CommandProvider } from "@/lib/command/types";

import { CommandPalette } from "./command-palette";
import { KeyboardShortcutsSheet } from "./keyboard-shortcuts-sheet";
import { actionsProvider } from "./providers/actions";
import { createNavProvider } from "./providers/nav";
import { receiptsProvider } from "./providers/receipts";
import { studentsProvider } from "./providers/students";

type SerializableNavItem = Omit<ProtectedNavigationItem, "icon">;

type CommandHostProps = {
  /** Role-visible navigation items (serializable — icons are looked up here). */
  navigation: readonly ProtectedNavigationItem[];
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

// Re-export the prop type so server callers can adapt nav shapes as needed.
export type { SerializableNavItem };

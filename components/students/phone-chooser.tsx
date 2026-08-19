"use client";

import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Re-exported for the call sites that want both. The definitions live in a
// Radix-free module so importing the helper alone does not pull this file's
// dropdown into the bundle.
import type { PhoneEntry } from "@/components/students/phone-entries";

export {
  buildStudentPhoneEntries,
  type PhoneEntry,
} from "@/components/students/phone-entries";

type PhoneActionMenuProps = {
  /** Non-empty phone entries. When empty the component renders nothing. */
  entries: PhoneEntry[];
  /** Invoked with the chosen number. With one entry it fires immediately. */
  onSelect: (phone: string, entry: PhoneEntry) => void;
  /** The trigger element (e.g. a Button). */
  children: React.ReactNode;
  /** Optional heading shown above the choices when there are two numbers. */
  menuLabel?: string;
};

/**
 * Wraps an action trigger so that, when a student has two numbers, the staff
 * member is asked which one to use; with a single number it acts directly.
 * Reused by Call, WhatsApp reminder, and the fee-share fallback.
 */
export function PhoneActionMenu({
  entries,
  onSelect,
  children,
  menuLabel,
}: PhoneActionMenuProps) {
  if (entries.length === 0) {
    return null;
  }

  if (entries.length === 1) {
    return (
      <span
        role="button"
        tabIndex={0}
        className="contents"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(entries[0].phone, entries[0]);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          onSelect(entries[0].phone, entries[0]);
        }}
      >
        {children}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {menuLabel ? <DropdownMenuLabel>{menuLabel}</DropdownMenuLabel> : null}
        {entries.map((entry) => (
          <DropdownMenuItem
            key={entry.phone}
            onSelect={() => onSelect(entry.phone, entry)}
            className="flex items-center justify-between gap-3"
          >
            <span className="font-medium text-foreground">{entry.label}</span>
            <span className="font-mono text-xs text-muted-foreground">{entry.phone}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

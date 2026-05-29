"use client";

import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type PhoneEntry = { label: string; phone: string };

/**
 * Build the list of usable parent phone numbers for a student. The student
 * record stores at most two numbers (primary → "Father", secondary →
 * "Mother"); placeholders/blanks are dropped.
 */
export function buildStudentPhoneEntries(student: {
  fatherPhone?: string | null;
  motherPhone?: string | null;
}): PhoneEntry[] {
  const entries: PhoneEntry[] = [];
  const father = student.fatherPhone?.trim();
  const mother = student.motherPhone?.trim();
  if (father) entries.push({ label: "Father", phone: father });
  if (mother) entries.push({ label: "Mother", phone: mother });
  return entries;
}

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

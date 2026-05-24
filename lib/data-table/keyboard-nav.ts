"use client";

/**
 * Row keyboard navigation hook — j/k/Arrow Up/Down to move, Enter to open,
 * "e" to edit. Page passes ordered row ids and the open/edit handlers; the
 * hook owns "current cursor index" and listens for keys when no input is
 * focused.
 */

import { useCallback, useEffect, useState } from "react";

type UseRowKeyboardNavOptions = {
  rowIds: readonly string[];
  onOpen?: (id: string) => void;
  onEdit?: (id: string) => void;
  /** Defaults to true. Pass false to disable globally without unmounting. */
  enabled?: boolean;
};

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function useRowKeyboardNav({
  rowIds,
  onOpen,
  onEdit,
  enabled = true,
}: UseRowKeyboardNavOptions) {
  const [cursor, setCursor] = useState(0);

  // Clamp cursor when the row set shrinks.
  useEffect(() => {
    if (cursor >= rowIds.length) {
      setCursor(Math.max(0, rowIds.length - 1));
    }
  }, [cursor, rowIds.length]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      if (rowIds.length === 0) return;
      const key = event.key.toLowerCase();
      if (key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setCursor((idx) => Math.min(rowIds.length - 1, idx + 1));
        return;
      }
      if (key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setCursor((idx) => Math.max(0, idx - 1));
        return;
      }
      if (event.key === "Enter" && onOpen) {
        event.preventDefault();
        onOpen(rowIds[cursor]);
        return;
      }
      if (key === "e" && onEdit) {
        event.preventDefault();
        onEdit(rowIds[cursor]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cursor, enabled, onEdit, onOpen, rowIds]);

  const setCursorTo = useCallback(
    (id: string) => {
      const idx = rowIds.indexOf(id);
      if (idx >= 0) setCursor(idx);
    },
    [rowIds],
  );

  return {
    cursor,
    cursorId: rowIds[cursor] ?? null,
    setCursor,
    setCursorTo,
  };
}

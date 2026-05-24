"use client";

/**
 * Saved-views tab strip — renders above the table toolbar.
 *
 * Caller owns the state-shape: serializes a view to a JSON-safe object,
 * decides what "current" means, and applies a loaded view via `onApply`.
 * Built-in views (e.g. "All", "Mine") are passed as `builtIns` and never
 * persisted to localStorage.
 */

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Pin, Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  type SavedView,
  deleteView,
  generateViewId,
  listSavedViews,
  saveView,
} from "@/lib/data-table/saved-views";

type SavedViewsTabsProps<T> = {
  tableKey: string;
  /** Built-in views always shown first. */
  builtIns?: readonly SavedView<T>[];
  /** Currently active view id, or null for "no view selected". */
  activeId: string | null;
  onApply: (view: SavedView<T>) => void;
  /** Snapshot of current state — used when the user clicks "Save view". */
  currentState: T;
  /** Optional decorator slot at the end of the tab strip. */
  trailing?: ReactNode;
  className?: string;
};

export function SavedViewsTabs<T>({
  tableKey,
  builtIns = [],
  activeId,
  onApply,
  currentState,
  trailing,
  className,
}: SavedViewsTabsProps<T>) {
  const [userViews, setUserViews] = useState<SavedView<T>[]>([]);
  const [namingNew, setNamingNew] = useState(false);
  const [newName, setNewName] = useState("");

  // Hydrate after mount to avoid SSR mismatches.
  useEffect(() => {
    setUserViews(listSavedViews<T>(tableKey));
  }, [tableKey]);

  const all = useMemo<SavedView<T>[]>(() => {
    return [...builtIns, ...userViews];
  }, [builtIns, userViews]);

  const handleSave = () => {
    const label = newName.trim();
    if (!label) return;
    const created = saveView(tableKey, {
      id: generateViewId(label),
      label,
      state: currentState,
    });
    setUserViews((prev) => [created, ...prev.filter((v) => v.id !== created.id)]);
    setNamingNew(false);
    setNewName("");
    onApply(created);
  };

  const handleDelete = (id: string) => {
    deleteView(tableKey, id);
    setUserViews((prev) => prev.filter((v) => v.id !== id));
  };

  return (
    <div
      className={cn(
        "no-scrollbar flex items-center gap-1 overflow-x-auto border-b border-border pb-1",
        className,
      )}
      role="tablist"
      aria-label="Saved views"
    >
      {all.map((view) => {
        const isActive = view.id === activeId;
        return (
          <div key={view.id} className="group/view flex shrink-0 items-center">
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onApply(view)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "bg-accent-soft text-accent-soft-foreground"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {view.builtIn ? (
                <Pin className="size-3" aria-hidden="true" />
              ) : null}
              {view.label}
            </button>
            {!view.builtIn ? (
              <button
                type="button"
                onClick={() => handleDelete(view.id)}
                aria-label={`Delete view ${view.label}`}
                className="ml-0.5 hidden size-5 place-items-center rounded text-muted-foreground hover:bg-destructive-soft hover:text-destructive group-hover/view:grid"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        );
      })}

      {namingNew ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
          className="ml-1 flex shrink-0 items-center gap-1"
        >
          <input
            autoFocus
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="View name"
            className="h-7 rounded-md border border-border bg-surface px-2 text-xs text-foreground placeholder:text-muted-foreground focus-ring"
          />
          <button
            type="submit"
            className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground hover:bg-accent/90"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setNamingNew(false);
              setNewName("");
            }}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setNamingNew(true)}
          className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <Plus className="size-3" />
          Save view
        </button>
      )}

      {trailing ? <div className="ml-auto flex shrink-0 items-center">{trailing}</div> : null}
    </div>
  );
}

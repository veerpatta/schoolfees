"use client";

/**
 * Command palette — Cmd/Ctrl+K, "/" (when not typing).
 *
 * Zero new heavy deps. Composes:
 *   - debounced fan-out across providers
 *   - AbortSignal per query so late responses can't overwrite fresh ones
 *   - keyboard nav: arrows / Enter / Esc / Cmd-1..9
 *   - recent items + provider-grouped results
 *
 * The palette is mounted once at the protected layout; activation is global.
 */

import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Clock, Search, X } from "lucide-react";

import type { CommandGroup, CommandItem, CommandProvider } from "@/lib/command/types";
import { listRecents } from "@/lib/command/recents";
import { cn } from "@/lib/utils";

type CommandPaletteProps = {
  providers: readonly CommandProvider[];
};

const DEBOUNCE_MS = 150;

function useGlobalShortcut(setOpen: (open: boolean) => void) {
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return target.isContentEditable;
    };

    const onKey = (event: globalThis.KeyboardEvent) => {
      const isMod = event.ctrlKey || event.metaKey;
      if (isMod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      // "/" only opens when the user is not typing into a field.
      if (event.key === "/" && !isTyping(event.target)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setOpen]);
}

function useDebouncedQuery(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function flattenGroups(groups: CommandGroup[]): CommandItem[] {
  return groups.flatMap((group) => group.items);
}

export function CommandPalette({ providers }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [groups, setGroups] = useState<CommandGroup[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedQuery(query, DEBOUNCE_MS);

  useGlobalShortcut(setOpen);

  // Reset state when opening; restore focus to input.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Defer to let the dialog render before we focus.
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return;
  }, [open]);

  // Esc / outside click is wired below in the JSX.

  // Fan out the query across providers with per-call abort.
  useEffect(() => {
    if (!open) return;

    const trimmed = debouncedQuery.trim();
    let cancelled = false;
    const controllers: AbortController[] = [];

    const run = async () => {
      // Empty query: show recents + zero-fetch providers (anything with
      // priority that returns items for "").
      const promises = providers.map(async (provider) => {
        const controller = new AbortController();
        controllers.push(controller);
        try {
          const items = await provider.fetch(trimmed, controller.signal);
          return { provider, items } satisfies CommandGroup;
        } catch (error) {
          if (controller.signal.aborted) return null;
          if (error instanceof DOMException && error.name === "AbortError") return null;
          return { provider, items: [] } satisfies CommandGroup;
        }
      });
      const settled = await Promise.all(promises);
      if (cancelled) return;
      const next = (settled.filter(Boolean) as CommandGroup[])
        .filter((group) => group.items.length > 0)
        .sort((a, b) => (b.provider.priority ?? 0) - (a.provider.priority ?? 0));
      setGroups(next);
      setSelectedIndex(0);
    };

    run();
    return () => {
      cancelled = true;
      controllers.forEach((c) => c.abort());
    };
  }, [open, debouncedQuery, providers]);

  // Recents block — only shown for empty queries.
  const recents = useMemo(() => (open && query === "" ? listRecents() : []), [open, query]);

  const flat = useMemo(() => flattenGroups(groups), [groups]);
  const recentItems = useMemo<CommandItem[]>(
    () =>
      recents.map((entry) => ({
        id: `recent:${entry.kind}:${entry.id}`,
        providerId: "recents",
        label: entry.label,
        hint: entry.hint,
        icon: Clock,
        kind: entry.kind,
        onSelect: ({ push, close }) => {
          if (entry.href) push(entry.href);
          close();
        },
      })),
    [recents],
  );

  const totalItems = recentItems.length + flat.length;

  const activate = useCallback(
    (item: CommandItem | undefined) => {
      if (!item) return;
      item.onSelect({
        close: () => setOpen(false),
        push: (href) => router.push(href),
      });
    },
    [router],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((idx) => (idx + 1) % Math.max(totalItems, 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((idx) => (idx - 1 + Math.max(totalItems, 1)) % Math.max(totalItems, 1));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const item = selectedIndex < recentItems.length
          ? recentItems[selectedIndex]
          : flat[selectedIndex - recentItems.length];
        activate(item);
        return;
      }
      // Cmd-1..9 — quick activate
      if ((event.metaKey || event.ctrlKey) && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        const targetIdx = Number.parseInt(event.key, 10) - 1;
        const item = targetIdx < recentItems.length
          ? recentItems[targetIdx]
          : flat[targetIdx - recentItems.length];
        activate(item);
      }
    },
    [activate, flat, recentItems, selectedIndex, totalItems],
  );

  if (!open) return null;
  if (typeof document === "undefined") return null;

  // We render in a portal so the palette is layered above everything.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[8dvh]"
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        aria-label="Close command palette"
        onClick={() => setOpen(false)}
        className="absolute inset-0 scrim anim-fade-in"
        style={{ animationDuration: "150ms" }}
      />
      <div
        /* Bounded so the footer can't be clipped on short/landscape
           viewports — the panel is overflow-hidden, so anything past the
           edge would be unrecoverable. */
        className="relative z-[1] flex max-h-[84dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-lg anim-slide-up"
        style={{ animationDuration: "180ms" }}
      >
        <CommandSearchHeader
          inputRef={inputRef}
          value={query}
          onChange={setQuery}
          onClose={() => setOpen(false)}
        />
        <CommandResults
          recentItems={recentItems}
          groups={groups}
          selectedIndex={selectedIndex}
          onHoverIndex={setSelectedIndex}
          onActivate={activate}
          isSearching={query.length > 0 && groups.length === 0}
        />
        <CommandFooter />
      </div>
    </div>,
    document.body,
  );
}

function CommandSearchHeader({
  inputRef,
  value,
  onChange,
  onClose,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
}) {
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };
  return (
    <form
      onSubmit={onSubmit}
      className="flex items-center gap-2 border-b border-border px-3 py-2.5"
    >
      <Search className="size-4 text-muted-foreground" aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search students, receipts, or actions…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        autoComplete="off"
        spellCheck={false}
        aria-label="Command palette search"
      />
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </form>
  );
}

function CommandResults({
  recentItems,
  groups,
  selectedIndex,
  onHoverIndex,
  onActivate,
  isSearching,
}: {
  recentItems: CommandItem[];
  groups: CommandGroup[];
  selectedIndex: number;
  onHoverIndex: (idx: number) => void;
  onActivate: (item: CommandItem | undefined) => void;
  isSearching: boolean;
}) {
  let runningIndex = 0;
  const totalItems = recentItems.length + groups.reduce((sum, group) => sum + group.items.length, 0);

  if (totalItems === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
        {isSearching ? "Searching…" : "Type to search students, receipts, and actions."}
      </div>
    );
  }

  return (
    <div className="max-h-[55dvh] overflow-y-auto momentum-scroll py-2">
      {recentItems.length > 0 ? (
        <CommandSection title="Recents">
          {recentItems.map((item) => {
            const idx = runningIndex++;
            return (
              <CommandRow
                key={item.id}
                item={item}
                isSelected={idx === selectedIndex}
                onMouseEnter={() => onHoverIndex(idx)}
                onClick={() => onActivate(item)}
                index={idx + 1}
              />
            );
          })}
        </CommandSection>
      ) : null}

      {groups.map((group) => (
        <CommandSection key={group.provider.id} title={group.provider.label}>
          {group.items.map((item) => {
            const idx = runningIndex++;
            return (
              <CommandRow
                key={item.id}
                item={item}
                isSelected={idx === selectedIndex}
                onMouseEnter={() => onHoverIndex(idx)}
                onClick={() => onActivate(item)}
                index={idx + 1}
              />
            );
          })}
        </CommandSection>
      ))}
    </div>
  );
}

function CommandSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-1.5 pb-1 pt-1.5">
      <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function CommandRow({
  item,
  isSelected,
  onMouseEnter,
  onClick,
  index,
}: {
  item: CommandItem;
  isSelected: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
  index: number;
}) {
  const Icon = item.icon;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
          isSelected ? "bg-accent-soft text-accent-soft-foreground" : "text-foreground hover:bg-surface-2",
        )}
        data-selected={isSelected || undefined}
      >
        {Icon ? (
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-md",
              isSelected ? "bg-accent text-accent-foreground" : "bg-surface-2 text-muted-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.label}</span>
          {item.description ? (
            <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
          ) : null}
        </span>
        {item.hint ? (
          <span className="shrink-0 text-xs tabular text-muted-foreground">{item.hint}</span>
        ) : null}
        {index <= 9 ? (
          <kbd className="hidden shrink-0 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
            ⌘{index}
          </kbd>
        ) : null}
      </button>
    </li>
  );
}

function CommandFooter() {
  return (
    <footer className="flex items-center justify-between border-t border-border bg-surface-2 px-3 py-2 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-2">
        <kbd className="rounded border border-border bg-surface px-1.5 py-0.5">↑↓</kbd>
        navigate
        <kbd className="ml-2 rounded border border-border bg-surface px-1.5 py-0.5">Enter</kbd>
        open
      </span>
      <span className="flex items-center gap-2">
        <kbd className="rounded border border-border bg-surface px-1.5 py-0.5">Esc</kbd>
        close
      </span>
    </footer>
  );
}
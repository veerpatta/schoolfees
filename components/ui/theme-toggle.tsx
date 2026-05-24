"use client";

/**
 * Tri-state theme toggle (light / dark / system).
 *
 * Renders as a single button that cycles through the three states on click,
 * with a dropdown variant available for the user menu. Icon swaps to reflect
 * the **resolved** theme so what you see matches what's rendered.
 *
 * Hydration-safe: returns a neutral placeholder until mounted to avoid a
 * server/client mismatch (next-themes can't know the system preference on
 * the server).
 */

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  /** Compact icon button (default) vs labeled. */
  variant?: "icon" | "labeled";
  className?: string;
};

const ORDER = ["light", "dark", "system"] as const;
type ThemeChoice = (typeof ORDER)[number];

function nextTheme(current: ThemeChoice): ThemeChoice {
  const index = ORDER.indexOf(current);
  return ORDER[(index + 1) % ORDER.length];
}

const ICONS: Record<ThemeChoice, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABELS: Record<ThemeChoice, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function ThemeToggle({ variant = "icon", className }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Theme"
        className={cn(
          "inline-flex items-center justify-center rounded-md border border-border bg-surface text-foreground",
          variant === "icon" ? "size-9" : "h-9 gap-2 px-3 text-sm",
          className,
        )}
      >
        <Monitor className="size-4" aria-hidden="true" />
        {variant === "labeled" ? <span>Theme</span> : null}
      </button>
    );
  }

  const choice: ThemeChoice =
    theme === "light" || theme === "dark" || theme === "system" ? theme : "system";
  // Icon mirrors resolved theme when on system, so the chrome matches the chrome.
  const displayed: ThemeChoice =
    choice === "system" ? (resolvedTheme === "dark" ? "dark" : "light") : choice;
  const Icon = ICONS[displayed];

  const handleClick = () => setTheme(nextTheme(choice));

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Theme: ${LABELS[choice]} (click to switch)`}
      title={`Theme: ${LABELS[choice]} — click to cycle`}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-border bg-surface text-foreground transition-colors hover:bg-surface-2 focus-ring",
        variant === "icon" ? "size-9" : "h-9 gap-2 px-3 text-sm font-medium",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {variant === "labeled" ? <span>{LABELS[choice]}</span> : null}
    </button>
  );
}

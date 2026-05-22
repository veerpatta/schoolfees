"use client";

import { cn } from "@/lib/utils";

const PAD_ROWS = [
  ["7","8","9"],
  ["4","5","6"],
  ["1","2","3"],
  [".","0","⌫"],
] as const;

type MobileNumPadProps = {
  onKey: (key: string) => void;
  disabled?: boolean;
  className?: string;
};

export function MobileNumPad({ onKey, disabled, className }: MobileNumPadProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {PAD_ROWS.map((row, ri) => (
        <div key={ri} className="flex flex-1 gap-1.5">
          {row.map((key) => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              className="flex flex-1 min-h-[48px] items-center justify-center rounded-xl border border-border bg-card text-xl font-semibold text-foreground active:scale-95 active:bg-surface-3 disabled:opacity-40 disabled:pointer-events-none transition-transform"
              onPointerDown={(e) => {
                e.preventDefault();
                if (!disabled) onKey(key);
              }}
            >
              {key === "⌫" ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                  <line x1="18" y1="9" x2="12" y2="15" />
                  <line x1="12" y1="9" x2="18" y2="15" />
                </svg>
              ) : (
                key
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

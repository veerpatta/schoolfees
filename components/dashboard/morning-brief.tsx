import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

type MorningBriefProps = {
  /** The composed sentence. Render plain text; no markdown. */
  sentence: string;
  className?: string;
};

/**
 * Renders the morning-brief sentence above the dashboard.
 *
 * Server-component-friendly: takes a pre-composed string so the page
 * stays in control of data fetching. Pair with `composeMorningBrief`
 * from `lib/dashboard/morning-brief.ts`.
 */
export function MorningBrief({ sentence, className }: MorningBriefProps) {
  if (!sentence) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-xs anim-fade-in",
        className,
      )}
    >
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-soft-foreground">
        <Sparkles className="size-4" aria-hidden="true" />
      </span>
      <p className="text-sm leading-6 text-foreground sm:text-[15px]">{sentence}</p>
    </div>
  );
}

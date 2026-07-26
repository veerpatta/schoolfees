"use client";

import { Mic } from "lucide-react";

import { useVoiceSearch } from "@/hooks/use-voice-search";
import { useHaptics } from "@/hooks/use-haptics";
import { cn } from "@/lib/utils";

/**
 * The mic beside a search field (template §STUDENTS, §COLLECT 1).
 *
 * Renders nothing when the browser has no speech recognition — iOS Safari and
 * most in-app browsers. See `useVoiceSearch` for why that matters and why
 * recognition is pinned to en-IN regardless of the UI language.
 */
export function VoiceSearchButton({
  onTranscript,
  label,
  listeningLabel,
  className,
}: {
  onTranscript: (text: string) => void;
  label: string;
  listeningLabel: string;
  className?: string;
}) {
  const { supported, listening, start } = useVoiceSearch(onTranscript);
  const haptic = useHaptics();

  if (!supported) return null;

  return (
    <button
      type="button"
      aria-label={listening ? listeningLabel : label}
      aria-pressed={listening}
      onClick={() => {
        haptic("tap");
        start();
      }}
      className={cn(
        "focus-ring grid size-[50px] shrink-0 place-items-center rounded-[14px] transition-colors",
        listening
          ? "bg-accent text-accent-foreground"
          : "bg-nav text-nav-foreground active:scale-95",
        className,
      )}
    >
      <Mic className={cn("size-[18px]", listening && "anim-pulse-dot")} />
    </button>
  );
}

"use client";

import { useSessionSwitching } from "@/lib/session/switching-context";
import { cn } from "@/lib/utils";

type SessionSwitchOverlayProps = {
  isVisible: boolean;
};

export function SessionSwitchOverlay({ isVisible }: SessionSwitchOverlayProps) {
  return (
    <div
      aria-hidden={!isVisible}
      data-session-switching={isVisible ? "true" : undefined}
      className={cn(
        "pointer-events-none fixed inset-0 z-20 transition-opacity duration-200 motion-reduce:transition-none",
        // Must match the sidebar width in components/admin/dashboard-shell.tsx,
        // or a strip of content stays un-dimmed during the switch.
        "lg:left-[232px]",
        isVisible
          ? "opacity-100 motion-safe:anim-fade-in"
          : "opacity-0",
      )}
    >
      <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px]" />
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {isVisible ? "Switching session, please wait" : ""}
      </span>
    </div>
  );
}

export function SessionSwitchOverlayMount() {
  const { isSwitching } = useSessionSwitching();

  return <SessionSwitchOverlay isVisible={isSwitching} />;
}

"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const VISIT_COUNT_KEY = "vpps.pwa.visitCount";
const DISMISS_KEY = "vpps.pwa.installDismissedAt";
const MIN_VISITS = 3;
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isTouchDevice() {
  if (typeof window === "undefined") return false;
  if (typeof navigator !== "undefined" && navigator.maxTouchPoints && navigator.maxTouchPoints > 0) {
    return true;
  }
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(pointer: coarse)").matches;
  }
  return false;
}

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) {
    return true;
  }
  type SafariNavigator = Navigator & { standalone?: boolean };
  return Boolean((window.navigator as SafariNavigator).standalone);
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredPrompt | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandaloneDisplay()) return;
    if (!isTouchDevice()) return;

    let nextCount = 1;
    try {
      const stored = Number.parseInt(window.localStorage.getItem(VISIT_COUNT_KEY) ?? "0", 10);
      nextCount = Number.isFinite(stored) ? stored + 1 : 1;
      window.localStorage.setItem(VISIT_COUNT_KEY, String(nextCount));
    } catch {
      // ignore quota
    }

    const dismissedAt = (() => {
      try {
        const raw = window.localStorage.getItem(DISMISS_KEY);
        if (!raw) return 0;
        const ts = Number.parseInt(raw, 10);
        return Number.isFinite(ts) ? ts : 0;
      } catch {
        return 0;
      }
    })();

    if (Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) {
      return;
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as DeferredPrompt);
      if (nextCount >= MIN_VISITS) {
        setVisible(true);
      }
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  if (!visible || !deferredPrompt) return null;

  async function handleInstall() {
    try {
      if (!deferredPrompt) return;
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === "accepted") {
        setVisible(false);
        setDeferredPrompt(null);
      } else {
        handleDismiss();
      }
    } catch {
      handleDismiss();
    }
  }

  function handleDismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 flex items-start gap-3 rounded-2xl border border-accent/40 bg-card px-4 py-3 shadow-xl sm:left-auto sm:right-3 sm:max-w-sm">
      <Download className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-foreground">Install on this device</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add VPPS Fee to your home screen for faster access at the front desk.
        </p>
        <div className="mt-3 flex gap-2">
          <Button type="button" size="sm" onClick={handleInstall}>Install</Button>
          <Button type="button" size="sm" variant="ghost" onClick={handleDismiss}>
            Maybe later
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss install prompt"
        className="rounded-full p-1 text-muted-foreground hover:bg-surface-2"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

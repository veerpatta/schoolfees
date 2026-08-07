"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { toast } from "@/components/ui/toast";
import {
  DOWNLOAD_TOKEN_COOKIE,
  DOWNLOAD_TOKEN_PARAM,
} from "@/lib/helpers/download-token";
import { cn } from "@/lib/utils";

/**
 * A download link that shows it is working.
 *
 * THE RULE THIS COMPONENT EXISTS TO KEEP: the click is never intercepted.
 * No `preventDefault`, no `fetch`, no blob. The browser performs the same
 * plain navigation to the same href it always did, so the native download
 * shelf, `target="_blank"` printing, and no-JS behaviour are all untouched.
 * All this adds is a spinner, and a nonce the server echoes back so the
 * spinner knows when to stop.
 *
 * Consequence worth knowing: the signal means "the response reached the
 * browser", not "the file finished writing to disk". For a 60-second
 * server-side generation that is the number that matters; the disk write is
 * instant beside it.
 */

/** Above the routes' `maxDuration = 60` so a slow-but-fine export is not called dead. */
const DEFAULT_TIMEOUT_MS = 90_000;
const POLL_MS = 250;

function newToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function readCookie(name: string) {
  if (typeof document === "undefined") return null;

  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function withToken(href: string, token: string) {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${DOWNLOAD_TOKEN_PARAM}=${token}`;
}

export type UseDownloadFeedbackOptions = {
  timeoutMs?: number;
  successTitle?: string;
};

/**
 * For surfaces that own their own anchor markup. Spread `watch(href)` onto the
 * `<a>`; it returns the tokenised href and an onClick that only starts a poll.
 */
export function useDownloadFeedback(options: UseDownloadFeedbackOptions = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, successTitle = "Download ready" } = options;
  const [pending, setPending] = useState(false);
  const timers = useRef<{ poll?: number; timeout?: number }>({});

  const stop = useCallback(() => {
    window.clearInterval(timers.current.poll);
    window.clearTimeout(timers.current.timeout);
    timers.current = {};
    setPending(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    (token: string) => {
      stop();
      setPending(true);

      timers.current.poll = window.setInterval(() => {
        if (readCookie(DOWNLOAD_TOKEN_COOKIE) !== token) {
          return;
        }

        clearCookie(DOWNLOAD_TOKEN_COOKIE);
        stop();
        toast({ title: successTitle, tone: "success" });
      }, POLL_MS);

      // Never spin forever. A silent timeout would be the same dead-click bug
      // in a different costume.
      timers.current.timeout = window.setTimeout(() => {
        stop();
        toast({
          title: "Still preparing",
          description:
            "This export is taking longer than usual. If nothing arrives, try again.",
        });
      }, timeoutMs);
    },
    [stop, successTitle, timeoutMs],
  );

  const watch = useCallback(
    (href: string) => {
      const token = newToken();

      return {
        href: withToken(href, token),
        // No event argument on purpose: there is nothing here that could
        // accidentally call preventDefault.
        onClick: () => start(token),
      };
    },
    [start],
  );

  return { pending, watch };
}

export type DownloadAnchorProps = {
  href: string;
  children: ReactNode;
  download?: boolean | string;
  target?: "_blank";
  rel?: string;
  className?: string;
  /** Shown instead of children while in flight. Defaults to keeping them. */
  pendingLabel?: string;
  timeoutMs?: number;
  successTitle?: string;
  "aria-label"?: string;
};

export function DownloadAnchor({
  href,
  children,
  download,
  target,
  rel,
  className,
  pendingLabel,
  timeoutMs,
  successTitle,
  ...rest
}: DownloadAnchorProps) {
  const { pending, watch } = useDownloadFeedback({ timeoutMs, successTitle });
  const { href: tokenisedHref, onClick } = watch(href);

  return (
    <>
      <a
        href={tokenisedHref}
        download={download}
        target={target}
        rel={rel ?? (target === "_blank" ? "noopener" : undefined)}
        onClick={onClick}
        aria-busy={pending || undefined}
        data-download-pending={pending || undefined}
        className={cn(className, pending && "pointer-events-none opacity-70")}
        {...rest}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : null}
        {pending ? pendingLabel ?? children : children}
      </a>
      {/* Screen readers get the same signal the spinner gives everyone else. */}
      <span className="sr-only" role="status">
        {pending ? "Preparing download" : ""}
      </span>
    </>
  );
}

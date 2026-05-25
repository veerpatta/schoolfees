"use client";

import { useEffect, useRef, useState } from "react";
import { User } from "lucide-react";

import { cn } from "@/lib/utils";

const SIZE_CLASS = {
  sm: "size-8 text-[11px]",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
} as const;

type Size = keyof typeof SIZE_CLASS;

type Props = {
  photoPath: string | null | undefined;
  fullName: string;
  size?: Size;
  className?: string;
};

function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

const urlCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

async function fetchSignedUrl(path: string): Promise<string | null> {
  const cached = urlCache.get(path);
  if (cached) return cached;

  const existing = inFlight.get(path);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const response = await fetch(
        `/protected/students/photo?path=${encodeURIComponent(path)}`,
        { headers: { accept: "application/json" } },
      );
      if (!response.ok) return null;
      const data = (await response.json()) as { url?: string };
      if (data.url) {
        urlCache.set(path, data.url);
        return data.url;
      }
      return null;
    } catch {
      return null;
    } finally {
      inFlight.delete(path);
    }
  })();

  inFlight.set(path, promise);
  return promise;
}

export function StudentAvatar({
  photoPath,
  fullName,
  size = "md",
  className,
}: Props) {
  const [src, setSrc] = useState<string | null>(() =>
    photoPath ? urlCache.get(photoPath) ?? null : null,
  );
  const observerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!photoPath) {
      setSrc(null);
      return;
    }

    if (urlCache.has(photoPath)) {
      setSrc(urlCache.get(photoPath) ?? null);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      void fetchSignedUrl(photoPath).then(setSrc);
      return;
    }

    const element = observerRef.current;
    if (!element) {
      void fetchSignedUrl(photoPath).then(setSrc);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void fetchSignedUrl(photoPath).then(setSrc);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [photoPath]);

  return (
    <div
      ref={observerRef}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2 font-semibold uppercase text-muted-foreground",
        SIZE_CLASS[size],
        className,
      )}
      aria-label={`${fullName} photo`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${fullName} photo`} className="size-full object-cover" loading="lazy" />
      ) : photoPath ? (
        <span aria-hidden="true">{getInitials(fullName)}</span>
      ) : (
        <User className="size-1/2" aria-hidden="true" />
      )}
    </div>
  );
}

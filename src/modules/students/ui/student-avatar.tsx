"use client";

import { useState } from "react";
import { User } from "lucide-react";

import { cn } from "@/platform/utils";

const SIZE_CLASS = {
  sm: "size-8 text-[11px]",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
  /**
   * The student profile header, on both phone and desk. 64px is the largest
   * size the 192px thumbnail still covers at a 3x device pixel ratio, so the
   * profile gets a bigger photo without a second rendition or a second fetch.
   */
  xl: "size-16 text-lg",
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

/** The thumbnail endpoint. Returns image bytes, not a signed URL — see the route. */
export function studentThumbSrc(photoPath: string) {
  return `/protected/students/photo?variant=thumb&path=${encodeURIComponent(photoPath)}`;
}

const urlCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

/**
 * A signed URL for the FULL-SIZE photo, for the viewer.
 *
 * The list does not use this and no longer mints anything: an avatar is a plain
 * `<img>` pointed at the route above, which is one browser-cached request
 * instead of a mint round trip plus an image fetch. This exists for the one
 * place that wants the original at full quality, straight from Storage.
 *
 * Cached in the module so opening the same photo twice — or opening it from a
 * list where it is already on screen — mints one URL rather than two.
 */
export async function fetchSignedUrl(path: string): Promise<string | null> {
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

/**
 * A student's photo at list size.
 *
 * This used to resolve a signed URL per avatar — an IntersectionObserver, a
 * module cache, a fetch and a piece of state each — and then load a 600x800
 * original to paint a 32-pixel circle. A page of 27 rows moved about 4 MB and
 * made 54 requests.
 *
 * Now the src is a URL the server answers with a 192px rendition, so the
 * platform does the work: `loading="lazy"` defers off-screen rows, and the HTTP
 * cache keeps them for a week, which an expiring signed URL could never do. The
 * only state left is whether the image failed, so initials can take over.
 */
export function StudentAvatar({
  photoPath,
  fullName,
  size = "md",
  className,
}: Props) {
  const [failed, setFailed] = useState(false);

  const showPhoto = Boolean(photoPath) && !failed;

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2 font-semibold uppercase text-muted-foreground",
        SIZE_CLASS[size],
        className,
      )}
      role="img"
      aria-label={`${fullName} photo`}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={studentThumbSrc(photoPath as string)}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
          // A 404 here is a student whose photo_path points at nothing. Fall
          // back to initials rather than showing a broken-image glyph.
          onError={() => setFailed(true)}
        />
      ) : photoPath ? (
        <span aria-hidden="true">{getInitials(fullName)}</span>
      ) : (
        <User className="size-1/2" aria-hidden="true" />
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Pencil, X } from "lucide-react";

import { fetchSignedUrl } from "@/components/students/student-avatar";

/**
 * Tap a student's photo in the list and it opens, the way a photo does in
 * WhatsApp: the picture, the child's name, and nothing else to read.
 *
 * Sized to the photo rather than to the screen. The first Sampark export gave
 * 96-pixel thumbnails, so this was capped at 320px to keep a lightbox from
 * upscaling mush; the 2026-08-20 re-export is 600x800, so the cap moved up to
 * match. It is still not viewport-filling — a portrait shown whole, with the
 * name under it, is what a person opening a photo wants, and it keeps the
 * students list visible behind so closing feels like stepping back rather than
 * navigating.
 *
 * `object-contain` and a max-height, not a square crop: these are 3:4
 * portraits, and cropping them to a square in the VIEWER would cut off the top
 * of a child's head. The small round avatar in the list still crops, which is
 * what a round avatar is for.
 *
 * It is not a Sheet. A Sheet is a work surface — it has a title, a body that
 * scrolls and a footer that acts — and this is a glance that wants dismissing
 * as fast as it was opened.
 */
const VIEWER_MAX_PX = 420;

/**
 * One frame, the same shape for every child.
 *
 * The frame used to take its shape from the photo — `object-contain` on the
 * image's own aspect — and the Sampark export does not shoot to one framing:
 * the 2026-08-20 file alone carries four aspect ratios, so opening one child
 * after another gave a different rectangle each time. scripts/import-student-photos.mjs
 * now stores every photo as a face-anchored 600x800, which fixes it at the
 * source; this fixes it at the surface too, so a photo that arrives some other
 * way — the in-app uploader, a future export — cannot make the viewer jump
 * about again.
 *
 * Height-led rather than width-led: a portrait is bounded by the screen's
 * height first, and driving the height keeps `aspect-ratio` free to hold the
 * shape instead of fighting a max-height.
 */
const FRAME_STYLE = {
  height: `min(68dvh, ${Math.round((VIEWER_MAX_PX * 4) / 3)}px, calc(88vw * 4 / 3))`,
  aspectRatio: "3 / 4",
} as const;

/** History-dismiss marker. Mirrors the mechanism in components/ui/sheet.tsx —
 *  edit both or neither. Kept separate from the sheet's own sequence so a photo
 *  opened from inside a sheet cannot be mistaken for the sheet's entry. */
const PHOTO_HISTORY_MARKER = "vppsPhotoViewer";
let photoHistorySeq = 0;

/**
 * Run something after this viewer's own history unwind has landed.
 *
 * Closing the viewer pops the entry it pushed, and that `popstate` arrives a
 * few milliseconds later — asynchronously, after the click handler has already
 * returned. Anything the action opens is very likely another overlay that
 * pushes an entry of its own (the photo sheet does), so running it immediately
 * meant the queued pop landed on the NEW overlay's marker and it closed itself
 * the moment it appeared. Measured: sheet added at 317ms, popstate at 321ms,
 * sheet gone at 323ms.
 *
 * So wait for the pop, then act. The timeout is a floor, not the mechanism:
 * a viewer dismissed by the back gesture pops no entry of its own, and nothing
 * should hang waiting for an event that is never coming.
 */
function runAfterHistorySettles(run: () => void) {
  if (typeof window === "undefined") {
    run();
    return;
  }

  let done = false;
  // Assigned before `finish` can run: setTimeout and the listener both fire on
  // a later task, so the reference is live by then.
  const timers: { fallback?: ReturnType<typeof setTimeout> } = {};

  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener("popstate", finish);
    clearTimeout(timers.fallback);
    run();
  };

  timers.fallback = setTimeout(finish, 300);
  window.addEventListener("popstate", finish);
}

export function StudentPhotoOverlay({
  open,
  photoPath,
  fullName,
  admissionNo,
  onClose,
  action,
}: {
  open: boolean;
  photoPath: string;
  fullName: string;
  admissionNo?: string | null;
  onClose: () => void;
  /**
   * One action under the photo, the way WhatsApp puts its action row beneath
   * the picture. Optional and singular on purpose: the pop-out is a glance, and
   * a row of choices turns it into a menu you have to read.
   */
  action?: { label: string; onSelect: () => void } | null;
}) {
  const t = useTranslations("Common");
  const [src, setSrc] = useState<string | null>(null);
  const closeRef = useRef(onClose);
  const poppedRef = useRef(false);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchSignedUrl(photoPath).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [open, photoPath]);

  // Escape closes, and so does the Android back gesture — a photo that swallows
  // the back button is the fastest way to make a phone feel broken.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    poppedRef.current = false;
    photoHistorySeq += 1;
    const entryId = photoHistorySeq;
    window.history.pushState(
      { ...(window.history.state ?? {}), [PHOTO_HISTORY_MARKER]: entryId },
      "",
    );

    const onPopState = (event: PopStateEvent) => {
      const stillOurs = (event.state as Record<string, unknown> | null)?.[PHOTO_HISTORY_MARKER];
      if (stillOurs === entryId) return;
      poppedRef.current = true;
      closeRef.current();
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      // Closed by Escape, the button or the backdrop rather than by going back:
      // pop the entry we pushed, or it piles up and the back button reads dead.
      if (!poppedRef.current) window.history.back();
    };
  }, [open]);

  // Background scroll lock. A photo is a glance; the list underneath should be
  // exactly where it was when it closes.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="anim-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${fullName} photo`}
    >
      <div
        className="animate-pop-in flex flex-col items-center gap-3"
        // The card is a target, not a dismiss area: clicking the photo itself
        // should not close what you just opened.
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="overflow-hidden rounded-2xl border border-white/10 bg-surface-2 shadow-2xl"
          style={FRAME_STYLE}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={`${fullName} photo`}
              className="size-full object-cover"
            />
          ) : (
            <div className="size-full animate-pulse bg-surface-2" aria-hidden="true" />
          )}
        </div>

        <div className="text-center">
          <p className="text-base font-semibold text-white">{fullName}</p>
          {admissionNo ? (
            <p className="text-sm text-white/70">SR {admissionNo}</p>
          ) : null}
        </div>

        {action ? (
          <button
            type="button"
            onClick={() => {
              // Close first: the sheet that follows is itself an overlay, and
              // two stacked scrim layers read as the app losing its place. Then
              // wait for the history entry this viewer pushed to be popped, or
              // the sheet opens into a pop that closes it — see the helper.
              const run = action.onSelect;
              onClose();
              runAfterHistorySettles(run);
            }}
            className="focus-ring mt-1 inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20 active:scale-95"
          >
            <Pencil className="size-4" aria-hidden="true" />
            {action.label}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label={t("close")}
        className="focus-ring absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white transition-colors hover:bg-black/60"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}

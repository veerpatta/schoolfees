"use client";

import { useCallback, useState } from "react";

import { selectShareStrategy, toShareData } from "@/platform/helpers/web-share";
import { toast } from "@/ui/primitives/toast";
import type { PhotoAction } from "@/modules/students/ui/student-photo-overlay";

/**
 * "Send this child's photo to somebody" — the phone half of the download.
 *
 * A hook rather than a component, so the overlay stays the only thing that
 * renders an action pill and the two can never drift apart visually.
 *
 * **Two presses, and the first one is the point.** `navigator.share` must be
 * called from a live user gesture; fetching inside the sharing click consumes
 * the transient activation mobile browsers — iOS Safari especially — require,
 * and the share is then refused with "could not share". `document-share-sheet`
 * solves this by fetching when its sheet OPENS, but it can: opening that sheet
 * is already a commitment to sending. This viewer's open is a *glance* — the
 * thing tapped from every row of a 27-row list — so fetching on open would
 * pull 53 KB and write an audit row every time somebody looked at a face.
 * `collection-list-actions` hit exactly this and landed on the same answer:
 * with no "open" to hang the fetch on, the first press IS the open.
 */
export function useStudentPhotoShare({
  studentId,
  studentName,
  admissionNo,
  labels,
}: {
  studentId: string;
  studentName: string;
  admissionNo?: string | null;
  labels: {
    share: string;
    send: string;
    preparing: string;
    failed: string;
  };
}): {
  supported: boolean;
  /**
   * Always the callback variant, never the link one: sharing runs
   * `navigator.share`, and the narrower type is what lets a caller reach
   * `onSelect` without proving which half of the union it holds.
   */
  action: Extract<PhotoAction, { onSelect: () => void }>;
} {
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);

  const prepare = useCallback(async () => {
    if (preparing) return;
    setPreparing(true);
    try {
      const response = await fetch(
        `/protected/students/photo/download?studentId=${encodeURIComponent(studentId)}&via=share`,
      );
      if (!response.ok) {
        throw new Error(String(response.status));
      }
      const blob = await response.blob();
      // The name comes off the response, never re-derived here: the server is
      // the single author of it, so a saved file and a shared file cannot
      // disagree about what the child is called.
      const raw = response.headers.get("x-download-filename");
      const name = raw ? decodeURIComponent(raw) : `${admissionNo ?? "student"}-photo.jpg`;
      setFile(new File([blob], name, { type: blob.type || "image/jpeg" }));
    } catch {
      toast({ title: labels.failed });
    } finally {
      setPreparing(false);
    }
  }, [preparing, studentId, admissionNo, labels.failed]);

  /**
   * Runs straight off the second click. Nothing is awaited before
   * `navigator.share` — `prepare()` already ran on the previous gesture and the
   * strategy probe is synchronous — or the activation is gone.
   */
  const share = useCallback(() => {
    if (!file) return;

    const strategy = selectShareStrategy({
      files: [file],
      text: studentName,
      title: studentName,
      canShare:
        typeof navigator !== "undefined" && typeof navigator.share === "function"
          ? (navigator.canShare?.bind(navigator) ?? (() => true))
          : null,
    });

    if (strategy.mode === "unsupported") {
      toast({ title: labels.failed });
      return;
    }

    navigator
      .share(toShareData(strategy, { title: studentName, text: studentName }))
      .catch((error: Error) => {
        // A cancelled share is a decision, not a failure. Never toast on it.
        if (error?.name === "AbortError") return;
        toast({ title: labels.failed });
      });
  }, [file, studentName, labels.failed]);

  return {
    // The right feature test is "does this browser have a share sheet", not
    // "is this a phone" — which is also why no media query is needed to keep
    // this off the desk.
    supported: typeof navigator !== "undefined" && typeof navigator.share === "function",
    action: {
      id: "share",
      label: preparing ? labels.preparing : file ? labels.send : labels.share,
      onSelect: file ? share : () => void prepare(),
    },
  };
}

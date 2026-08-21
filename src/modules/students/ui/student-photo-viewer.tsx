"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";

import { StudentAvatar } from "@/modules/students/ui/student-avatar";
import { cn } from "@/platform/utils";

/**
 * The overlay is loaded on demand, and that is a size decision.
 *
 * Everything it needs — a portal, the history-dismiss dance, the full-size
 * fetch, the action button — only ever runs after somebody taps a photo, but it
 * was being shipped to every student list on first load. The list route sits
 * under a gzip ceiling in quality/route-bundle-baseline.json that is ratcheted
 * down and never raised, and this code was the wrong thing to be spending it
 * on. Split out, the tap pays for it — by which point the tap is already
 * waiting on a signed URL and an image anyway.
 *
 * `ssr: false` because it renders into document.body and only ever exists in
 * response to a click; there is nothing for the server to produce.
 */
const StudentPhotoOverlay = dynamic(
  () => import("@/modules/students/ui/student-photo-overlay").then((m) => m.StudentPhotoOverlay),
  { ssr: false },
);

/**
 * Drop-in replacement for `StudentAvatar` on any surface where the photo should
 * open. Without a photo it renders the plain avatar and stays inert — an empty
 * box is not worth a tap, and a control that does nothing is worse than none.
 *
 * `data-row-action` is what keeps the tap from also opening the student, which
 * is the convention the list rows already use for their inline controls.
 */
export function StudentAvatarButton({
  photoPath,
  fullName,
  admissionNo,
  size = "md",
  className,
  action,
}: {
  photoPath: string | null | undefined;
  fullName: string;
  admissionNo?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  action?: { label: string; onSelect: () => void } | null;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  if (!photoPath) {
    return <StudentAvatar photoPath={photoPath} fullName={fullName} size={size} className={className} />;
  }

  return (
    <>
      <span data-row-action="true" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${fullName} photo`}
          aria-haspopup="dialog"
          className={cn(
            "focus-ring block rounded-full transition-transform active:scale-95",
            className,
          )}
        >
          <StudentAvatar photoPath={photoPath} fullName={fullName} size={size} />
        </button>
      </span>

      <StudentPhotoOverlay
        open={open}
        photoPath={photoPath}
        fullName={fullName}
        admissionNo={admissionNo}
        onClose={close}
        action={action}
      />
    </>
  );
}

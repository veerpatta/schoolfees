"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/ui/primitives/button";
import { Notice } from "@/ui/primitives/notice";
import { Sheet } from "@/ui/primitives/sheet";
import { toast } from "@/ui/primitives/toast";
import { Download, Pencil, Share2 } from "lucide-react";

import { StudentAvatar } from "@/modules/students/ui/student-avatar";
import type { PhotoAction } from "@/modules/students/ui/student-photo-overlay";
import { useStudentPhotoShare } from "@/modules/students/ui/student-photo-share-action";
import { StudentAvatarButton } from "@/modules/students/ui/student-photo-viewer";
import { StudentPhotoUpload } from "@/modules/students/ui/student-photo-upload";
import { useMediaQuery } from "@/ui/hooks/use-media-query";
import { updateStudentPhotoAction } from "@/app/protected/students/actions";
import { INITIAL_STUDENT_PHOTO_ACTION_STATE } from "@/app/protected/students/student-photo-action-state";
import { cn } from "@/platform/utils";

/** Lets the pinned footer button submit the form it sits outside of. */
const STUDENT_PHOTO_FORM_ID = "STUDENT_PHOTO_FORM_ID";

/**
 * Change a student's photo without opening the whole edit form.
 *
 * The uploader itself is unchanged — `StudentPhotoUpload` already resizes on a
 * canvas to 600px/200KB, uploads straight to the bucket from the browser, and
 * hands back an object path through a hidden input. All this adds is somewhere
 * to put it that a phone can reach, and a save that writes one column.
 *
 * Bottom sheet on a phone, right drawer on a desk. The phone is the surface
 * this exists for — it is the one with a camera — but an office clerk with the
 * student already open should not have to detour through the edit form either.
 */
export function StudentPhotoSheet({
  open,
  onClose,
  studentId,
  studentName,
  photoPath,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  photoPath: string | null;
}) {
  const t = useTranslations("MobileApp");
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [state, formAction, pending] = useActionState(
    updateStudentPhotoAction.bind(null, studentId),
    INITIAL_STUDENT_PHOTO_ACTION_STATE,
  );

  useEffect(() => {
    if (state.status !== "success") {
      return;
    }

    router.refresh();
    toast({ title: t("studentPhotoSavedTitle"), description: state.message ?? "" });
    onClose();
  }, [state.status, state.message, onClose, router, t]);

  const closeSheet = useCallback(() => {
    if (pending) return;
    onClose();
  }, [pending, onClose]);

  return (
    <Sheet
      open={open}
      onClose={closeSheet}
      // Named, because on a phone this sheet covers the header that said whose
      // record is open, and a photo saved against the wrong child is a
      // correction someone has to notice first.
      title={`${t("studentPhotoSheetTitle")} · ${studentName}`}
      description={t("studentPhotoSheetBody")}
      side={isDesktop ? "right" : "bottom"}
      size={isDesktop ? "full" : "lg"}
      footer={
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl"
            onClick={closeSheet}
            disabled={pending}
          >
            {t("studentPhotoCancel")}
          </Button>
          <Button
            type="submit"
            form={STUDENT_PHOTO_FORM_ID}
            className="h-12 flex-1 rounded-xl"
            disabled={pending}
          >
            {pending ? t("studentPhotoSaving") : t("studentPhotoSave")}
          </Button>
        </div>
      }
    >
      {state.status === "error" ? (
        <Notice tone="danger" title={t("studentPhotoNotSaved")} className="mb-3">
          {state.message}
        </Notice>
      ) : null}

      <form id={STUDENT_PHOTO_FORM_ID} action={formAction}>
        {/* studentId matters: without it the upload lands under the bucket's
            `new/` folder even though this student plainly exists. */}
        <StudentPhotoUpload
          inputName="photoPath"
          studentId={studentId}
          initialPath={photoPath}
        />
      </form>
    </Sheet>
  );
}

/**
 * The avatar on a student's profile, made tappable.
 *
 * What a tap does depends on what is there, because "view" and "change" are
 * different intentions and only one of them is ever available:
 *
 *   photo            -> the pop-out viewer, with Change photo inside it when
 *                       the staff member may edit. Looking is the common act;
 *                       jumping straight into an uploader to see a face was
 *                       the wrong default, and there was no way to just look.
 *   no photo, may edit -> the sheet directly. There is nothing to view, and an
 *                       empty pop-out with one button in it is a worse route to
 *                       the uploader than the uploader.
 *   no photo, may not -> a plain tile. A control that looks pressable and
 *                       refuses is worse than a picture.
 *
 * Owns the sheet's open state so the server-rendered header around it stays a
 * server component.
 */
export function StudentPhotoAvatarButton({
  studentId,
  studentName,
  admissionNo,
  photoPath,
  canEditStudent,
  canDownloadPhoto = false,
  size = "md",
  className,
}: {
  studentId: string;
  studentName: string;
  admissionNo?: string | null;
  photoPath: string | null;
  canEditStudent: boolean;
  /**
   * Taking a copy away, which is a wider role than `canEditStudent` (that one
   * is `students:write` alone). Defaults closed: a list row that never passes
   * it must not hand out downloads.
   */
  canDownloadPhoto?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const t = useTranslations("MobileApp");
  const [open, setOpen] = useState(false);
  const share = useStudentPhotoShare({
    studentId,
    studentName,
    admissionNo,
    labels: {
      share: t("studentPhotoShare"),
      send: t("studentPhotoShareSend"),
      preparing: t("studentPhotoSharePreparing"),
      failed: t("studentPhotoShareFailed"),
    },
  });

  if (!canEditStudent && !photoPath) {
    return (
      <StudentAvatar
        photoPath={photoPath}
        fullName={studentName}
        size={size}
        className={className}
      />
    );
  }

  if (photoPath) {
    const actions: PhotoAction[] = [];

    if (canDownloadPhoto) {
      actions.push({
        id: "save",
        label: t("studentPhotoDownload"),
        icon: <Download className="size-4" aria-hidden="true" />,
        href: `/protected/students/photo/download?studentId=${encodeURIComponent(studentId)}&via=overlay`,
        download: true,
      });

      // Absent on a desk, because the browser has no share sheet there — the
      // feature test does the work a media query would have done badly.
      if (share.supported) {
        actions.push({
          ...share.action,
          icon: <Share2 className="size-4" aria-hidden="true" />,
        });
      }
    }

    // Last, and the only one that closes the viewer: it replaces this overlay
    // with the uploader sheet.
    if (canEditStudent) {
      actions.push({
        id: "change",
        label: t("studentPhotoChange"),
        icon: <Pencil className="size-4" aria-hidden="true" />,
        onSelect: () => setOpen(true),
        closesViewer: true,
      });
    }

    return (
      <>
        <StudentAvatarButton
          photoPath={photoPath}
          fullName={studentName}
          admissionNo={admissionNo}
          size={size}
          className={className}
          actions={actions}
        />
        {/* Mounted outside any `hidden md:block` / `md:hidden` twin — a sheet
            inside a display:none subtree never opens. */}
        <StudentPhotoSheet
          open={open}
          onClose={() => setOpen(false)}
          studentId={studentId}
          studentName={studentName}
          photoPath={photoPath}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("studentPhotoEditAria")}
        className={cn(
          "focus-ring relative shrink-0 rounded-full active:scale-95",
          className,
        )}
      >
        <StudentAvatar photoPath={photoPath} fullName={studentName} size={size} />
      </button>
      <StudentPhotoSheet
        open={open}
        onClose={() => setOpen(false)}
        studentId={studentId}
        studentName={studentName}
        photoPath={photoPath}
      />
    </>
  );
}

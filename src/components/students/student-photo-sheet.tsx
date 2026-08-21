"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/ui/primitives/button";
import { Notice } from "@/ui/primitives/notice";
import { Sheet } from "@/ui/primitives/sheet";
import { toast } from "@/ui/primitives/toast";
import { StudentAvatar } from "@/components/students/student-avatar";
import { StudentAvatarButton } from "@/components/students/student-photo-viewer";
import { StudentPhotoUpload } from "@/components/students/student-photo-upload";
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
  size = "md",
  className,
}: {
  studentId: string;
  studentName: string;
  admissionNo?: string | null;
  photoPath: string | null;
  canEditStudent: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const t = useTranslations("MobileApp");
  const [open, setOpen] = useState(false);

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
    return (
      <>
        <StudentAvatarButton
          photoPath={photoPath}
          fullName={studentName}
          admissionNo={admissionNo}
          size={size}
          className={className}
          action={
            canEditStudent
              ? { label: t("studentPhotoChange"), onSelect: () => setOpen(true) }
              : null
          }
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

"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { Notice } from "@/ui/primitives/notice";
import { Sheet } from "@/ui/primitives/sheet";
import { toast } from "@/ui/primitives/toast";
import { StudentInfoGroupInputs } from "@/components/students/student-info-inputs";
import { useMediaQuery } from "@/ui/hooks/use-media-query";
import { updateStudentInfoAction } from "@/app/protected/students/actions";
import { INITIAL_STUDENT_INFO_ACTION_STATE } from "@/app/protected/students/student-info-action-state";
import type { StudentInfoGroupId } from "@/lib/students/info-fields";

/** Lets the pinned footer button submit the form it sits outside of. */
const STUDENT_INFO_FORM_ID = "STUDENT_INFO_FORM_ID";

/**
 * Quick edit for one group of student information fields.
 *
 * A bottom sheet on a phone and a right drawer on a desk — the same component,
 * the same state, only the edge it enters from changes. A bottom sheet on a
 * desk would cover the record it is editing.
 *
 * It posts to `updateStudentInfoAction`, which writes only the fields this
 * sheet rendered. That is the whole reason it does not reuse the student form's
 * action: a partial post there would have to be padded back out from the saved
 * record first, and getting that wrong wipes fee overrides.
 */
export function StudentInfoSheet({
  open,
  onClose,
  studentId,
  group,
  groupLabel,
  values,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  group: StudentInfoGroupId;
  groupLabel: string;
  values: Record<string, string>;
}) {
  const t = useTranslations("MobileApp");
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [state, formAction, pending] = useActionState(
    updateStudentInfoAction.bind(null, studentId),
    INITIAL_STUDENT_INFO_ACTION_STATE,
  );

  useEffect(() => {
    if (state.status !== "success") {
      return;
    }

    // Feedback is handled here rather than through useActionFeedback because
    // it also has to close the sheet.
    router.refresh();
    toast({ title: t("studentInfoSavedTitle"), description: state.message ?? "" });
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
      title={groupLabel}
      description={t("studentInfoSheetBody")}
      // A bottom sheet is the right shape on a phone and the wrong one on a
      // desk, where it would cover the record it is editing.
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
            {t("studentInfoCancel")}
          </Button>
          <Button
            type="submit"
            form={STUDENT_INFO_FORM_ID}
            className="h-12 flex-1 rounded-xl"
            disabled={pending}
          >
            {pending ? t("studentInfoSaving") : t("studentInfoSave")}
          </Button>
        </div>
      }
    >
      {state.status === "error" ? (
        <Notice tone="danger" title={t("studentInfoNotSaved")} className="mb-3">
          {state.message}
        </Notice>
      ) : null}

      <form id={STUDENT_INFO_FORM_ID} action={formAction}>
        <StudentInfoGroupInputs
          group={group}
          values={values}
          fieldErrors={state.fieldErrors}
          autoFocusFirst={isDesktop}
        />
      </form>
    </Sheet>
  );
}

/**
 * The "Edit" affordance on a group card. Owns the sheet's open state so the
 * server-rendered panel around it can stay a server component.
 */
export function StudentInfoGroupEditButton({
  studentId,
  group,
  groupLabel,
  values,
  className,
}: {
  studentId: string;
  group: StudentInfoGroupId;
  groupLabel: string;
  values: Record<string, string>;
  className?: string;
}) {
  const t = useTranslations("MobileApp");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={className ?? "h-8 gap-1.5 px-2.5 text-xs"}
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t("studentInfoEdit")}</span>
      </Button>
      {/* Mounted outside any `hidden md:block` / `md:hidden` twin — a sheet
          inside a display:none subtree never opens. */}
      <StudentInfoSheet
        open={open}
        onClose={() => setOpen(false)}
        studentId={studentId}
        group={group}
        groupLabel={groupLabel}
        values={values}
      />
    </>
  );
}

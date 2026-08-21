"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { LinkSiblingSheet } from "@/modules/students/ui/link-sibling-sheet";

type LinkSiblingTriggerProps = {
  studentId: string;
  studentLabel: string;
  studentAdmissionNo: string;
  studentClassLabel: string;
  studentFatherName: string | null;
  studentPhone: string | null;
  sessionLabel: string;
  excludeStudentIds?: string[];
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
  className?: string;
};

export function LinkSiblingTrigger({
  studentId,
  studentLabel,
  studentAdmissionNo,
  studentClassLabel,
  studentFatherName,
  studentPhone,
  sessionLabel,
  excludeStudentIds = [],
  size = "sm",
  variant = "outline",
  className,
}: LinkSiblingTriggerProps) {
  const t = useTranslations("MobileApp");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={() => setOpen(true)}
        className={className}
      >
        <UserPlus className="size-4" aria-hidden="true" />
        {t("linkSiblingCta")}
      </Button>
      <LinkSiblingSheet
        open={open}
        onClose={() => setOpen(false)}
        studentId={studentId}
        studentLabel={studentLabel}
        studentAdmissionNo={studentAdmissionNo}
        studentClassLabel={studentClassLabel}
        studentFatherName={studentFatherName}
        studentPhone={studentPhone}
        sessionLabel={sessionLabel}
        excludeStudentIds={excludeStudentIds}
      />
    </>
  );
}

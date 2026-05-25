"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LinkSiblingSheet } from "@/components/students/link-sibling-sheet";

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
        Link sibling
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

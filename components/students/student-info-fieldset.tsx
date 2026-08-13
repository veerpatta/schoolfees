"use client";

import { useTranslations } from "next-intl";

import { Section } from "@/components/ui/section";
import { StudentInfoGroupInputs } from "@/components/students/student-info-inputs";
import { ValueStatePill } from "@/components/office/office-ui";
import { STUDENT_INFO_GROUPS } from "@/lib/students/info-fields";
import type { StudentInfoFormInput } from "@/lib/students/info-fields";

/**
 * The student information fields on the full edit form — one Section per
 * group, rendered from the descriptor table.
 *
 * Lives in its own file to keep `student-form.tsx` inside its 1,400-line CI
 * budget, and because the same inputs are reused by the quick-edit sheet.
 */
export function StudentInfoFieldset({
  values,
  fieldErrors,
}: {
  values: Partial<StudentInfoFormInput>;
  fieldErrors?: Record<string, string | undefined>;
}) {
  const t = useTranslations("Students");

  return (
    <>
      {STUDENT_INFO_GROUPS.map((group) => (
        <Section
          key={group.id}
          title={t(group.labelKey)}
          actions={<ValueStatePill tone="editable">Student Master</ValueStatePill>}
          description={t("infoGroupHint")}
        >
          <StudentInfoGroupInputs
            group={group.id}
            values={values}
            fieldErrors={fieldErrors}
          />
        </Section>
      ))}
    </>
  );
}

"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { SelectNative } from "@/ui/primitives/select-native";
import {
  getStudentInfoFieldsByGroup,
  getStudentInfoOptionKey,
} from "@/modules/students/domain/info-fields";
import type {
  StudentInfoFormInput,
  StudentInfoGroupId,
} from "@/modules/students/domain/info-fields";

/**
 * The inputs for one group of student information fields.
 *
 * Shared by the full edit form and the per-group quick-edit sheet, so a field
 * cannot be offered on one surface and missing from the other. Both render
 * from `STUDENT_INFO_FIELDS`; neither names a field itself.
 */
export function StudentInfoGroupInputs({
  group,
  values,
  fieldErrors,
  autoFocusFirst = false,
}: {
  group: StudentInfoGroupId;
  /** Partial so a sheet can pass just its own group's values. */
  values: Partial<StudentInfoFormInput>;
  fieldErrors?: Record<string, string | undefined>;
  /** Opt-in: the sheet focuses its first field, the long form does not. */
  autoFocusFirst?: boolean;
}) {
  const t = useTranslations("Students");
  const fields = getStudentInfoFieldsByGroup(group);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {fields.map((field, index) => {
        const error = fieldErrors?.[field.name];
        const errorId = `${field.name}-error`;
        const accessibility = {
          "aria-invalid": error ? true : undefined,
          "aria-describedby": error ? errorId : undefined,
        } as const;

        return (
          <div key={field.name}>
            <Label htmlFor={field.name}>{t(field.labelKey)}</Label>
            {field.options ? (
              <SelectNative
                id={field.name}
                name={field.name}
                defaultValue={values[field.name] ?? ""}
                className="mt-2"
                {...accessibility}
              >
                {/* Blank first: every one of these fields is optional, and
                    "not recorded" has to stay reachable after a value is set. */}
                <option value="">{t("infoOptionNotSet")}</option>
                {/*
                  A stored value the list does not contain is carried as its own
                  option, and this is data loss prevention rather than tidiness.
                  A native <select> given a defaultValue it has no option for
                  silently selects the FIRST option instead — here the blank —
                  so opening a student and pressing Save would quietly erase the
                  field. That is live today: 22 students carry a category of
                  "GENERAL" or "SBC", neither of which is in CATEGORY_OPTIONS.
                */}
                {values[field.name] && !field.options.includes(values[field.name] as never) ? (
                  <option value={values[field.name] as string}>
                    {values[field.name]}
                  </option>
                ) : null}
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {field.translateOptions === false
                      ? option
                      : t(getStudentInfoOptionKey(option))}
                  </option>
                ))}
              </SelectNative>
            ) : (
              <Input
                id={field.name}
                name={field.name}
                type={field.control === "tel" ? "tel" : "text"}
                defaultValue={values[field.name] ?? ""}
                maxLength={field.maxLength}
                autoComplete={field.autoComplete ?? "off"}
                inputMode={field.digitsOnly ? "numeric" : undefined}
                data-sheet-initial-focus={
                  autoFocusFirst && index === 0 ? "true" : undefined
                }
                className="mt-2"
                {...accessibility}
              />
            )}
            {error ? (
              <p id={errorId} className="mt-1 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

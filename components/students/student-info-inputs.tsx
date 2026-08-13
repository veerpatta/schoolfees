"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import {
  getStudentInfoFieldsByGroup,
  getStudentInfoOptionKey,
} from "@/lib/students/info-fields";
import type {
  StudentInfoFormInput,
  StudentInfoGroupId,
} from "@/lib/students/info-fields";

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

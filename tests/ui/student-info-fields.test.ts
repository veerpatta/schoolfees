import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  STUDENT_INFO_FIELDS,
  STUDENT_INFO_GROUPS,
  getStudentInfoOptionKey,
  toStudentInfoColumns,
  validateStudentInfoInput,
  EMPTY_STUDENT_INFO_FORM_INPUT,
} from "@/modules/students/domain/info-fields";

/**
 * The student information fields are rendered from a descriptor table, so
 * their labels are looked up as `t(field.labelKey)` rather than as literal
 * `t("infoGender")` calls.
 *
 * `tests/ui/i18n-keys-resolve.test.ts` finds keys by regex-matching literal
 * calls, which means every one of these labels is invisible to it — a missing
 * key would ship as a raw `infoGender` string on screen instead of failing CI.
 * This is the check that covers them.
 */
const LOCALES = ["en", "hi", "hi-en"] as const;

const catalogues = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(join(process.cwd(), "src/messages", `${locale}.json`), "utf-8")),
  ]),
) as Record<(typeof LOCALES)[number], { Students: Record<string, string> }>;

describe("student information field descriptors", () => {
  it.each(LOCALES)("every field and group label resolves in %s", (locale) => {
    const students = catalogues[locale].Students;

    for (const group of STUDENT_INFO_GROUPS) {
      expect(students[group.labelKey], `${group.labelKey} missing`).toBeTruthy();
    }

    for (const field of STUDENT_INFO_FIELDS) {
      expect(students[field.labelKey], `${field.labelKey} missing`).toBeTruthy();
    }
  });

  it.each(LOCALES)("every translated option value resolves in %s", (locale) => {
    const students = catalogues[locale].Students;

    expect(students.infoOptionNotSet).toBeTruthy();

    for (const field of STUDENT_INFO_FIELDS) {
      if (!field.options || field.translateOptions === false) {
        continue;
      }

      for (const option of field.options) {
        const key = getStudentInfoOptionKey(option);
        expect(students[key], `${key} missing for ${field.name}`).toBeTruthy();
      }
    }
  });

  it("gives every field a distinct name, column and group", () => {
    const names = STUDENT_INFO_FIELDS.map((field) => field.name);
    const columns = STUDENT_INFO_FIELDS.map((field) => field.column);
    const groupIds = new Set(STUDENT_INFO_GROUPS.map((group) => group.id));

    expect(new Set(names).size).toBe(names.length);
    expect(new Set(columns).size).toBe(columns.length);

    for (const field of STUDENT_INFO_FIELDS) {
      expect(groupIds.has(field.group), `${field.name} has no group`).toBe(true);
      // Columns are snake_case; a camelCase one would silently read as null.
      expect(field.column).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("treats every field as optional", () => {
    const result = validateStudentInfoInput(EMPTY_STUDENT_INFO_FORM_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const field of STUDENT_INFO_FIELDS) {
      expect(result.data[field.name]).toBeNull();
    }
  });

  it("normalises a spaced Aadhaar and rejects a short one", () => {
    const spaced = validateStudentInfoInput({
      ...EMPTY_STUDENT_INFO_FORM_INPUT,
      aadhaarNo: "1234 5678 9012",
    });

    expect(spaced.ok).toBe(true);
    if (spaced.ok) {
      expect(spaced.data.aadhaarNo).toBe("123456789012");
    }

    const short = validateStudentInfoInput({
      ...EMPTY_STUDENT_INFO_FORM_INPUT,
      aadhaarNo: "12345",
    });

    expect(short.ok).toBe(false);
    if (!short.ok) {
      expect(short.fieldErrors.aadhaarNo).toBeTruthy();
    }
  });

  it("rejects a choice value that is not on the list", () => {
    const result = validateStudentInfoInput({
      ...EMPTY_STUDENT_INFO_FORM_INPUT,
      gender: "Yes",
    });

    expect(result.ok).toBe(false);
  });

  /**
   * The one that matters most.
   *
   * The quick-edit sheets post a single group. If a partial write emitted the
   * columns it was not given, saving an address would blank the Aadhaar — the
   * same absent-vs-empty mistake that once wiped fee overrides.
   */
  it("writes only the columns it was handed", () => {
    const columns = toStudentInfoColumns({ district: "Bhilwara" });

    expect(columns).toEqual({ district: "Bhilwara" });
    expect(Object.hasOwn(columns, "aadhaar_no")).toBe(false);
  });

  it("still writes an explicit blank, because clearing a field is an edit", () => {
    const columns = toStudentInfoColumns({ district: null });

    expect(columns).toEqual({ district: null });
  });
});

/**
 * The phone group switcher on the edit form.
 *
 * The form carries ~50 controls, which is unusable in one phone scroll, and
 * disclosure is banned here — see
 * tests/ui/interaction/student-form-nothing-collapsed.test.tsx and the Rs 14,000
 * transport charge behind it. So the groups became tabs, and tabs bring their
 * own way to lose money: a panel that *unmounts* takes its inputs out of the
 * DOM, the fields stop posting, and the save reads as "the form never offered
 * this" — which is exactly how the fee overrides got wiped once already.
 *
 * Panels must therefore be hidden with CSS and never conditionally rendered.
 */
describe("student form phone group switcher", () => {
  const source = readFileSync(
    join(process.cwd(), "src/modules/students/ui/student-form.tsx"),
    "utf-8",
  );

  it("hides inactive panels with CSS so every field still posts", () => {
    expect(source).toContain('"hidden md:block"');
    // `md:block` is what keeps the desk tree showing every group at once.
    expect(source).toMatch(/groupPanel\s*=\s*\(/);
  });

  it("mounts all five panels unconditionally", () => {
    for (const group of ["student", "parents", "info", "fees", "status"]) {
      expect(source).toContain(`groupPanel("${group}")`);
      // A ternary around a panel would unmount it. Catch the shape directly.
      expect(source).not.toMatch(
        new RegExp(`activeGroup === "${group}"\\s*\\?`),
      );
    }
  });

  it("drops the grouping when a save failed", () => {
    // The error summary scrolls to and focuses the offending control, and can
    // do neither if that control sits in a display:none panel.
    expect(source).toContain("const showAllGroups = hasFieldErrors");
  });
});

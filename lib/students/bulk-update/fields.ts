// Field catalogue for the class-wise bulk update workspace.
//
// Every field here writes to a column on `public.students` and nothing else.
// Fee-profile fields (tuition/discount/waiver/new-old flag) live on
// `student_fee_overrides` and are deliberately NOT offered: they change money,
// need an override row with a mandatory reason, and must not share a sheet that
// office staff use to fix phone numbers.

import { STUDENT_STATUSES } from "@/lib/students/constants";

export type BulkUpdateFieldKey =
  | "fatherPhone"
  | "motherPhone"
  | "fatherName"
  | "motherName"
  | "email"
  | "dateOfBirth"
  | "address"
  | "class"
  | "route"
  | "status"
  | "notes";

export type BulkUpdateFieldGroup = "contact" | "placement" | "notes";

export type BulkUpdateField = {
  key: BulkUpdateFieldKey;
  /** Column header written into the template and matched back on upload. */
  header: string;
  group: BulkUpdateFieldGroup;
  /** The `public.students` column this field writes to. */
  column: string;
  kind: "text" | "phone" | "email" | "date" | "class" | "route" | "status";
  /** `false` for NOT NULL columns — CLEAR is refused rather than crashing. */
  clearable: boolean;
  /** Dues are regenerated for students whose value actually changed. */
  affectsFees: boolean;
  maxLength?: number;
  hint?: string;
};

/** Typed into any cell to blank a value on purpose. Blank means "leave alone". */
export const CLEAR_KEYWORD = "CLEAR";

export const BULK_UPDATE_FIELDS: readonly BulkUpdateField[] = [
  {
    key: "fatherPhone",
    header: "Father phone",
    group: "contact",
    column: "primary_phone",
    kind: "phone",
    clearable: true,
    affectsFees: false,
    maxLength: 40,
  },
  {
    key: "motherPhone",
    header: "Mother phone",
    group: "contact",
    column: "secondary_phone",
    kind: "phone",
    clearable: true,
    affectsFees: false,
    maxLength: 40,
  },
  {
    key: "fatherName",
    header: "Father name",
    group: "contact",
    column: "father_name",
    kind: "text",
    clearable: true,
    affectsFees: false,
    maxLength: 120,
  },
  {
    key: "motherName",
    header: "Mother name",
    group: "contact",
    column: "mother_name",
    kind: "text",
    clearable: true,
    affectsFees: false,
    maxLength: 120,
  },
  {
    key: "email",
    header: "Email",
    group: "contact",
    column: "email",
    kind: "email",
    clearable: true,
    affectsFees: false,
    maxLength: 160,
  },
  {
    key: "dateOfBirth",
    header: "Date of birth",
    group: "contact",
    column: "date_of_birth",
    kind: "date",
    clearable: true,
    affectsFees: false,
    hint: "DD-MM-YYYY",
  },
  {
    key: "address",
    header: "Address",
    group: "contact",
    column: "address",
    kind: "text",
    clearable: true,
    affectsFees: false,
    maxLength: 400,
  },
  {
    key: "class",
    header: "Class",
    group: "placement",
    column: "class_id",
    kind: "class",
    // class_id is NOT NULL — a student always belongs to a class.
    clearable: false,
    affectsFees: true,
    hint: "Must match a class in this session",
  },
  {
    key: "route",
    header: "Transport route",
    group: "placement",
    column: "transport_route_id",
    kind: "route",
    clearable: true,
    affectsFees: true,
    hint: `Route name, or ${CLEAR_KEYWORD} to remove transport`,
  },
  {
    key: "status",
    header: "Record status",
    group: "placement",
    column: "status",
    kind: "status",
    // status is NOT NULL and enum-typed.
    clearable: false,
    affectsFees: true,
    hint: STUDENT_STATUSES.map((item) => item.label).join(" / "),
  },
  {
    key: "notes",
    header: "Notes",
    group: "notes",
    column: "notes",
    kind: "text",
    clearable: true,
    affectsFees: false,
    maxLength: 1000,
  },
];

export const BULK_UPDATE_FIELD_GROUPS: ReadonlyArray<{
  group: BulkUpdateFieldGroup;
  label: string;
  description: string;
}> = [
  {
    group: "contact",
    label: "Contact details",
    description: "Phones, parent names, email, date of birth, address. No fee impact.",
  },
  {
    group: "placement",
    label: "Class, route and status",
    description: "Changing these recalculates dues for the students that actually change.",
  },
  { group: "notes", label: "Notes", description: "Free-text office notes." },
];

const FIELD_BY_KEY = new Map(BULK_UPDATE_FIELDS.map((field) => [field.key, field]));

export function getBulkUpdateField(key: string): BulkUpdateField | null {
  return FIELD_BY_KEY.get(key as BulkUpdateFieldKey) ?? null;
}

/**
 * Resolves the caller-supplied field keys to catalogue entries, dropping
 * anything unknown and de-duplicating. Order follows the catalogue, not the
 * caller, so the template columns are stable no matter how the boxes were
 * ticked.
 */
export function resolveBulkUpdateFields(keys: readonly string[]): BulkUpdateField[] {
  const wanted = new Set(keys);

  return BULK_UPDATE_FIELDS.filter((field) => wanted.has(field.key));
}

export function bulkUpdateFieldsAffectFees(fields: readonly BulkUpdateField[]) {
  return fields.some((field) => field.affectsFees);
}

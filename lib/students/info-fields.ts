/**
 * The student information fields, declared once.
 *
 * These 25 optional columns show up in four places — the desktop profile panel,
 * the phone profile cards, the full edit form, and the per-group quick-edit
 * sheet — and hand-writing them four times is how the four drift apart. So this
 * table is the only place a field is named. Everything else maps over it: the
 * select list, the row mapper, the form reader, the validator, and the labels.
 *
 * Adding a 26th field is one entry here, one column in a migration, and one
 * label key in each of the three message catalogues.
 *
 * Deliberately not `server-only`: the client edit form imports the descriptors
 * to render its inputs.
 */

/** Same shape the student form already accepts for father/mother phones. */
const PHONE_PATTERN = /^[0-9+()\-\s]{7,20}$/;

export type StudentInfoGroupId =
  | "identity"
  | "ids"
  | "school"
  | "address"
  | "guardian";

export type StudentInfoControl = "text" | "tel" | "select";

export const STUDENT_INFO_GROUPS = [
  { id: "identity", labelKey: "infoGroupIdentity" },
  { id: "ids", labelKey: "infoGroupIds" },
  { id: "school", labelKey: "infoGroupSchool" },
  { id: "address", labelKey: "infoGroupAddress" },
  { id: "guardian", labelKey: "infoGroupGuardian" },
] as const satisfies readonly { id: StudentInfoGroupId; labelKey: string }[];

export const GENDER_OPTIONS = ["Male", "Female", "Other"] as const;

export const CATEGORY_OPTIONS = [
  "General",
  "OBC",
  "SC",
  "ST",
  "EWS",
  "Other",
] as const;

export const BLOOD_GROUP_OPTIONS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;

/**
 * The school's four houses, named for the rulers of Mewar.
 *
 * `translateOptions: false` on the field below: these are proper nouns, and a
 * house does not become a different house in Hindi.
 */
export const HOUSE_OPTIONS = [
  "Bappa Rawal",
  "Rana Kumbha",
  "Rana Pratap",
  "Rana Sanga",
] as const;

export const GUARDIAN_RELATION_OPTIONS = [
  "Father",
  "Mother",
  "Grandfather",
  "Grandmother",
  "Uncle",
  "Aunt",
  "Brother",
  "Sister",
  "Other",
] as const;

/**
 * Declared `as const` so the field names stay literal (they become the keys of
 * `StudentInfoFields`), then re-exported below through an explicit descriptor
 * type so the optional keys survive. Iterate `STUDENT_INFO_FIELDS`, not this.
 */
const RAW_STUDENT_INFO_FIELDS = [
  // ── Identity ────────────────────────────────────────────────────────────
  {
    name: "gender",
    column: "gender",
    group: "identity",
    control: "select",
    labelKey: "infoGender",
    header: "Gender",
    maxLength: 20,
    options: GENDER_OPTIONS,
  },
  {
    name: "bloodGroup",
    column: "blood_group",
    group: "identity",
    control: "select",
    labelKey: "infoBloodGroup",
    header: "Blood group",
    maxLength: 5,
    options: BLOOD_GROUP_OPTIONS,
    // "O+" reads the same in every language this app speaks.
    translateOptions: false,
  },
  {
    name: "category",
    column: "category",
    group: "identity",
    control: "select",
    labelKey: "infoCategory",
    header: "Category",
    maxLength: 20,
    options: CATEGORY_OPTIONS,
  },
  {
    name: "religion",
    column: "religion",
    group: "identity",
    control: "text",
    labelKey: "infoReligion",
    header: "Religion",
    maxLength: 60,
  },
  {
    name: "caste",
    column: "caste",
    group: "identity",
    control: "text",
    labelKey: "infoCaste",
    header: "Caste",
    maxLength: 60,
  },
  {
    name: "nationality",
    column: "nationality",
    group: "identity",
    control: "text",
    labelKey: "infoNationality",
    header: "Nationality",
    maxLength: 60,
  },
  {
    name: "motherTongue",
    column: "mother_tongue",
    group: "identity",
    control: "text",
    labelKey: "infoMotherTongue",
    header: "Mother tongue",
    maxLength: 60,
  },

  // ── Government IDs ──────────────────────────────────────────────────────
  {
    name: "aadhaarNo",
    column: "aadhaar_no",
    group: "ids",
    control: "text",
    labelKey: "infoAadhaarNo",
    header: "Aadhaar no",
    maxLength: 12,
    digitsOnly: true,
    digits: 12,
  },
  {
    name: "janAadhaarNo",
    column: "jan_aadhaar_no",
    group: "ids",
    control: "text",
    labelKey: "infoJanAadhaarNo",
    header: "Jan Aadhaar no",
    // Shared by siblings, and issued in more than one format — no digit count.
    maxLength: 20,
  },
  {
    name: "apaarId",
    column: "apaar_id",
    group: "ids",
    control: "text",
    labelKey: "infoApaarId",
    header: "APAAR / PEN ID",
    maxLength: 12,
    digitsOnly: true,
    digits: 12,
  },

  // ── School record ───────────────────────────────────────────────────────
  {
    name: "house",
    column: "house",
    group: "school",
    control: "select",
    labelKey: "infoHouse",
    header: "House",
    maxLength: 40,
    options: HOUSE_OPTIONS,
    translateOptions: false,
  },
  {
    name: "rollNo",
    column: "roll_no",
    group: "school",
    control: "text",
    labelKey: "infoRollNo",
    header: "Roll no",
    maxLength: 20,
  },
  {
    name: "previousSchool",
    column: "previous_school",
    group: "school",
    control: "text",
    labelKey: "infoPreviousSchool",
    header: "Previous school",
    maxLength: 180,
  },
  {
    name: "tcNumber",
    column: "tc_number",
    group: "school",
    control: "text",
    labelKey: "infoTcNumber",
    header: "TC number",
    maxLength: 60,
  },
  {
    name: "boardRegistrationNo",
    column: "board_registration_no",
    group: "school",
    control: "text",
    labelKey: "infoBoardRegistrationNo",
    header: "Board registration no",
    maxLength: 60,
  },

  // ── Address ─────────────────────────────────────────────────────────────
  {
    name: "villageCity",
    column: "village_city",
    group: "address",
    control: "text",
    labelKey: "infoVillageCity",
    header: "Village / city",
    maxLength: 120,
    autoComplete: "address-level2",
  },
  {
    name: "tehsil",
    column: "tehsil",
    group: "address",
    control: "text",
    labelKey: "infoTehsil",
    header: "Tehsil",
    maxLength: 120,
  },
  {
    name: "district",
    column: "district",
    group: "address",
    control: "text",
    labelKey: "infoDistrict",
    header: "District",
    maxLength: 120,
  },
  {
    name: "state",
    column: "state",
    group: "address",
    control: "text",
    labelKey: "infoState",
    header: "State",
    maxLength: 120,
    autoComplete: "address-level1",
  },
  {
    name: "pincode",
    column: "pincode",
    group: "address",
    control: "text",
    labelKey: "infoPincode",
    header: "Pincode",
    maxLength: 6,
    digitsOnly: true,
    digits: 6,
    autoComplete: "postal-code",
  },

  // ── Guardian and emergency contact ──────────────────────────────────────
  {
    name: "guardianName",
    column: "guardian_name",
    group: "guardian",
    control: "text",
    labelKey: "infoGuardianName",
    header: "Guardian name",
    maxLength: 150,
  },
  {
    name: "guardianRelation",
    column: "guardian_relation",
    group: "guardian",
    control: "select",
    labelKey: "infoGuardianRelation",
    header: "Guardian relation",
    maxLength: 40,
    options: GUARDIAN_RELATION_OPTIONS,
  },
  {
    name: "guardianPhone",
    column: "guardian_phone",
    group: "guardian",
    control: "tel",
    labelKey: "infoGuardianPhone",
    header: "Guardian phone",
    maxLength: 40,
  },
  {
    name: "emergencyContactName",
    column: "emergency_contact_name",
    group: "guardian",
    control: "text",
    labelKey: "infoEmergencyContactName",
    header: "Emergency contact name",
    maxLength: 150,
  },
  {
    name: "emergencyContactPhone",
    column: "emergency_contact_phone",
    group: "guardian",
    control: "tel",
    labelKey: "infoEmergencyContactPhone",
    header: "Emergency phone",
    maxLength: 40,
  },
] as const;

export type StudentInfoFieldName =
  (typeof RAW_STUDENT_INFO_FIELDS)[number]["name"];

export type StudentInfoFieldDescriptor = {
  /** camelCase — the form input name and the key on StudentDetail. */
  readonly name: StudentInfoFieldName;
  /** snake_case — the public.students column. */
  readonly column: string;
  readonly group: StudentInfoGroupId;
  readonly control: StudentInfoControl;
  /** Key in the `Students` message namespace. Used on screen. */
  readonly labelKey: string;
  /**
   * Stable English spreadsheet column name, used by the export, the import
   * template and the bulk-update sheet.
   *
   * Deliberately not the translated label: an uploaded sheet is matched back on
   * this string, so a header that changed with the operator's locale would read
   * as "column not recognised" rather than as a bug.
   */
  readonly header: string;
  readonly maxLength: number;
  /** Choice values, stored verbatim. Translated for display unless noted. */
  readonly options?: readonly string[];
  /** false when the options are symbols (blood groups) rather than words. */
  readonly translateOptions?: boolean;
  /** Strip everything but digits before storing. */
  readonly digitsOnly?: boolean;
  /** Exact digit count required when a value is present. */
  readonly digits?: number;
  readonly autoComplete?: string;
};

export const STUDENT_INFO_FIELDS: readonly StudentInfoFieldDescriptor[] =
  RAW_STUDENT_INFO_FIELDS;

/** The info half of StudentDetail — nulls, because every field is optional. */
export type StudentInfoFields = {
  [K in StudentInfoFieldName]: string | null;
};

/** The info half of StudentFormInput — raw strings straight off the form. */
export type StudentInfoFormInput = {
  [K in StudentInfoFieldName]: string;
};

export type StudentInfoRow = Record<string, string | null>;

export type StudentInfoErrors = Partial<Record<StudentInfoFieldName, string>>;

/**
 * All 25 fields blank.
 *
 * Spread these into a `StudentValidatedInput` / `StudentFormInput` built by a
 * caller that has no information to contribute — the student import, and the
 * fixtures in the student tests. It keeps those call sites from having to name
 * every field, and means adding a 26th does not break them.
 */
export const EMPTY_STUDENT_INFO_FIELDS: StudentInfoFields = Object.fromEntries(
  STUDENT_INFO_FIELDS.map((field) => [field.name, null]),
) as StudentInfoFields;

export const EMPTY_STUDENT_INFO_FORM_INPUT: StudentInfoFormInput =
  Object.fromEntries(
    STUDENT_INFO_FIELDS.map((field) => [field.name, ""]),
  ) as StudentInfoFormInput;

/** Just the names, for callers that need a literal tuple (the import keys). */
export const STUDENT_INFO_FIELD_NAMES = RAW_STUDENT_INFO_FIELDS.map(
  (field) => field.name,
) as unknown as readonly StudentInfoFieldName[];

/** Appended to the students select in getStudentDetailUncached. */
export const STUDENT_INFO_SELECT_COLUMNS = STUDENT_INFO_FIELDS.map(
  (field) => field.column,
).join(", ");

export function getStudentInfoFieldsByGroup(group: StudentInfoGroupId) {
  return STUDENT_INFO_FIELDS.filter((field) => field.group === group);
}

/** Message key for one option value, e.g. "General" -> "infoOptionGeneral". */
export function getStudentInfoOptionKey(option: string) {
  return `infoOption${option.replace(/[^A-Za-z0-9]/g, "")}`;
}

function asTrimmedString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

/** Row (snake_case, from Supabase) -> the camelCase half of StudentDetail. */
export function mapStudentInfoRow(row: StudentInfoRow): StudentInfoFields {
  const mapped = {} as Record<StudentInfoFieldName, string | null>;

  for (const field of STUDENT_INFO_FIELDS) {
    const value = row[field.column];
    mapped[field.name] = typeof value === "string" && value.trim() ? value : null;
  }

  return mapped;
}

/**
 * Validated values -> the columns half of a students update/insert.
 *
 * Only keys actually present on `values` are emitted. A partial write must not
 * be able to null a column it was never given — that is the same absent-vs-empty
 * mistake the fee overrides had to learn, and here it would silently clear an
 * Aadhaar because the sheet that saved the address never rendered it.
 */
export function toStudentInfoColumns(values: Partial<StudentInfoFields>) {
  const columns: Record<string, string | null> = {};

  for (const field of STUDENT_INFO_FIELDS) {
    if (Object.hasOwn(values, field.name)) {
      columns[field.column] = values[field.name] ?? null;
    }
  }

  return columns;
}

/** StudentDetail -> the form's string values, blanks for the unrecorded. */
export function toStudentInfoFormValues(
  student: StudentInfoFields,
): StudentInfoFormInput {
  const values = {} as Record<StudentInfoFieldName, string>;

  for (const field of STUDENT_INFO_FIELDS) {
    values[field.name] = student[field.name] ?? "";
  }

  return values;
}

export function getStudentInfoInput(formData: FormData): StudentInfoFormInput {
  const input = {} as Record<StudentInfoFieldName, string>;

  for (const field of STUDENT_INFO_FIELDS) {
    input[field.name] = asTrimmedString(formData.get(field.name));
  }

  return input;
}

/** The subset of info fields a partial form actually offered. */
export function getSubmittedStudentInfoFields(formData: FormData) {
  return STUDENT_INFO_FIELDS.filter((field) => formData.has(field.name));
}

export function validateStudentInfoInput(input: StudentInfoFormInput):
  | { ok: true; data: StudentInfoFields }
  | { ok: false; fieldErrors: StudentInfoErrors } {
  const fieldErrors: StudentInfoErrors = {};
  const data = {} as Record<StudentInfoFieldName, string | null>;

  for (const field of STUDENT_INFO_FIELDS) {
    const raw = input[field.name] ?? "";
    const value = field.digitsOnly ? raw.replace(/\D/g, "") : raw.trim();

    if (!value) {
      // Blank is always allowed. Every one of these fields is optional, and a
      // half-filled record is the normal state of a student in August.
      data[field.name] = null;
      continue;
    }

    if (field.digits && value.length !== field.digits) {
      fieldErrors[field.name] = `Enter all ${field.digits} digits.`;
      continue;
    }

    if (field.control === "tel" && !PHONE_PATTERN.test(value)) {
      fieldErrors[field.name] = "Please enter a valid phone number.";
      continue;
    }

    if (field.options && !field.options.includes(value)) {
      fieldErrors[field.name] = "Please choose one of the listed options.";
      continue;
    }

    data[field.name] = value.slice(0, field.maxLength);
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return { ok: true, data };
}

/**
 * Postgres unique-violation on the partial Aadhaar index.
 *
 * Two students sharing an Aadhaar is a data-entry mistake worth catching at the
 * database, but a raw "duplicate key value violates unique constraint" is not
 * something an office clerk can act on.
 */
export const AADHAAR_UNIQUE_INDEX = "idx_students_aadhaar_no_unique";

export function isDuplicateAadhaarError(error: {
  code?: string | null;
  message?: string | null;
}) {
  // Match on the index name, not on 23505 alone: admission_no has its own
  // unique constraint, and reporting that one as a duplicate Aadhaar would
  // point the clerk at the wrong field.
  return Boolean(error.message?.includes(AADHAAR_UNIQUE_INDEX));
}

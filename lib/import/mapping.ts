import {
  type ImportCellValue,
  type ImportFieldDefinition,
  type ImportFieldKey,
  type RawImportRowPayload,
  type StudentImportColumnMapping,
} from "@/lib/import/types";

export const studentImportFieldDefinitions: readonly ImportFieldDefinition[] = [
  {
    key: "fullName",
    label: "Student name",
    description: "Required. Maps the student full name.",
    required: true,
    aliases: ["student name", "name", "full name", "student"],
  },
  {
    key: "classLabel",
    label: "Class",
    description: "Required. Must match an existing class label in the app.",
    required: true,
    aliases: ["class", "class name", "grade", "standard"],
  },
  {
    key: "admissionNo",
    label: "SR no / admission no",
    description: "Required. Used as the primary duplicate check.",
    required: true,
    aliases: ["sr no", "sr number", "admission no", "admission number", "adm no"],
  },
  {
    key: "dateOfBirth",
    label: "DOB",
    description: "Optional. Accepts spreadsheet dates or text dates.",
    required: false,
    aliases: ["dob", "date of birth", "birth date"],
  },
  {
    key: "fatherName",
    label: "Father name",
    description: "Optional.",
    required: false,
    aliases: ["father name", "father", "father's name", "fathers name"],
  },
  {
    key: "motherName",
    label: "Mother name",
    description: "Optional.",
    required: false,
    aliases: ["mother name", "mother", "mother's name", "mothers name"],
  },
  {
    key: "fatherPhone",
    label: "Father phone",
    description: "Optional.",
    required: false,
    aliases: ["father phone", "primary phone", "phone 1", "father mobile"],
  },
  {
    key: "motherPhone",
    label: "Mother phone",
    description: "Optional.",
    required: false,
    aliases: ["mother phone", "secondary phone", "phone 2", "mother mobile"],
  },
  {
    key: "address",
    label: "Address",
    description: "Optional.",
    required: false,
    aliases: ["address", "location", "residence"],
  },
  {
    key: "transportRouteLabel",
    label: "Transport route",
    description: "Optional. Must match an existing route name or route code if filled.",
    required: false,
    aliases: ["transport route", "route", "bus route", "transport"],
  },
  {
    key: "status",
    label: "Status",
    description: "Optional. Blank defaults to Active.",
    required: false,
    aliases: ["status", "student status"],
  },
  {
    key: "notes",
    label: "Notes",
    description: "Optional student notes.",
    required: false,
    aliases: ["notes", "remarks", "comment", "comments"],
  },
  {
    key: "customTuitionFeeAmount",
    label: "Custom tuition fee",
    description: "Optional override. Whole number only.",
    required: false,
    aliases: ["custom tuition", "tuition override", "custom tuition fee"],
  },
  {
    key: "customTransportFeeAmount",
    label: "Custom transport fee",
    description: "Optional override. Whole number only.",
    required: false,
    aliases: ["custom transport", "transport override", "custom transport fee"],
  },
  {
    key: "customBooksFeeAmount",
    label: "Custom books fee",
    description: "Optional override. Whole number only.",
    required: false,
    aliases: ["custom books", "books override", "custom books fee"],
  },
  {
    key: "customAdmissionActivityMiscFeeAmount",
    label: "Custom admission/activity/misc fee",
    description: "Optional override. Whole number only.",
    required: false,
    aliases: [
      "custom admission misc",
      "custom admission activity misc fee",
      "admission override",
    ],
  },
  {
    key: "customLateFeeFlatAmount",
    label: "Custom late fee",
    description: "Optional override. Whole number only.",
    required: false,
    aliases: ["custom late fee", "late fee override"],
  },
  {
    key: "discountAmount",
    label: "Discount amount",
    description: "Optional override. Whole number only.",
    required: false,
    aliases: ["discount", "discount amount", "concession amount"],
  },
  {
    key: "studentTypeOverride",
    label: "Student type override",
    description: "Optional override. Accepts new or existing.",
    required: false,
    aliases: ["student type override", "student type"],
  },
  {
    key: "transportAppliesOverride",
    label: "Transport applies override",
    description: "Optional override. Accepts yes/no, true/false, 1/0.",
    required: false,
    aliases: ["transport applies override", "transport applies"],
  },
  {
    key: "customOtherFeeHead",
    label: "Custom other fee head",
    description: "Optional override. Use together with Custom other fee amount.",
    required: false,
    aliases: ["other fee head", "custom fee head", "other fee name"],
  },
  {
    key: "customOtherFeeAmount",
    label: "Custom other fee amount",
    description: "Optional override. Whole number only.",
    required: false,
    aliases: ["other fee amount", "custom fee amount"],
  },
] as const;

export function normalizeImportKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

export function buildAutoColumnMapping(headers: readonly string[]): StudentImportColumnMapping {
  const mapping: StudentImportColumnMapping = {};
  const unusedHeaders = new Set(headers);

  for (const field of studentImportFieldDefinitions) {
    const matchedHeader = headers.find((header) => {
      if (!unusedHeaders.has(header)) {
        return false;
      }

      const normalizedHeader = normalizeImportKey(header);
      return field.aliases.some((alias) => normalizeImportKey(alias) === normalizedHeader);
    });

    if (matchedHeader) {
      mapping[field.key] = matchedHeader;
      unusedHeaders.delete(matchedHeader);
    }
  }

  return mapping;
}

export function validateColumnMapping(
  mapping: StudentImportColumnMapping,
  headers: readonly string[],
) {
  const errors: string[] = [];
  const headerSet = new Set(headers);

  for (const field of studentImportFieldDefinitions) {
    const selectedHeader = mapping[field.key];

    if (field.required && !selectedHeader) {
      errors.push(`${field.label} must be mapped before running dry-run validation.`);
      continue;
    }

    if (selectedHeader && !headerSet.has(selectedHeader)) {
      errors.push(`${field.label} is mapped to a column that is no longer available.`);
    }
  }

  return errors;
}

export function getMappedCellValue(
  rawPayload: RawImportRowPayload,
  mapping: StudentImportColumnMapping,
  field: ImportFieldKey,
): ImportCellValue {
  const selectedHeader = mapping[field];

  if (!selectedHeader) {
    return null;
  }

  return rawPayload[selectedHeader] ?? null;
}

export function getStudentImportColumnMapping(formData: FormData): StudentImportColumnMapping {
  const mapping: StudentImportColumnMapping = {};

  for (const field of studentImportFieldDefinitions) {
    const value = formData.get(`mapping:${field.key}`);

    if (typeof value === "string" && value.trim()) {
      mapping[field.key] = value.trim();
    }
  }

  return mapping;
}

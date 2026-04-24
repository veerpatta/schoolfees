import type { DryRunProcessedRow } from "@/lib/import/types";
import type { ImportMode } from "@/lib/import/types";

export type ExistingStudentDuplicateRecord = {
  id: string;
  admissionNo: string;
  fullName: string;
  classId: string;
  dateOfBirth: string | null;
};

type DuplicateDetectionOptions = {
  mode?: ImportMode;
};

function normalizeTextToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function buildIdentityKey(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => normalizeTextToken(part ?? ""))
    .filter(Boolean)
    .join("|");
}

export function detectDuplicateRows(
  rows: DryRunProcessedRow[],
  existingStudents: ExistingStudentDuplicateRecord[],
  options: DuplicateDetectionOptions = {},
) {
  const mode = options.mode ?? "add";
  const seenAdmissionNos = new Set<string>();
  const seenIdentityKeys = new Set<string>();
  const existingByAdmissionNo = new Map(
    existingStudents.map((student) => [student.admissionNo.toLowerCase(), student]),
  );
  const existingByIdentity = new Map(
    existingStudents
      .filter((student) => Boolean(student.dateOfBirth))
      .map((student) => [
        buildIdentityKey([student.fullName, student.classId, student.dateOfBirth]),
        student,
      ]),
  );
  const existingByNameClass = new Map(
    existingStudents.map((student) => [buildIdentityKey([student.fullName, student.classId]), student]),
  );

  return rows.map((row) => {
    if (row.status !== "valid" || !row.normalizedPayload) {
      return row;
    }

    const normalizedAdmissionNo = row.normalizedPayload.admissionNo.toLowerCase();
    const identityKey = buildIdentityKey([
      row.normalizedPayload.fullName,
      row.normalizedPayload.classId,
      row.normalizedPayload.dateOfBirth,
    ]);
    const errors = [...row.errors];
    let duplicateStudentId: string | null = row.duplicateStudentId;

    if (normalizedAdmissionNo && seenAdmissionNos.has(normalizedAdmissionNo)) {
      errors.push({
        code: "ERR_DUPLICATE_FILE_ADMISSION_NO",
        field: "admissionNo",
        message: `SR no ${row.normalizedPayload.admissionNo} appears more than once in this file.`,
      });
    } else if (normalizedAdmissionNo) {
      seenAdmissionNos.add(normalizedAdmissionNo);
    }

    const existingStudent = normalizedAdmissionNo
      ? existingByAdmissionNo.get(normalizedAdmissionNo)
      : null;

    if (existingStudent && !(mode === "update" && row.targetStudentId)) {
      duplicateStudentId = existingStudent.id;
    }

    if (identityKey && row.normalizedPayload.dateOfBirth) {
      if (seenIdentityKeys.has(identityKey)) {
        errors.push({
          code: "ERR_DUPLICATE_FILE_NAME_CLASS_DOB",
          field: "row",
          message:
            "A student with the same name, class, and DOB appears more than once in this file.",
        });
      } else {
        seenIdentityKeys.add(identityKey);
      }

      const existingByNameClassDob = existingByIdentity.get(identityKey);

      if (existingByNameClassDob && existingByNameClassDob.id !== existingStudent?.id) {
        duplicateStudentId = existingByNameClassDob.id;
        errors.push({
          code: "ERR_DUPLICATE_DB_NAME_CLASS_DOB",
          field: "row",
          message:
            "A student with the same name, class, and DOB already exists in the student master.",
        });
      }
    }

    if (mode === "add" && existingStudent) {
      errors.push({
        code: "ERR_DUPLICATE_DB_ADMISSION_NO",
        field: "admissionNo",
        message: `SR no ${row.normalizedPayload.admissionNo} already exists in Student Master.`,
      });
    }

    const nameClassKey = buildIdentityKey([
      row.normalizedPayload.fullName,
      row.normalizedPayload.classId,
    ]);
    const existingByNameClassOnly = nameClassKey ? existingByNameClass.get(nameClassKey) : null;

    if (
      mode === "add" &&
      existingByNameClassOnly &&
      !existingStudent &&
      !row.normalizedPayload.dateOfBirth
    ) {
      return {
        ...row,
        duplicateStudentId: existingByNameClassOnly.id,
        warnings: [
          ...row.warnings,
          "WARN_POSSIBLE_DUPLICATE_NAME_CLASS: Possible duplicate by name and class. Please review before import.",
        ],
      };
    }

    if (errors.length === row.errors.length) {
      if (mode === "update" && row.targetStudentId) {
        return row;
      }

      return mode === "update" && existingStudent
        ? {
            ...row,
            operation: "update" as const,
            duplicateStudentId,
            targetStudentId: existingStudent.id,
          }
        : row;
    }

    return {
      ...row,
      status: "duplicate" as const,
      errors,
      duplicateStudentId,
    };
  });
}

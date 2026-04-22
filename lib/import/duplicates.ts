import type { DryRunProcessedRow } from "@/lib/import/types";

export type ExistingStudentDuplicateRecord = {
  id: string;
  admissionNo: string;
  fullName: string;
  classId: string;
  dateOfBirth: string | null;
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
) {
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

    if (seenAdmissionNos.has(normalizedAdmissionNo)) {
      errors.push({
        code: "ERR_DUPLICATE_FILE_ADMISSION_NO",
        field: "admissionNo",
        message: `SR no ${row.normalizedPayload.admissionNo} appears more than once in this file.`,
      });
    } else {
      seenAdmissionNos.add(normalizedAdmissionNo);
    }

    const existingStudent = existingByAdmissionNo.get(normalizedAdmissionNo);

    if (existingStudent) {
      duplicateStudentId = existingStudent.id;
      errors.push({
        code: "ERR_DUPLICATE_DB_ADMISSION_NO",
        field: "admissionNo",
        message: `SR no ${row.normalizedPayload.admissionNo} already exists in the student master.`,
      });
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

      if (existingByNameClassDob) {
        duplicateStudentId = existingByNameClassDob.id;
        errors.push({
          code: "ERR_DUPLICATE_DB_NAME_CLASS_DOB",
          field: "row",
          message:
            "A student with the same name, class, and DOB already exists in the student master.",
        });
      }
    }

    if (errors.length === row.errors.length) {
      return row;
    }

    return {
      ...row,
      status: "duplicate" as const,
      errors,
      duplicateStudentId,
    };
  });
}

import type { DryRunProcessedRow } from "@/lib/import/types";

export type ExistingStudentDuplicateRecord = {
  id: string;
  admissionNo: string;
};

export function detectDuplicateRows(
  rows: DryRunProcessedRow[],
  existingStudents: ExistingStudentDuplicateRecord[],
) {
  const seenAdmissionNos = new Set<string>();
  const existingByAdmissionNo = new Map(
    existingStudents.map((student) => [student.admissionNo.toLowerCase(), student]),
  );

  return rows.map((row) => {
    if (row.status !== "valid" || !row.normalizedPayload) {
      return row;
    }

    const normalizedAdmissionNo = row.normalizedPayload.admissionNo.toLowerCase();
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

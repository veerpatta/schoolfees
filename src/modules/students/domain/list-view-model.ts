import type { StudentListItem } from "@/modules/students/domain/types";

export function filterStudentWorkspaceRows(input: {
  students: StudentListItem[];
  query: string;
  onlyWithDues: boolean;
}) {
  const query = input.query.trim().toLowerCase();

  return input.students.filter((student) => {
    if (query) {
      const haystack =
        `${student.fullName} ${student.admissionNo} ${student.classLabel} ${student.fatherPhone ?? ""} ${student.motherPhone ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    if (
      input.onlyWithDues &&
      !student.financialLoading &&
      student.outstandingAmount <= 0
    ) {
      return false;
    }

    return true;
  });
}

import type { StudentListItem } from "@/lib/students/types";

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

export function getRecentlyViewedStudents(input: {
  students: StudentListItem[];
  lastViewedByUser: Record<string, string>;
  limit?: number;
}) {
  return input.students
    .filter((student) => Boolean(input.lastViewedByUser[student.id]))
    .sort(
      (left, right) =>
        Date.parse(input.lastViewedByUser[right.id]) -
        Date.parse(input.lastViewedByUser[left.id]),
    )
    .slice(0, input.limit ?? 5);
}

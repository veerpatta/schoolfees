/**
 * Finding one student to add to a reminder run by hand.
 *
 * Reads `v_workbook_student_financials`, not `students`, and that is the whole
 * point: the matview is already scoped to the session, so a student it cannot
 * answer for is a student this run could not have messaged anyway. Searching
 * the master table would let the office add a child who has no ledger in the
 * session they are sending about, and the audience rebuild in
 * `sendRemindersAction` would then silently drop them — a family the screen
 * showed and the send skipped.
 */
import "server-only";

export type StudentBrief = {
  studentId: string;
  admissionNo: string;
  studentName: string;
  studentClass: string;
  /** Null when neither parent has a number on record — they cannot be messaged. */
  phoneOnRecord: string | null;
};

const COLUMNS = "student_id, admission_no, student_name, class_label, father_phone, mother_phone";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toBrief(row: any): StudentBrief {
  return {
    studentId: String(row.student_id),
    admissionNo: String(row.admission_no ?? ""),
    studentName: String(row.student_name ?? "")
      .toLowerCase()
      .replace(/\b[a-z]/g, (character) => character.toUpperCase())
      .trim(),
    studentClass: String(row.class_label ?? ""),
    phoneOnRecord: row.father_phone ?? row.mother_phone ?? null,
  };
}

/** PostgREST treats `,` as an or-separator and `%` as the wildcard, so both go. */
function sanitise(query: string): string {
  return query.replace(/[,%()*]/g, " ").trim();
}

/**
 * Up to `limit` students in this session matching an admission number or a name.
 *
 * An exact admission-number hit is returned alone, so typing `SR-0412` adds
 * that child rather than opening a list of everyone whose name contains it.
 */
export async function searchSessionStudents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sessionLabel: string,
  rawQuery: string,
  limit = 8,
): Promise<StudentBrief[]> {
  const query = sanitise(rawQuery);
  if (query.length < 2) return [];

  const { data: exact } = await supabase
    .from("v_workbook_student_financials")
    .select(COLUMNS)
    .eq("session_label", sessionLabel)
    .ilike("admission_no", query)
    .limit(2);

  if (exact && exact.length === 1) return [toBrief(exact[0])];

  const { data, error } = await supabase
    .from("v_workbook_student_financials")
    .select(COLUMNS)
    .eq("session_label", sessionLabel)
    .or(`admission_no.ilike.%${query}%,student_name.ilike.%${query}%`)
    .limit(limit);

  if (error) return [];
  return (data ?? []).map(toBrief);
}

/**
 * Names for the ids sitting in `?include=` / `?exclude=`.
 *
 * The chips have to read as people. A row of opaque UUIDs is a list nobody can
 * check before pressing Send, which on this screen costs money.
 */
export async function loadStudentBriefs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sessionLabel: string,
  studentIds: string[],
): Promise<StudentBrief[]> {
  if (studentIds.length === 0) return [];
  const { data, error } = await supabase
    .from("v_workbook_student_financials")
    .select(COLUMNS)
    .eq("session_label", sessionLabel)
    .in("student_id", studentIds.slice(0, 200));

  if (error) return [];
  return (data ?? []).map(toBrief);
}

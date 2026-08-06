// One ordering rule for every downloadable student list.
//
// Staff read these sheets against a paper register that is kept by name, so a
// template must come out A-Z by student name — never by SR number, which is
// issued in admission order and looks random alongside a name list.
//
// Sorting in JS rather than leaning on `order by full_name` keeps the result
// identical regardless of the database's collation: a C-collation sort puts
// every lowercase name after every uppercase one, so "aarav" would land at the
// bottom instead of the top.

/**
 * Case- and accent-insensitive name comparison, with SR number as a stable
 * tie-break so two students of the same name never swap places between two
 * downloads of the same list.
 */
export function compareStudentsByName(
  a: { fullName?: string | null; admissionNo?: string | null },
  b: { fullName?: string | null; admissionNo?: string | null },
) {
  const byName = (a.fullName ?? "").localeCompare(b.fullName ?? "", "en", {
    sensitivity: "base",
    numeric: true,
  });

  if (byName !== 0) {
    return byName;
  }

  return (a.admissionNo ?? "").localeCompare(b.admissionNo ?? "", "en", { numeric: true });
}

/** Same rule, for rows still in raw database shape. */
export function compareStudentRowsByName(
  a: { full_name?: string | null; admission_no?: string | null },
  b: { full_name?: string | null; admission_no?: string | null },
) {
  return compareStudentsByName(
    { fullName: a.full_name, admissionNo: a.admission_no },
    { fullName: b.full_name, admissionNo: b.admission_no },
  );
}

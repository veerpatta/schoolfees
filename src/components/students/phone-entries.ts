export type PhoneEntry = { label: string; phone: string };

/**
 * Build the list of usable parent phone numbers for a student. The student
 * record stores at most two numbers (primary → "Father", secondary →
 * "Mother"); placeholders/blanks are dropped.
 *
 * Deliberately in its own module, separate from `phone-chooser.tsx`.
 * That file also exports `PhoneActionMenu`, which pulls in Radix's dropdown —
 * so importing this pure helper from it dragged ~120 KB of dropdown code into
 * the graph of every surface that only wanted to list two numbers. Keeping the
 * data helper Radix-free is what lets the share sheet load the menu on demand.
 */
export function buildStudentPhoneEntries(
  student: {
    fatherPhone?: string | null;
    motherPhone?: string | null;
  },
  /** Translated role labels. Callers inside a locale context should pass these. */
  labels?: { father: string; mother: string },
): PhoneEntry[] {
  const entries: PhoneEntry[] = [];
  const father = student.fatherPhone?.trim();
  const mother = student.motherPhone?.trim();
  if (father) entries.push({ label: labels?.father ?? "Father", phone: father });
  if (mother) entries.push({ label: labels?.mother ?? "Mother", phone: mother });
  return entries;
}

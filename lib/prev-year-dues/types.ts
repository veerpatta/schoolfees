// Types for the previous-year dues carry-forward feature (A2).

/** The owner's decision in the `CONFIRM? (Y/N)` column, normalized. */
export type OwnerDecision = "confirm" | "write_off" | "reject" | "pending";

/** How a confirmed row resolved (or failed to resolve) to an app student. */
export type MatchMethod =
  | "admission_no"
  | "name_phone"
  | "manual"
  | "unmatched"
  | "ambiguous";

/** Final disposition of a parsed row in the dry-run / apply plan. */
export type RowStatus =
  | "matched" // confirmed + resolved to a single student with an active fee setting
  | "skipped" // write-off, reject, or pending — intentionally not applied
  | "unmatched" // confirmed but no student found
  | "ambiguous" // confirmed but multiple candidate students
  | "no_fee_setting" // matched, but the student's class has no active fee setting (insert would fail)
  | "error"; // malformed (e.g. missing/invalid due amount)

/** One raw row parsed from the `Confirm Dues Match` sheet, plus interpretation. */
export type ParsedDuesRow = {
  rowIndex: number;
  /** Raw column → value, preserved verbatim for audit. */
  raw: Record<string, string | number | null>;
  reviewGroup: string | null;
  oldAdmissionNo: string | null;
  oldName: string | null;
  prevYearDue: number | null;
  suggestedAppAdmissionNo: string | null;
  appStudentName: string | null;
  appFatherName: string | null;
  appPhone: string | null;
  appClass: string | null;
  matchType: string | null;
  confirmRaw: string | null;
  correctedAppAdmissionNo: string | null;
  notes: string | null;
  ownerDecision: OwnerDecision;
  /**
   * The admission number to match on: the corrected one if present, else the
   * suggested one. Null when the owner gave neither.
   */
  targetAdmissionNo: string | null;
  /** True if the row is structurally importable (confirm + positive due). */
  parseError: string | null;
};

/** A minimal app-student record the matcher indexes against. */
export type MatchableStudent = {
  studentId: string;
  admissionNo: string | null;
  fullName: string | null;
  fatherName: string | null;
  phone: string | null;
  classLabel: string | null;
  classId: string | null;
  /** The active fee_settings.id for the student's class, or null if none. */
  feeSettingId: string | null;
  /** True if a carry-forward line already exists for this student (idempotency). */
  hasExistingCarryForward?: boolean;
};

/** Outcome of planning a single row against the student index. */
export type PlannedDuesRow = {
  row: ParsedDuesRow;
  status: RowStatus;
  matchMethod: MatchMethod;
  matchedStudentId: string | null;
  matchedAdmissionNo: string | null;
  feeSettingId: string | null;
  classId: string | null;
  /** Amount that would be carried forward (= prevYearDue) when status === 'matched'. */
  applyAmount: number | null;
  /** True when a carry-forward line already exists → apply would skip (idempotent). */
  alreadyApplied: boolean;
  skipReason: string | null;
};

/** Aggregate dry-run report. */
export type DuesDryRunSummary = {
  totalRows: number;
  confirmedRows: number;
  confirmedSubtotal: number;
  writeOffRows: number;
  rejectedRows: number;
  pendingRows: number;
  matchedRows: number;
  matchedSubtotal: number;
  unmatchedRows: number;
  ambiguousRows: number;
  noFeeSettingRows: number;
  errorRows: number;
  alreadyAppliedRows: number;
};

/**
 * The one definition of what a student segment is.
 *
 * Deliberately outside `lib/students/` — Transactions imports it too,
 * `lib/students/data.ts` is `server-only`, and the chips need it in the browser.
 *
 * Each segment names a `seg_*` boolean column on `public.v_student_directory`
 * and a key in the payload of `get_student_segment_counts`. Addressing the
 * column by string from here means there is no per-segment SQL anywhere in the
 * app, and a test asserts every `column` below actually exists in the migration —
 * so the three cannot drift apart silently.
 */

export type SegmentFamily = "money" | "enrolment" | "quality" | "feeProfile";

export const SEGMENT_FAMILIES: readonly SegmentFamily[] = [
  "money",
  "enrolment",
  "quality",
  "feeProfile",
] as const;

export type SegmentId =
  // money & dues
  | "oldBalanceDue"
  | "overdue"
  | "lateFeePending"
  | "neverPaid"
  | "partlyPaid"
  | "yearClear"
  | "hasDues"
  // monthly EMI repayment plans
  | "onEmi"
  | "emiDue"
  | "emiMissed"
  // enrolment
  | "active"
  | "left"
  | "leftOwing"
  | "graduated"
  | "newThisYear"
  // data quality
  | "missingPhone"
  | "duesNotPrepared"
  | "missingDob"
  | "duplicateSr"
  | "pendingSr"
  // fee profile
  | "onTransport"
  | "hasDiscount"
  | "discountRte"
  | "discountStaffChild"
  | "discountThirdChild"
  | "feeException"
  | "lateFeeWaived";

export type SegmentDef = {
  id: SegmentId;
  family: SegmentFamily;
  /** Key inside the `Segments` next-intl namespace. */
  i18nKey: string;
  /** Boolean column on public.v_student_directory. */
  column: string;
  /** Key in the counts RPC payload. */
  countKey: string;
  /**
   * Enrolment segments choose the POPULATION rather than describe a student, so
   * they are counted before the other families narrow anything and they scope
   * the counts of every other family.
   */
  isPopulation?: boolean;
  /**
   * Fee-profile facts come from `student_fee_overrides`, whose RLS policy is
   * `fees:view` — strictly narrower than the policy on `students`. A teacher
   * gets a NULL join and would read a confident `false`. Hide the chip rather
   * than show a wrong zero.
   */
  requiresPermission?: "fees:view";
};

export const STUDENT_SEGMENTS: readonly SegmentDef[] = [
  // ── money & dues ─────────────────────────────────────────────────────────
  { id: "oldBalanceDue", family: "money", i18nKey: "oldBalanceDue", column: "seg_old_balance_due", countKey: "oldBalanceDue" },
  { id: "overdue", family: "money", i18nKey: "overdue", column: "seg_overdue", countKey: "overdue" },
  { id: "lateFeePending", family: "money", i18nKey: "lateFeePending", column: "seg_late_fee_pending", countKey: "lateFeePending" },
  // These three partition the roll: never started, started, finished. Overdue
  // above is the timing axis and overlaps all three.
  { id: "neverPaid", family: "money", i18nKey: "neverPaid", column: "seg_never_paid", countKey: "neverPaid" },
  { id: "partlyPaid", family: "money", i18nKey: "partlyPaid", column: "seg_partly_paid", countKey: "partlyPaid" },
  { id: "yearClear", family: "money", i18nKey: "yearClear", column: "seg_year_clear", countKey: "yearClear" },
  { id: "hasDues", family: "money", i18nKey: "hasDues", column: "seg_has_dues", countKey: "hasDues" },

  // Monthly EMI. `onEmi` is the whole cohort; the other two are the follow-up
  // list, and they are mutually exclusive — a plan is either `due` (this
  // month's EMI outstanding, nothing past due) or `behind` (an EMI whose date
  // has passed is unpaid), never both.
  { id: "onEmi", family: "money", i18nKey: "onEmi", column: "seg_on_emi", countKey: "onEmi" },
  { id: "emiDue", family: "money", i18nKey: "emiDue", column: "seg_emi_due", countKey: "emiDue" },
  { id: "emiMissed", family: "money", i18nKey: "emiMissed", column: "seg_emi_missed", countKey: "emiMissed" },

  // ── enrolment ────────────────────────────────────────────────────────────
  { id: "active", family: "enrolment", i18nKey: "active", column: "seg_active", countKey: "active", isPopulation: true },
  { id: "left", family: "enrolment", i18nKey: "left", column: "seg_left", countKey: "left", isPopulation: true },
  { id: "leftOwing", family: "enrolment", i18nKey: "leftOwing", column: "seg_left_owing", countKey: "leftOwing", isPopulation: true },
  { id: "graduated", family: "enrolment", i18nKey: "graduated", column: "seg_graduated", countKey: "graduated", isPopulation: true },
  { id: "newThisYear", family: "enrolment", i18nKey: "newThisYear", column: "seg_new_this_year", countKey: "newThisYear", isPopulation: true },

  // ── data quality ─────────────────────────────────────────────────────────
  { id: "missingPhone", family: "quality", i18nKey: "missingPhone", column: "seg_missing_phone", countKey: "missingPhone" },
  { id: "duesNotPrepared", family: "quality", i18nKey: "duesNotPrepared", column: "seg_dues_not_prepared", countKey: "duesNotPrepared" },
  { id: "missingDob", family: "quality", i18nKey: "missingDob", column: "seg_missing_dob", countKey: "missingDob" },
  { id: "duplicateSr", family: "quality", i18nKey: "duplicateSr", column: "seg_duplicate_sr", countKey: "duplicateSr" },
  { id: "pendingSr", family: "quality", i18nKey: "pendingSr", column: "seg_pending_sr", countKey: "pendingSr" },

  // ── fee profile ──────────────────────────────────────────────────────────
  { id: "onTransport", family: "feeProfile", i18nKey: "onTransport", column: "seg_on_transport", countKey: "onTransport" },
  { id: "hasDiscount", family: "feeProfile", i18nKey: "hasDiscount", column: "seg_has_discount", countKey: "hasDiscount" },
  { id: "discountRte", family: "feeProfile", i18nKey: "discountRte", column: "seg_discount_rte", countKey: "discountRte" },
  { id: "discountStaffChild", family: "feeProfile", i18nKey: "discountStaffChild", column: "seg_discount_staff_child", countKey: "discountStaffChild" },
  { id: "discountThirdChild", family: "feeProfile", i18nKey: "discountThirdChild", column: "seg_discount_third_child", countKey: "discountThirdChild" },
  { id: "feeException", family: "feeProfile", i18nKey: "feeException", column: "seg_fee_exception", countKey: "feeException", requiresPermission: "fees:view" },
  { id: "lateFeeWaived", family: "feeProfile", i18nKey: "lateFeeWaived", column: "seg_late_fee_waived", countKey: "lateFeeWaived" },
] as const;

export const SEGMENT_BY_ID: Record<SegmentId, SegmentDef> = Object.fromEntries(
  STUDENT_SEGMENTS.map((segment) => [segment.id, segment]),
) as Record<SegmentId, SegmentDef>;

const SEGMENT_IDS = new Set<string>(STUDENT_SEGMENTS.map((segment) => segment.id));

export function isSegmentId(value: string): value is SegmentId {
  return SEGMENT_IDS.has(value);
}

/**
 * Ids retired by a rename, kept so a bookmarked URL or a saved view from before
 * the rename still resolves instead of silently dropping the filter.
 */
const SEGMENT_ALIASES: Record<string, SegmentId> = {
  // "Fully paid" became "Year clear" when the money buckets were redefined to
  // read money instead of status_label (20260810090000).
  fullyPaid: "yearClear",
};

/** `?seg=overdue,onTransport` → `["overdue", "onTransport"]`. Unknown ids drop. */
export function parseSegments(
  // `string[]` because that is what Next passes for a repeated `?seg=`, and
  // `raw.split(",")` threw `split is not a function` straight out of the
  // Transactions Server Component. Repeated values are concatenated rather
  // than dropped: `?seg=overdue&seg=onEmi` plainly means both, and unknown
  // ids fall out below anyway.
  raw: string | string[] | null | undefined,
): SegmentId[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : [raw];
  const seen = new Set<SegmentId>();
  for (const part of parts.flatMap((value) => String(value ?? "").split(","))) {
    const id = part.trim();
    const resolved = SEGMENT_ALIASES[id] ?? id;
    if (isSegmentId(resolved)) seen.add(resolved);
  }
  // Emit in definition order so the URL is stable regardless of click order —
  // otherwise two identical filter sets produce two different URLs and the
  // saved-view comparison never matches.
  return STUDENT_SEGMENTS.filter((segment) => seen.has(segment.id)).map((segment) => segment.id);
}

export function serializeSegments(ids: readonly SegmentId[]): string {
  return parseSegments(ids.join(",")).join(",");
}

export function segmentsEqual(left: readonly SegmentId[], right: readonly SegmentId[]): boolean {
  return serializeSegments(left) === serializeSegments(right);
}

export function segmentsInFamily(family: SegmentFamily): SegmentDef[] {
  return STUDENT_SEGMENTS.filter((segment) => segment.family === family);
}

/** The enrolment segments among a selection — the population axis. */
export function populationSegments(ids: readonly SegmentId[]): SegmentDef[] {
  return ids.map((id) => SEGMENT_BY_ID[id]).filter((segment) => segment?.isPopulation);
}

/**
 * The `students.status` values implied by the selected enrolment segments, for
 * the counts RPC. `leftOwing` and `newThisYear` are not statuses in their own
 * right — the former is a subset of the departed, the latter is orthogonal — so
 * neither narrows the status list.
 */
/**
 * True when a selected chip already states an enrolment population.
 *
 * `newThisYear` is deliberately NOT one of them: despite the name it reads the
 * fee tier (New vs Old academic fee), not enrollment — see the directory view.
 * `leftOwing` is `status <> 'active' AND owing`, so it counts too.
 *
 * Callers use this to let the chip win over the status dropdown: chip AND
 * dropdown-default-"active" is the empty set, which is how "Left 28" could
 * display on the chip while selecting it returned zero rows.
 */
export function segmentsImplyEnrolment(ids: readonly SegmentId[]): boolean {
  return ids.some(
    (id) => id === "active" || id === "left" || id === "leftOwing" || id === "graduated",
  );
}

export function statusesForSegments(ids: readonly SegmentId[]): string[] | null {
  const statuses = new Set<string>();
  for (const id of ids) {
    if (id === "active") statuses.add("active");
    if (id === "left") statuses.add("left");
    if (id === "graduated") statuses.add("graduated");
  }
  return statuses.size > 0 ? [...statuses] : null;
}

export type SegmentCounts = {
  scopeTotal: number;
  populationTotal: number;
  enrolment: Record<string, number>;
  counts: Record<string, number>;
};

export const EMPTY_SEGMENT_COUNTS: SegmentCounts = {
  scopeTotal: 0,
  populationTotal: 0,
  enrolment: {},
  counts: {},
};

/** The number to render on a chip, or null when counts have not loaded. */
export function segmentCount(
  counts: SegmentCounts | null | undefined,
  id: SegmentId,
): number | null {
  if (!counts) return null;
  const def = SEGMENT_BY_ID[id];
  if (!def) return null;
  const bucket = def.isPopulation ? counts.enrolment : counts.counts;
  const value = bucket?.[def.countKey];
  return typeof value === "number" ? value : null;
}

import {
  deriveCadence,
  type Cadence,
  type DefaulterContactSummary,
} from "@/lib/defaulters/cadence";
import type { DefaulterSummaryRow } from "@/lib/defaulters/types";

export const HIGH_EXPOSURE_AMOUNT = 30000;
export const NOT_RESPONDING_STREAK = 3;

export type RecoveryLaneId =
  | "promiseDue"
  | "brokenPromise"
  | "notResponding"
  | "highExposure"
  | "familyExposure";

export type RecoveryDeskInput = {
  rows: DefaulterSummaryRow[];
  contactSummaries: Record<string, DefaulterContactSummary>;
  today?: Date;
};

export type RecoveryDeskEntry = {
  row: DefaulterSummaryRow;
  summary: DefaulterContactSummary | null;
  cadence: Cadence;
  priorityScore: number;
  reasons: string[];
};

export type RecoveryLane = {
  id: RecoveryLaneId;
  rows: RecoveryDeskEntry[];
  totalPending: number;
};

export type RecoveryAgingBucket = {
  rows: number;
  pendingAmount: number;
};

export type RecoveryDeskMetrics = {
  totalRows: number;
  activeRecoveryRows: number;
  noCallRows: number;
  promiseDueRows: number;
  brokenPromiseRows: number;
  notRespondingRows: number;
  highExposureRows: number;
  familyExposureRows: number;
  activePendingAmount: number;
  recoveryRate: number;
  promiseKeptRate: number | null;
  agingBuckets: {
    currentTo30: RecoveryAgingBucket;
    days31To60: RecoveryAgingBucket;
    days61To90: RecoveryAgingBucket;
    days91Plus: RecoveryAgingBucket;
  };
};

export type RecoveryDesk = {
  metrics: RecoveryDeskMetrics;
  lanes: Record<RecoveryLaneId, RecoveryLane>;
  nextBestRows: RecoveryDeskEntry[];
};

const DEFAULT_SUMMARY: DefaulterContactSummary = {
  snoozeUntil: null,
  lastContactedAt: null,
};

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isPromiseDue(
  row: DefaulterSummaryRow,
  summary: DefaulterContactSummary | null,
  todayKey: string,
) {
  if (row.promiseStatus === "broken") return true;
  if (summary?.lastOutcome !== "promised_pay" || !summary.snoozeUntil) return false;
  return summary.snoozeUntil <= todayKey;
}

function isNotResponding(row: DefaulterSummaryRow, summary: DefaulterContactSummary | null) {
  return (
    row.paymentBehavior === "non_responsive" ||
    (summary?.noAnswerStreak ?? 0) >= NOT_RESPONDING_STREAK
  );
}

function isFamilyExposure(row: DefaulterSummaryRow) {
  return Boolean(row.familyGroupId) && (row.familyVisibleSiblingCount ?? 0) > 0;
}

function buildReasons(
  row: DefaulterSummaryRow,
  summary: DefaulterContactSummary | null,
  todayKey: string,
) {
  const reasons: string[] = [];
  if (row.promiseStatus === "broken") reasons.push("Broken promise");
  else if (isPromiseDue(row, summary, todayKey)) reasons.push("Promise due");
  if (isNotResponding(row, summary)) reasons.push("Repeated no-answer");
  if (row.totalPending >= HIGH_EXPOSURE_AMOUNT || row.heat >= 75) reasons.push("High exposure");
  if (isFamilyExposure(row)) reasons.push("Sibling/family exposure");
  if (
    typeof row.promiseKeptRate === "number" &&
    (row.promiseKeptCount ?? 0) + (row.promiseBrokenCount ?? 0) >= 2 &&
    row.promiseKeptRate < 50
  ) {
    reasons.push("Low promise reliability");
  }
  if (row.overdueAmount > 0) reasons.push("Overdue balance");
  return reasons;
}

function priorityScore(
  row: DefaulterSummaryRow,
  summary: DefaulterContactSummary | null,
  todayKey: string,
) {
  let score = row.heat;
  if (row.promiseStatus === "broken") score += 90;
  else if (isPromiseDue(row, summary, todayKey)) score += 55;
  if (isNotResponding(row, summary)) score += 25;
  if (isFamilyExposure(row)) score += 20;
  if (row.totalPending >= HIGH_EXPOSURE_AMOUNT) score += 20;
  if (
    typeof row.promiseKeptRate === "number" &&
    (row.promiseKeptCount ?? 0) + (row.promiseBrokenCount ?? 0) >= 2 &&
    row.promiseKeptRate < 50
  ) {
    score += 20 + Math.floor((50 - row.promiseKeptRate) / 5);
  }
  if (row.overdueAmount > 0) score += 10;
  score += Math.min(30, Math.floor(row.totalPending / 5000));
  return score;
}

function sortEntries(left: RecoveryDeskEntry, right: RecoveryDeskEntry) {
  if (right.priorityScore !== left.priorityScore) {
    return right.priorityScore - left.priorityScore;
  }
  if (right.row.totalPending !== left.row.totalPending) {
    return right.row.totalPending - left.row.totalPending;
  }
  return left.row.fullName.localeCompare(right.row.fullName);
}

function makeLane(id: RecoveryLaneId, rows: RecoveryDeskEntry[]): RecoveryLane {
  return {
    id,
    rows: [...rows].sort(sortEntries),
    totalPending: rows.reduce((sum, entry) => sum + entry.row.totalPending, 0),
  };
}

function createEmptyAgingBuckets(): RecoveryDeskMetrics["agingBuckets"] {
  return {
    currentTo30: { rows: 0, pendingAmount: 0 },
    days31To60: { rows: 0, pendingAmount: 0 },
    days61To90: { rows: 0, pendingAmount: 0 },
    days91Plus: { rows: 0, pendingAmount: 0 },
  };
}

function addToAgingBucket(
  buckets: RecoveryDeskMetrics["agingBuckets"],
  row: DefaulterSummaryRow,
) {
  const bucket =
    row.daysOverdue <= 30
      ? buckets.currentTo30
      : row.daysOverdue <= 60
        ? buckets.days31To60
        : row.daysOverdue <= 90
          ? buckets.days61To90
          : buckets.days91Plus;

  bucket.rows += 1;
  bucket.pendingAmount += row.totalPending;
}

function calculateRecoveryRate(rows: DefaulterSummaryRow[]) {
  const totalDue = rows.reduce((sum, row) => sum + row.totalDue, 0);
  if (totalDue <= 0) return 0;
  const totalPaid = rows.reduce((sum, row) => sum + row.totalPaid, 0);
  return Math.round((totalPaid / totalDue) * 100);
}

function calculatePromiseKeptRate(rows: DefaulterSummaryRow[]) {
  const kept = rows.reduce((sum, row) => sum + (row.promiseKeptCount ?? 0), 0);
  const broken = rows.reduce((sum, row) => sum + (row.promiseBrokenCount ?? 0), 0);
  const total = kept + broken;
  if (total <= 0) return null;
  return Math.round((kept / total) * 100);
}

export function buildRecoveryDesk(input: RecoveryDeskInput): RecoveryDesk {
  const today = input.today ?? new Date();
  const todayKey = dateKey(today);
  const activeRows = input.rows.filter((row) => !row.noCall);
  const agingBuckets = createEmptyAgingBuckets();
  activeRows.forEach((row) => addToAgingBucket(agingBuckets, row));

  const entries = activeRows.map((row) => {
    const summary = input.contactSummaries[row.studentId] ?? null;
    return {
      row,
      summary,
      cadence: deriveCadence(summary ?? DEFAULT_SUMMARY, today),
      priorityScore: priorityScore(row, summary, todayKey),
      reasons: buildReasons(row, summary, todayKey),
    } satisfies RecoveryDeskEntry;
  });

  const promiseDue = entries.filter((entry) =>
    isPromiseDue(entry.row, entry.summary, todayKey),
  );
  const brokenPromise = entries.filter((entry) => entry.row.promiseStatus === "broken");
  const notResponding = entries.filter((entry) =>
    isNotResponding(entry.row, entry.summary),
  );
  const highExposure = entries.filter(
    (entry) => entry.row.totalPending >= HIGH_EXPOSURE_AMOUNT || entry.row.heat >= 75,
  );
  const familyExposure = entries.filter((entry) => isFamilyExposure(entry.row));

  return {
    metrics: {
      totalRows: input.rows.length,
      activeRecoveryRows: activeRows.length,
      noCallRows: input.rows.length - activeRows.length,
      promiseDueRows: promiseDue.length,
      brokenPromiseRows: brokenPromise.length,
      notRespondingRows: notResponding.length,
      highExposureRows: highExposure.length,
      familyExposureRows: familyExposure.length,
      activePendingAmount: activeRows.reduce((sum, row) => sum + row.totalPending, 0),
      recoveryRate: calculateRecoveryRate(activeRows),
      promiseKeptRate: calculatePromiseKeptRate(activeRows),
      agingBuckets,
    },
    lanes: {
      promiseDue: makeLane("promiseDue", promiseDue),
      brokenPromise: makeLane("brokenPromise", brokenPromise),
      notResponding: makeLane("notResponding", notResponding),
      highExposure: makeLane("highExposure", highExposure),
      familyExposure: makeLane("familyExposure", familyExposure),
    },
    nextBestRows: [...entries].sort(sortEntries).slice(0, 15),
  };
}

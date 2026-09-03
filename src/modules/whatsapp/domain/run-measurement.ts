/**
 * Did the reminders work, and what did they cost?
 *
 * Pure arithmetic over what a run already recorded. Nothing here decides
 * anything or sends anything; it exists so the office can answer "is this worth
 * doing" with a number rather than a feeling.
 *
 * The wording rule from `v_whatsapp_run_outcomes` holds throughout: **paid
 * AFTER the reminder, never because of it.** Payments here are spiky — 17 August
 * posted 107 families in one day against 2-9 on a normal day, which is counter
 * cash entered in a batch — and no join can tell that apart from a response. The
 * one number that can is the holdout comparison, and it is labelled differently
 * for exactly that reason.
 */

/**
 * What one WhatsApp message costs, in rupees.
 *
 * UTILITY rate as at September 2026. MARKETING is ₹1.09 — a 7.5× jump — which is
 * what `vpps_waiver_offer_hinglish` cost when Meta re-categorised it fourteen
 * minutes after submission. If the bill stops matching this figure, check the
 * category before assuming the rate changed.
 */
export const WHATSAPP_MESSAGE_COST_RUPEES = 0.145;

/** Median of a list of days. Null for an empty one — not zero. */
export function medianDaysToPay(days: readonly number[]): number | null {
  // Zero would read as "everyone paid the same day", which is the opposite of
  // "nobody has paid yet".
  if (days.length === 0) return null;
  const sorted = [...days].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[middle - 1]! + sorted[middle]!) / 2) * 10) / 10
    : sorted[middle]!;
}

export type HistogramBucket = {
  label: string;
  /** Inclusive lower bound in days. */
  from: number;
  /** Inclusive upper bound, or null for the open-ended last bucket. */
  to: number | null;
  count: number;
};

/**
 * Days-to-pay, bucketed for a hand-rolled bar chart.
 *
 * Fixed buckets rather than computed ones, so two runs can be read against each
 * other. "Same day" is its own bucket because it is the outcome the office is
 * actually hoping for, and burying it inside "0-2 days" would hide the only
 * result that clearly follows from the message.
 */
export function daysToPayHistogram(days: readonly number[]): HistogramBucket[] {
  const buckets: HistogramBucket[] = [
    { label: "Same day", from: 0, to: 0, count: 0 },
    { label: "1-2 days", from: 1, to: 2, count: 0 },
    { label: "3-6 days", from: 3, to: 6, count: 0 },
    { label: "7-13 days", from: 7, to: 13, count: 0 },
    { label: "14+ days", from: 14, to: null, count: 0 },
  ];

  for (const value of days) {
    if (!Number.isFinite(value) || value < 0) continue;
    const bucket = buckets.find(
      (entry) => value >= entry.from && (entry.to === null || value <= entry.to),
    );
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

export type RunCost = {
  /** Messages actually billed. Not families: a second number is a second message. */
  messages: number;
  /** Rupees, to two decimals. */
  cost: number;
  /** Rupees collected after the run. */
  collected: number;
  /**
   * Rupees collected per rupee spent, or null when nothing was spent.
   *
   * Null rather than Infinity, and not shown at all when there is nothing to
   * divide — a screen reading "∞" teaches nobody anything.
   */
  returnPerRupee: number | null;
};

export function describeRunCost(args: {
  messages: number;
  collected: number;
  ratePerMessage?: number;
}): RunCost {
  const rate = args.ratePerMessage ?? WHATSAPP_MESSAGE_COST_RUPEES;
  const messages = Math.max(0, Math.round(args.messages));
  const cost = Math.round(messages * rate * 100) / 100;
  const collected = Math.max(0, Math.round(args.collected));

  return {
    messages,
    cost,
    collected,
    returnPerRupee: cost > 0 ? Math.round((collected / cost) * 10) / 10 : null,
  };
}

/* ------------------------------------------------------------- comparisons */

export type ComparableRun = {
  language: string;
  situation: string;
  /** ISO timestamp. */
  startedAt: string;
  messaged: number;
  familiesPaid: number;
  daysToPay: number[];
  /** The schedule slot, when the run satisfied one. */
  scheduledFor: string | null;
  lastDate: string | null;
};

export type ComparisonRow = {
  key: string;
  label: string;
  runs: number;
  messaged: number;
  paid: number;
  /** Percent, 0-100, or null when nobody was messaged. */
  responseRate: number | null;
  medianDays: number | null;
};

function summarise(key: string, label: string, runs: readonly ComparableRun[]): ComparisonRow {
  const messaged = runs.reduce((total, run) => total + run.messaged, 0);
  const paid = runs.reduce((total, run) => total + run.familiesPaid, 0);
  const days = runs.flatMap((run) => run.daysToPay);
  return {
    key,
    label,
    runs: runs.length,
    messaged,
    paid,
    // Null, not zero: "nobody was messaged" and "nobody responded" are different
    // answers and only one of them is about the message.
    responseRate: messaged > 0 ? Math.round((paid / messaged) * 1000) / 10 : null,
    medianDays: medianDaysToPay(days),
  };
}

/** Group runs by a key and summarise each group. Sorted by most messaged. */
function compareBy(
  runs: readonly ComparableRun[],
  keyOf: (run: ComparableRun) => string | null,
  labelOf: (key: string) => string,
): ComparisonRow[] {
  const groups = new Map<string, ComparableRun[]>();
  for (const run of runs) {
    const key = keyOf(run);
    if (key === null) continue;
    const list = groups.get(key);
    if (list) list.push(run);
    else groups.set(key, [run]);
  }
  return [...groups.entries()]
    .map(([key, group]) => summarise(key, labelOf(key), group))
    .sort((left, right) => right.messaged - left.messaged);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** IST parts of an ISO timestamp — the school's clock, not the server's. */
function istParts(iso: string): { weekday: number; hour: number } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const weekdayName = formatted.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(formatted.find((part) => part.type === "hour")?.value ?? NaN);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName);
  if (weekday === -1 || !Number.isFinite(hour)) return null;
  return { weekday, hour };
}

export function compareByLanguage(runs: readonly ComparableRun[]): ComparisonRow[] {
  return compareBy(
    runs,
    (run) => run.language,
    (key) => (key === "hi" ? "Hindi" : key === "en" ? "English" : key),
  );
}

export function compareByWeekday(runs: readonly ComparableRun[]): ComparisonRow[] {
  return compareBy(
    runs,
    (run) => {
      const parts = istParts(run.startedAt);
      return parts ? String(parts.weekday) : null;
    },
    (key) => WEEKDAYS[Number(key)] ?? key,
  );
}

export function compareByHour(runs: readonly ComparableRun[]): ComparisonRow[] {
  return compareBy(
    runs,
    (run) => {
      const parts = istParts(run.startedAt);
      // Two-hour bands. Per-hour would spread a handful of runs across
      // twenty-four columns and compare nothing to nothing.
      return parts ? String(Math.floor(parts.hour / 2) * 2) : null;
    },
    (key) => {
      const from = Number(key);
      return `${String(from).padStart(2, "0")}:00-${String(from + 2).padStart(2, "0")}:00`;
    },
  );
}

/**
 * T-10 vs T-3 vs T+1: how far from the deadline the run went out.
 *
 * Measured from the notice's own date rather than from a schedule, so an ad-hoc
 * run counts too — the question is how much warning a parent had, not whether
 * somebody used the scheduler.
 */
export function compareByLeadTime(runs: readonly ComparableRun[]): ComparisonRow[] {
  return compareBy(
    runs,
    (run) => {
      if (!run.lastDate) return null;
      const sentOn = run.startedAt.slice(0, 10);
      const days = Math.round(
        (new Date(`${run.lastDate}T00:00:00+05:30`).getTime() -
          new Date(`${sentOn}T00:00:00+05:30`).getTime()) /
          86_400_000,
      );
      if (!Number.isFinite(days)) return null;
      if (days >= 8) return "t10";
      if (days >= 4) return "t7";
      if (days >= 1) return "t3";
      if (days === 0) return "t0";
      return "after";
    },
    (key) =>
      ({
        t10: "8+ days before",
        t7: "4-7 days before",
        t3: "1-3 days before",
        t0: "On the day",
        after: "After the date",
      })[key] ?? key,
  );
}

/* ---------------------------------------------------------------- holdout */

export type HoldoutSplit<T> = {
  messaged: T[];
  heldOut: T[];
};

/**
 * Hold back a random percentage of an audience.
 *
 * Deterministic when given a `random` function, so the split can be tested. The
 * caller passes `Math.random` in production.
 *
 * Rounds DOWN, so "10% of 15" holds back 1 rather than 2: the default should
 * always be to chase the money, and a rounding rule that errs the other way is
 * the school losing collections to a measurement.
 *
 * Never holds back everybody, whatever percentage is asked for — a run that
 * messages nobody is not an experiment, it is a mistake.
 */
export function splitHoldout<T>(
  audience: readonly T[],
  percent: number,
  random: () => number = Math.random,
): HoldoutSplit<T> {
  const share = Math.min(50, Math.max(0, Math.round(percent)));
  if (share === 0 || audience.length === 0) {
    return { messaged: [...audience], heldOut: [] };
  }

  const target = Math.min(
    Math.floor((audience.length * share) / 100),
    // At least one family is always messaged.
    audience.length - 1,
  );
  if (target <= 0) return { messaged: [...audience], heldOut: [] };

  // Fisher-Yates over a copy of the indices, so the choice is uniform and the
  // caller's order is not disturbed for the messaged group.
  const indices = audience.map((_, index) => index);
  for (let index = indices.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [indices[index], indices[swap]] = [indices[swap]!, indices[index]!];
  }

  const heldOutIndices = new Set(indices.slice(0, target));
  const messaged: T[] = [];
  const heldOut: T[] = [];
  audience.forEach((entry, index) => {
    if (heldOutIndices.has(index)) heldOut.push(entry);
    else messaged.push(entry);
  });

  return { messaged, heldOut };
}

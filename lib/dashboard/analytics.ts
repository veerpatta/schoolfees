import "server-only";

import { cacheSafeUnstableCache, getCacheSafeClient } from "@/lib/supabase/cache-safe";
import { DASHBOARD_STALENESS_CEILING_SECONDS } from "@/lib/dashboard/cache-contract";

/**
 * Everything the dashboard shows below the money band, in one round trip.
 *
 * Every money field here is FEES ONLY unless its name says late fee. That is
 * the contract the late-fee split exists to enforce (20260812120000): a panel
 * that adds the two together is the bug this whole change was about.
 */

export type DebtAgeBucket = {
  bucket: "0-30" | "31-60" | "61-90" | "90+";
  feesPending: number;
  rows: number;
  students: number;
};

export type LateFeeWaiverSource = {
  /** `grandfather` and `migration` are automatic; the rest were decisions. */
  source: "manual" | "payment_desk" | "migration" | "grandfather" | "repayment_plan";
  rows: number;
  students: number;
  amount: number;
};

export type DashboardLateFeeLedger = {
  charged: number;
  waived: number;
  pending: number;
  studentsWithPending: number;
  byWaiverSource: LateFeeWaiverSource[];
  /** What lands on the next due date if nobody pays and nobody waives. */
  nextAccrual: {
    dueDate: string | null;
    amount: number;
    installments: number;
  };
};

export type MonthlyCollectionPoint = {
  /** `YYYY-MM`. */
  month: string;
  amount: number;
  receipts: number;
  students: number;
  byMode: Record<string, number>;
};

export type ClassRecoveryRow = {
  classId: string;
  classLabel: string;
  expected: number;
  collected: number;
  feesPending: number;
  lateFeePending: number;
  studentsAtRisk: number;
  students: number;
  recoveryRate: number;
};

export type DebtConcentration = {
  studentsWithDues: number;
  totalPending: number;
  top10Amount: number;
  top10Pct: number;
  top50Amount: number;
  top50Pct: number;
};

/** Same shape as DashboardRouteSummaryRow, grouped in SQL instead of Node. */
export type RouteRecoveryRow = {
  routeId: string | null;
  routeLabel: string;
  studentCount: number;
  expectedAmount: number;
  collectedAmount: number;
  pendingAmount: number;
  collectionRate: number;
};

export type DiscountPolicyRollup = {
  /** The label SET that applied, e.g. "Staff Child, 3rd Child Policy". */
  label: string;
  students: number;
  amount: number;
};

export type DashboardDiscounts = {
  /** Conventional + manual. NEVER includes close-outs. */
  totalDiscount: number;
  conventionalDiscount: number;
  manualDiscount: number;
  studentsWithDiscount: number;
  byPolicy: DiscountPolicyRollup[];
  /**
   * Discount-mode write-offs. A close-out clears a pending balance rather than
   * reducing what was owed, so it rides here and is never summed into
   * totalDiscount — the same line lib/money/glossary.ts draws.
   */
  closeouts: { amount: number; students: number };
};

export type DashboardAnalytics = {
  sessionLabel: string;
  debtAge: DebtAgeBucket[];
  lateFee: DashboardLateFeeLedger;
  monthlyCollection: MonthlyCollectionPoint[];
  classRecovery: ClassRecoveryRow[];
  routeRecovery: RouteRecoveryRow[];
  concentration: DebtConcentration;
  discounts: DashboardDiscounts;
};

const EMPTY_ANALYTICS: DashboardAnalytics = {
  sessionLabel: "",
  debtAge: [],
  lateFee: {
    charged: 0,
    waived: 0,
    pending: 0,
    studentsWithPending: 0,
    byWaiverSource: [],
    nextAccrual: { dueDate: null, amount: 0, installments: 0 },
  },
  monthlyCollection: [],
  classRecovery: [],
  routeRecovery: [],
  concentration: {
    studentsWithDues: 0,
    totalPending: 0,
    top10Amount: 0,
    top10Pct: 0,
    top50Amount: 0,
    top50Pct: 0,
  },
  discounts: {
    totalDiscount: 0,
    conventionalDiscount: 0,
    manualDiscount: 0,
    studentsWithDiscount: 0,
    byPolicy: [],
    closeouts: { amount: 0, students: 0 },
  },
};

function getSchoolDateStamp(referenceDate = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);
}

/**
 * Fills in anything the payload is missing.
 *
 * Applied to cached values as well as fresh ones, and that is the point: a
 * cached object's SHAPE outlives the deploy that wrote it. When routeRecovery
 * was added, entries written minutes earlier were still being served without
 * it, and `analytics.routeRecovery.length` threw inside the board -- caught by
 * the error boundary, so the whole below-fold area went blank. The key is
 * versioned below so that cannot recur, but a normalizer that runs on the way
 * out means the next field to be added degrades to an empty panel instead of
 * taking the dashboard down.
 */
function normalizeAnalytics(
  payload: Partial<DashboardAnalytics> | null | undefined,
  sessionLabel: string,
): DashboardAnalytics {
  if (!payload) return { ...EMPTY_ANALYTICS, sessionLabel };
  return {
    ...EMPTY_ANALYTICS,
    ...payload,
    sessionLabel: payload.sessionLabel ?? sessionLabel,
    lateFee: {
      ...EMPTY_ANALYTICS.lateFee,
      ...(payload.lateFee ?? {}),
      byWaiverSource: payload.lateFee?.byWaiverSource ?? [],
      nextAccrual: { ...EMPTY_ANALYTICS.lateFee.nextAccrual, ...(payload.lateFee?.nextAccrual ?? {}) },
    },
    concentration: { ...EMPTY_ANALYTICS.concentration, ...(payload.concentration ?? {}) },
    discounts: {
      ...EMPTY_ANALYTICS.discounts,
      ...(payload.discounts ?? {}),
      byPolicy: payload.discounts?.byPolicy ?? [],
      closeouts: { ...EMPTY_ANALYTICS.discounts.closeouts, ...(payload.discounts?.closeouts ?? {}) },
    },
    debtAge: payload.debtAge ?? [],
    monthlyCollection: payload.monthlyCollection ?? [],
    classRecovery: payload.classRecovery ?? [],
    routeRecovery: payload.routeRecovery ?? [],
  };
}

async function getDashboardAnalyticsUncached(sessionLabel: string): Promise<DashboardAnalytics> {
  try {
    const supabase = await getCacheSafeClient();
    const { data, error } = await supabase.rpc("get_dashboard_analytics", {
      p_session_label: sessionLabel,
    });

    if (error || !data) {
      return { ...EMPTY_ANALYTICS, sessionLabel };
    }

    return normalizeAnalytics(data as Partial<DashboardAnalytics>, sessionLabel);
  } catch {
    return { ...EMPTY_ANALYTICS, sessionLabel };
  }
}

/**
 * Bump whenever the shape of DashboardAnalytics changes.
 *
 * The data cache persists across deployments, so without this a new field is
 * absent from every entry written by the previous build until something busts
 * `session:{label}` -- which, for a session with no activity that day, may be
 * nobody.
 */
const ANALYTICS_SHAPE_VERSION = "v3-discounts";

/**
 * Never throws. The money band is rendered from a different call and must still
 * paint if this one fails -- a broken analytics panel is not a reason to show
 * the office a blank page on the morning they need the numbers.
 *
 * Cached on `session:{label}`, the same tag revalidateSessionFinance already
 * busts after every posting, plus the school date so the day rolls over on its
 * own. Without this every board switch was a fresh Mumbai round trip for a
 * rollup that only moves when money moves: measured 718ms cold, 28ms warm.
 * Same reasoning, and the same tag, as getShellPulse.
 */
export async function getDashboardAnalytics(sessionLabel: string): Promise<DashboardAnalytics> {
  try {
    const cached = await cacheSafeUnstableCache(
      async () => getDashboardAnalyticsUncached(sessionLabel),
      ["dashboard-analytics", ANALYTICS_SHAPE_VERSION, sessionLabel, getSchoolDateStamp()],
      // The tag is the fast path; the ceiling is the floor under it, for the
      // writers that cannot bust a tag at all (pg_cron charges EMI late fees
      // nightly from inside Postgres) and for the next call site that forgets.
      // See lib/dashboard/cache-contract.ts.
      { tags: [`session:${sessionLabel}`], revalidate: DASHBOARD_STALENESS_CEILING_SECONDS },
    )();
    return normalizeAnalytics(cached, sessionLabel);
  } catch {
    return { ...EMPTY_ANALYTICS, sessionLabel };
  }
}

/** The six boards. Order is the order of the switcher. */
export const DASHBOARD_VIEWS = [
  "overview",
  "collection",
  "recovery",
  "classes",
  "latefee",
  "discounts",
] as const;

export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

export function resolveDashboardView(value: string | string[] | undefined): DashboardView {
  // searchParams hands back string[] when a key repeats. Taking [0] rather than
  // stringifying avoids "overview,collection" silently falling through to the
  // default and hiding a bad link.
  const raw = Array.isArray(value) ? value[0] : value;
  return (DASHBOARD_VIEWS as readonly string[]).includes(raw ?? "")
    ? (raw as DashboardView)
    : "overview";
}

/**
 * How far back the phone's daily-collection chart looks, in days.
 *
 * A `?days=` link rather than client state, for the same reason the boards are
 * links: the dashboard is server-rendered under a hard gzip ceiling, and a
 * two-position toggle is not worth a client component.
 */
export const COLLECTION_WINDOWS = [14, 30] as const;

export type CollectionWindow = (typeof COLLECTION_WINDOWS)[number];

export function resolveCollectionWindow(value: string | string[] | undefined): CollectionWindow {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return (COLLECTION_WINDOWS as readonly number[]).includes(parsed)
    ? (parsed as CollectionWindow)
    : 14;
}

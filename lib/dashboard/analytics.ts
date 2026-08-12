import "server-only";

import { getCacheSafeClient } from "@/lib/supabase/cache-safe";

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

export type DashboardAnalytics = {
  sessionLabel: string;
  debtAge: DebtAgeBucket[];
  lateFee: DashboardLateFeeLedger;
  monthlyCollection: MonthlyCollectionPoint[];
  classRecovery: ClassRecoveryRow[];
  concentration: DebtConcentration;
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
  concentration: {
    studentsWithDues: 0,
    totalPending: 0,
    top10Amount: 0,
    top10Pct: 0,
    top50Amount: 0,
    top50Pct: 0,
  },
};

/**
 * Never throws. The dashboard's money band is rendered from a different call
 * and must still paint if this one fails -- a broken analytics panel is not a
 * reason to show the office a blank page on the morning they need the numbers.
 */
export async function getDashboardAnalytics(sessionLabel: string): Promise<DashboardAnalytics> {
  try {
    const supabase = await getCacheSafeClient();
    const { data, error } = await supabase.rpc("get_dashboard_analytics", {
      p_session_label: sessionLabel,
    });

    if (error || !data) {
      return { ...EMPTY_ANALYTICS, sessionLabel };
    }

    const payload = data as Partial<DashboardAnalytics>;
    return {
      ...EMPTY_ANALYTICS,
      ...payload,
      sessionLabel: payload.sessionLabel ?? sessionLabel,
      lateFee: { ...EMPTY_ANALYTICS.lateFee, ...(payload.lateFee ?? {}) },
      concentration: { ...EMPTY_ANALYTICS.concentration, ...(payload.concentration ?? {}) },
      debtAge: payload.debtAge ?? [],
      monthlyCollection: payload.monthlyCollection ?? [],
      classRecovery: payload.classRecovery ?? [],
    };
  } catch {
    return { ...EMPTY_ANALYTICS, sessionLabel };
  }
}

/** The five boards. Order is the order of the switcher. */
export const DASHBOARD_VIEWS = [
  "overview",
  "collection",
  "recovery",
  "classes",
  "latefee",
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

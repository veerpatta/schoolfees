"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  evaluateDashboardAnomalies,
  type DashboardAnomaly,
} from "@/lib/dashboard/anomaly-rules";
import type {
  DashboardClassSummaryRow,
  DashboardRecentPayment,
} from "@/lib/dashboard/summary";

const SHOWN_KEY = "vpps:dashboard-anomalies-shown";

function readShown(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(SHOWN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
}

function persistShown(shown: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SHOWN_KEY, JSON.stringify(Array.from(shown)));
  } catch {
    // Storage might be unavailable.
  }
}

function fireToast(anomaly: DashboardAnomaly) {
  toast({
    title: anomaly.title,
    description: anomaly.detail,
    action: (
      <Button asChild size="sm" variant="outline">
        <Link href={anomaly.reviewHref}>
          <AlertTriangle className="size-3.5" />
          Review
        </Link>
      </Button>
    ),
  });
}

export function AnomalyToaster({
  recentPayments,
  classSummary,
  todayIso,
}: {
  recentPayments: DashboardRecentPayment[];
  classSummary: DashboardClassSummaryRow[];
  todayIso: string;
}) {
  useEffect(() => {
    const anomalies = evaluateDashboardAnomalies({
      recentPayments,
      classSummary,
      todayIso,
    });
    if (anomalies.length === 0) return;
    const shown = readShown();
    const fresh = anomalies.filter((a) => !shown.has(a.key));
    if (fresh.length === 0) return;
    fresh.forEach((anomaly, index) => {
      window.setTimeout(() => fireToast(anomaly), index * 600);
      shown.add(anomaly.key);
    });
    persistShown(shown);
  }, [recentPayments, classSummary, todayIso]);

  return null;
}

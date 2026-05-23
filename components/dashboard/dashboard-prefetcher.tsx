"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { appendSessionParam } from "@/lib/navigation/session-href";

type DashboardPrefetcherProps = {
  sessionLabel: string;
  canPostPayments: boolean;
};

export function DashboardPrefetcher({
  sessionLabel,
  canPostPayments,
}: DashboardPrefetcherProps) {
  const router = useRouter();

  useEffect(() => {
    const nextHrefs = [
      canPostPayments ? "/protected/payments" : null,
      "/protected/defaulters",
    ].filter((href): href is string => Boolean(href));

    for (const href of nextHrefs) {
      router.prefetch(appendSessionParam(href, sessionLabel));
    }
  }, [canPostPayments, router, sessionLabel]);

  return null;
}

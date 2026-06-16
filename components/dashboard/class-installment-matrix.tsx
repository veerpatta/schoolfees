"use client";

import { useState } from "react";
import { formatInr } from "@/lib/helpers/currency";
import type { DashboardClassInstallmentPendingRow } from "@/lib/dashboard/summary";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Props = {
  matrix: DashboardClassInstallmentPendingRow[];
};

export function ClassInstallmentMatrixTable({ matrix }: Props) {
  const [showAll, setShowAll] = useState(false);

  if (matrix.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-surface-2/40 px-4 py-6 text-center text-sm text-muted-foreground">
        No class-wise installment pending data available.
      </div>
    );
  }

  // Get dynamic installments from the first row to determine column headers
  const installmentHeaders = matrix[0]?.installments || [];
  
  const displayedRows = showAll ? matrix : matrix.slice(0, 6);
  const hasMore = matrix.length > 6;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/70 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              <th className="px-4 py-3 font-medium">Class</th>
              {installmentHeaders.map((inst) => (
                <th key={`${inst.installmentNo}-${inst.installmentLabel}`} className="px-4 py-3 text-right font-medium">
                  {inst.installmentLabel}
                </th>
              ))}
              <th className="bg-surface-3/50 px-4 py-3 text-right font-semibold text-foreground">
                Total Pending
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {displayedRows.map((row) => (
              <tr key={row.classId} className="transition-colors hover:bg-surface-2/30">
                <td className="px-4 py-3 font-medium text-foreground">{row.classLabel}</td>
                {row.installments.map((inst) => (
                  <td
                    key={`${inst.installmentNo}-${inst.installmentLabel}`}
                    className={cn(
                      "px-4 py-3 text-right font-medium tabular",
                      inst.pendingAmount > 0 ? "text-warning" : "text-muted-foreground/40"
                    )}
                  >
                    {inst.pendingAmount > 0 ? formatInr(inst.pendingAmount) : "—"}
                  </td>
                ))}
                <td className="bg-surface-3/20 px-4 py-3 text-right font-bold tabular text-foreground">
                  {row.totalPendingAmount > 0 ? (
                    <span className="text-warning-foreground font-semibold">
                      {formatInr(row.totalPendingAmount)}
                    </span>
                  ) : (
                    <span className="text-success font-medium">Paid</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(!showAll)}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {showAll ? "Show less classes" : `Show all ${matrix.length} classes`}
          </Button>
        </div>
      )}
    </div>
  );
}

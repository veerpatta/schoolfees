import { formatInr } from "@/lib/helpers/currency";
import type { DashboardRouteSummaryRow } from "@/lib/dashboard/data";
import { cn } from "@/lib/utils";

type RouteCollectionHeatmapProps = {
  rows: DashboardRouteSummaryRow[];
};

function rateClass(rate: number) {
  if (rate >= 85) return "bg-success-soft text-success-soft-foreground";
  if (rate >= 65) return "bg-success-soft/60 text-foreground";
  if (rate >= 40) return "bg-warning-soft text-warning-soft-foreground";
  return "bg-destructive-soft text-destructive-soft-foreground";
}

export function RouteCollectionHeatmap({ rows }: RouteCollectionHeatmapProps) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2/70 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Route</th>
              <th className="px-3 py-2 font-medium text-right">Students</th>
              <th className="px-3 py-2 font-medium text-right">Expected</th>
              <th className="px-3 py-2 font-medium text-right">Collected</th>
              <th className="px-3 py-2 font-medium text-right">Pending</th>
              <th className="px-3 py-2 font-medium text-right">Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {rows.map((row) => (
              <tr key={row.routeId ?? row.routeLabel} className="transition-colors hover:bg-surface-2/40">
                <td className="px-3 py-2 font-medium text-foreground">{row.routeLabel}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.studentCount}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {formatInr(row.expectedAmount)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInr(row.collectedAmount)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                  {formatInr(row.pendingAmount)}
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={cn(
                      "inline-flex min-w-12 items-center justify-center rounded-md px-2 py-0.5 text-xs font-bold tabular-nums",
                      rateClass(row.collectionRate),
                    )}
                  >
                    {row.collectionRate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
